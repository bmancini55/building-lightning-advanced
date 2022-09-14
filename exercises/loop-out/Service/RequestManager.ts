import { ILogger } from "@node-lightning/logger";
import * as Bitcoin from "@node-lightning/bitcoin";
import * as Bitcoind from "@node-lightning/bitcoind";
import { createHtlcDescriptor } from "../CreateHtlcDescriptor";
import { Wallet } from "../Wallet";
import { LndInvoiceMonitor } from "./LndInvoiceMonitor";
import { Request } from "./Request";
import { RequestState } from "./RequestState";
import { BlockMonitor } from "../BlockMonitor";

export class RequestManager {
    public feeSats: number;
    public bestHeight: number;
    public requests: Map<string, Request>;

    constructor(
        readonly logger: ILogger,
        readonly invoiceAdapter: LndInvoiceMonitor,
        readonly blockMonitor: BlockMonitor,
        readonly wallet: Wallet,
    ) {
        this.feeSats = 1000;
        this.requests = new Map();
        this.blockMonitor.addConnectedHandler(this.onBlockConnected.bind(this));
    }

    /**
     * Starts the process for a loop out by generating and invoice that
     * can be provided to the remote party.
     * @param request
     */
    public async addRequest(request: Request): Promise<void> {
        this.requests.set(request.hash.toString("hex"), request);

        // create the invoice
        request.ourKey = this.wallet.createKey();
        request.feeSats = Bitcoin.Value.fromSats(1000);
        request.finalCltvExpiryDelta = 40;
        request.paymentRequest = await this.invoiceAdapter.generateHoldInvoice(request);
        this.logger.debug("generated payment_request", request.paymentRequest);

        // watch for invoice changes
        await this.invoiceAdapter.watch(
            request.hashHex,
            this.onHtlcAccepted.bind(this),
            this.onHtlcSettled.bind(this),
        );
        request.state = RequestState.AwaitingIncomingHtlcAccepted;
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
        request.htlcOutpoint = new Bitcoin.OutPoint(tx.txId, 0);

        // broadcast the transaction
        await this.wallet.sendTx(tx);

        request.state = RequestState.AwaitingOutgoingHtlcSettlement;
    }

    public async onHtlcSettled(hash: string): Promise<void> {
        const request = this.requests.get(hash);
        if (!request) {
            this.logger.warn("HTLC settled but failed to find loop-out request", hash);
        }

        request.state = RequestState.Complete;
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
        const htlcOutPoints = new Set(
            Array.from(this.requests.values()).map(p => p.htlcOutpoint.toString()),
        );
        for (const tx of block.tx) {
            for (const input of tx.vin) {
                if (htlcOutPoints.has(`${input.txid}:${input.vout}`)) {
                    await this.processHtlcSettlement(input);
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

    protected createHtlcTx(request: Request): Bitcoin.Tx {
        const ourPubKey = request.ourKey.toPubKey(true);
        const theirAddressDecoded = Bitcoin.Address.decodeBech32(request.theirAddress);

        const txBuilder = new Bitcoin.TxBuilder();

        // add the htlc output
        const htlcScriptPubKey = createHtlcDescriptor(
            request.hash,
            theirAddressDecoded.program,
            ourPubKey.hash160(),
        );
        txBuilder.addOutput(request.loopOutSats, Bitcoin.Script.p2wshLock(htlcScriptPubKey));
        txBuilder.locktime = Bitcoin.LockTime.zero();

        // fund the transaction from our wallet
        this.wallet.fundTx(txBuilder);

        return txBuilder.toTx();
    }
}
