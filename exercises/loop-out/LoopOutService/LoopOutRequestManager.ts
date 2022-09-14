import { ILogger } from "@node-lightning/logger";
import * as Bitcoin from "@node-lightning/bitcoin";
import * as Bitcoind from "@node-lightning/bitcoind";
import { sha256 } from "../../../shared/Sha256";
import { createHtlcDescriptor } from "../CreateHtlcDescriptor";
import { Wallet } from "../Wallet";
import { LndInvoiceAdapter } from "./LndInvoiceAdapter";
import { LoopOutRequest } from "./LoopOutRequest";
import { LoopOutRequestState } from "./LoopOutRequestState";

export class LoopOutRequestManager {
    public feeSats: number;
    public bestHeight: number;
    public requests: Map<string, LoopOutRequest>;

    constructor(
        readonly logger: ILogger,
        readonly invoiceAdapter: LndInvoiceAdapter,
        readonly wallet: Wallet,
    ) {
        this.feeSats = 1000;
        this.requests = new Map();
    }

    /**
     * Starts the process for a loop out by generating and invoice that
     * can be provided to the remote party.
     * @param request
     */
    public async addRequest(request: LoopOutRequest): Promise<void> {
        this.requests.set(request.hash, request);

        // create the invoice
        request.ourKey = this.wallet.createKey();
        request.feeSats = 1000;
        request.finalCltvExpiryDelta = 40;
        request.paymentRequest = await this.invoiceAdapter.generateHoldInvoice(request);
        this.logger.debug("generated payment_request", request.paymentRequest);

        // watch for invoice changes
        await this.invoiceAdapter.watch(request.hash, this.onHtlcAccepted.bind(this));
        request.state = LoopOutRequestState.AwaitingIncomingHtlcAccepted;
    }

    /**
     * Need some adapter that converts
     */
    public async onHtlcAccepted(hash: string): Promise<void> {
        this.logger.info("HTLC accepted", hash);
        const request = this.requests.get(hash);
        if (!request) {
            this.logger.warn("HTLC accept failed but failed to find loop-out request", hash);
            return;
        }

        // validate we aren't expired

        // create htlc transaction
        const tx = await this.createHtlcTx(request);
        request.htlcTxId = tx.txId.toString();

        // broadcast the transaction
        await this.wallet.sendTx(tx);

        request.state = LoopOutRequestState.AwaitingOutgoingHtlcSettlement;
    }

    /**
     *
     * @param block
     */
    public async onBlockConnected(block: Bitcoind.Block) {
        this.bestHeight = block.height;

        // process for settlements
        await this.checkBlockForSettlements(block);
    }

    protected async checkBlockForSettlements(block: Bitcoind.Block): Promise<void> {
        const htlcTxIds = new Set(Array.from(this.requests.values()).map(p => p.htlcTxId));
        for (const tx of block.tx) {
            for (const input of tx.vin) {
                if (htlcTxIds.has(input.txid)) {
                    if (input.vout === 0) {
                        await this.processHtlcSettlement(input);
                    }
                }
            }
        }
    }

    protected async processHtlcSettlement(input: Bitcoind.Input): Promise<void> {
        // extract preimage from witness data
        const preimage = Buffer.from(input.txinwitness[2], "hex");

        // settle invoice
        if (preimage.length) {
            await this.invoiceAdapter.settleInvoice(preimage);

            // hash
            const hash = sha256(preimage).toString("hex");
            const request = this.requests.get(hash);
            request.state = LoopOutRequestState.Complete;
            this.requests.delete(hash);
            this.logger.info("loop out request complete!");
        }
    }

    protected createHtlcTx(request: LoopOutRequest): Bitcoin.Tx {
        const ourPubKey = request.ourKey.toPubKey(true);
        const theirAddressDecoded = Bitcoin.Address.decodeBech32(request.theirAddress);

        const txBuilder = new Bitcoin.TxBuilder();

        // add the htlc output
        const htlcScriptPubKey = createHtlcDescriptor(
            Buffer.from(request.hash, "hex"),
            theirAddressDecoded.program,
            ourPubKey.hash160(),
        );
        txBuilder.addOutput(
            Bitcoin.Value.fromSats(request.loopOutSats),
            Bitcoin.Script.p2wshLock(htlcScriptPubKey),
        );
        txBuilder.locktime = Bitcoin.LockTime.zero();

        // fund the transaction from our wallet
        this.wallet.fundTx(txBuilder);

        return txBuilder.toTx();
    }
}
