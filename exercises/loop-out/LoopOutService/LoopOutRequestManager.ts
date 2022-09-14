import { ILogger } from "@node-lightning/logger";
import * as Bitcoin from "@node-lightning/bitcoin";
import * as Bitcoind from "@node-lightning/bitcoind";
import { createHtlcDescriptor } from "../CreateHtlcDescriptor";
import { Wallet } from "../Wallet";
import { LndInvoiceMonitor } from "./LndInvoiceMonitor";
import { LoopOutRequest } from "./LoopOutRequest";
import { LoopOutRequestState } from "./LoopOutRequestState";

export class LoopOutRequestManager {
    public feeSats: number;
    public bestHeight: number;
    public requests: Map<string, LoopOutRequest>;

    constructor(
        readonly logger: ILogger,
        readonly invoiceAdapter: LndInvoiceMonitor,
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
        await this.invoiceAdapter.watch(
            request.hash,
            this.onHtlcAccepted.bind(this),
            this.onHtlcSettled.bind(this),
        );
        request.state = LoopOutRequestState.AwaitingIncomingHtlcAccepted;
    }

    public async onHtlcAccepted(hash: string): Promise<void> {
        this.logger.info("HTLC accepted", hash);
        const request = this.requests.get(hash);
        if (!request) {
            this.logger.warn(hash, "HTLC accepted but failed to find loop-out request", hash);
            return;
        }

        // create htlc transaction
        const tx = await this.createHtlcTx(request);
        request.htlcTxId = tx.txId.toString();

        // broadcast the transaction
        await this.wallet.sendTx(tx);

        request.state = LoopOutRequestState.AwaitingOutgoingHtlcSettlement;
    }

    public async onHtlcSettled(hash: string): Promise<void> {
        const request = this.requests.get(hash);
        if (!request) {
            this.logger.warn("HTLC settled but failed to find loop-out request", hash);
        }

        request.state = LoopOutRequestState.Complete;
        this.requests.delete(hash);
        this.logger.info(`COMPLETE! hash=${hash}`);
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
