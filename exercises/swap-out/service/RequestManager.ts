import { ILogger } from "@node-lightning/logger";
import * as Bitcoin from "@node-lightning/bitcoin";
import * as Bitcoind from "@node-lightning/bitcoind";
import { createHtlcDescriptor } from "../CreateHtlcDescriptor";
import { Wallet } from "../Wallet";
import { LndInvoiceMonitor } from "./LndInvoiceMonitor";
import { Request } from "./Request";
import { RequestState } from "./RequestState";
import { BlockMonitor } from "../BlockMonitor";

/**
 * Manages the lifecycle of a collection of `Request` objects. This class
 * interfaces with `InvoiceMonitor` and a `BlockMonitor` to translate
 * invoice and block events into state changes for an individual request.
 */
export class RequestManager {
    public feeSats: number;
    public bestHeight: number;
    public requestLookup: Map<string, Request>;

    public get requests(): Request[] {
        return Array.from(this.requestLookup.values());
    }

    constructor(
        readonly logger: ILogger,
        readonly invoiceMonitor: LndInvoiceMonitor,
        readonly blockMonitor: BlockMonitor,
        readonly wallet: Wallet,
    ) {
        this.feeSats = 1000;
        this.requestLookup = new Map();
        this.blockMonitor.addConnectedHandler(this.onBlockConnected.bind(this));
    }

    /**
     * Starts the process for a swap-out by generating an invoice that
     * can be provided to the remote party.
     * @param request
     */
    public async addRequest(request: Request): Promise<void> {
        this.requestLookup.set(request.hash.toString("hex"), request);

        // Construct a refund key unique to the HTLC. This key can be used
        // to perform a timeout of the on-chain HTLC in the event the
        // requestor fails to claim the HTLC by providing the preimage.
        request.htlcRefundKey = this.wallet.createKey();

        // We'll collect 1000 satoshis for the benefits of using the
        // swap-out service. This fee will be reflected in the difference
        // between the invoice and the amount we include in the on-chain
        // HTLC.
        request.feeSats = Bitcoin.Value.fromSats(1000);

        // The LN side of the HTLC chain will have an expiry. We'll
        // increase the last LN HTLC expiry by an additional amount so
        // that our service can ensure the on-chain HTLC is complete
        // before the off-chain LN HTLC expires.
        request.onChainCltvExpiryDelta = 40;

        // Finally create an invoice for the request
        request.paymentRequest = await this.invoiceMonitor.generateHoldInvoice(request);
        request.logger.debug("generated payment_request", request.paymentRequest);

        // Start watching for invoice state changes
        await this.invoiceMonitor.watch(
            request.hashHex,
            this.onHtlcAccepted.bind(this),
            this.onHtlcSettled.bind(this),
        );

        request.state = RequestState.AwaitingIncomingHtlcAccepted;
    }

    /**
     * Handles HTLC acceptance events which are triggered when we receive
     * payment for a hold invoice. Once we receive this payment we can
     * trustlessly create the on-chain HTLC.
     * @param hash
     */
    protected async onHtlcAccepted(hash: string): Promise<void> {
        const request = this.requestLookup.get(hash);
        request.logger.info("event: htlc_accepted");

        // create htlc transaction
        request.logger.info("action: create on-chain htlc");
        const tx = await this.createHtlcTx(request);
        request.htlcOutpoint = new Bitcoin.OutPoint(tx.txId, 0);
        request.logger.debug("htlc transaction", tx.toHex());

        // broadcast the transaction
        await this.wallet.sendTx(tx);

        request.state = RequestState.AwaitingOutgoingHtlcSettlement;
    }

    /**
     * Handles HTLC settlement events which occur when our hold invoice
     * is finally settled. At this point the request is complete and we
     * are guaranteed that our Lightning channel has funds.
     * @param hash
     */
    protected async onHtlcSettled(hash: string): Promise<void> {
        const request = this.requestLookup.get(hash);
        request.logger.info("event: htlc_settled");
        request.state = RequestState.Complete;
        this.requestLookup.delete(hash);
    }

    /**
     * Handles block connection events by checking for HTLC settlements
     * or timeouts, however the latter is not implemented to keep this
     * code a reasonable length.
     * @param block
     */
    protected async onBlockConnected(block: Bitcoind.Block) {
        this.bestHeight = block.height;
        await this.checkBlockForSettlements(block);

        // TODO - exercise for the reader: implement the timeout logic!
    }

    /**
     * Check the block for settlements by looking at each input and seeing
     * if it corresponds to a request's HTLC outpoint that we previously
     * broadcast.
     * @param block
     */
    protected async checkBlockForSettlements(block: Bitcoind.Block): Promise<void> {
        for (const tx of block.tx) {
            for (const input of tx.vin) {
                // Ignore coinbase transactions
                if (!input.txid) continue;

                // Construct the outpoint used by the input
                const outpoint = new Bitcoin.OutPoint(input.txid, input.vout);

                // Find the request that corresponds to this HTLC spend
                const request = this.requests.find(
                    p => p.htlcOutpoint.toString() === outpoint.toString(),
                );

                // If we found a request we can now process the invoice
                if (request) {
                    await this.processClaimTransaction(input, request);
                }
            }
        }
    }

    /**
     * When we find an HTLC that was claimed by the swap-out requestor
     * we need to extract the preimage from the transaction to settle
     * our incoming off-chain LN HTLC!
     * @param input
     * @param request
     */
    protected async processClaimTransaction(input: Bitcoind.Input, request: Request) {
        request.logger.info("event: block_connected[htlc_spend]");

        // Extract the preimage from witness data. It will
        // always be the third witness value since the values
        // are [signature, pubkey, preimage]
        const preimage = Buffer.from(input.txinwitness[2], "hex");

        // Using the obtained preimage, settle the invoice so
        // we can receive our funds
        if (preimage.length) {
            request.logger.info("action: settle invoice, preimage=", preimage.toString("hex"));
            await this.invoiceMonitor.settleInvoice(preimage);
        }
    }

    /**
     * Constructs the HTLC transaction. This transaction will have a
     * single input that will be generated from our wallet. The first
     * output will be our HTLC.  The second output will be for change.
     * @param request
     * @returns
     */
    protected createHtlcTx(request: Request): Bitcoin.Tx {
        const ourPubKey = request.htlcRefundKey.toPubKey(true);
        const theirAddressDecoded = Bitcoin.Address.decodeBech32(request.htlcClaimAddress);

        const txBuilder = new Bitcoin.TxBuilder();

        // Add the HTLC output as n=0
        const htlcScriptPubKey = createHtlcDescriptor(
            request.hash,
            theirAddressDecoded.program,
            ourPubKey.hash160(),
        );
        txBuilder.addOutput(request.swapOutSats, Bitcoin.Script.p2wshLock(htlcScriptPubKey));

        // Fund the transaction using our wallet. This method will select
        // an available UTXO from the wallet, add a change output, and
        // sign the input to complete the transaction data.
        this.wallet.fundTx(txBuilder);

        return txBuilder.toTx();
    }
}
