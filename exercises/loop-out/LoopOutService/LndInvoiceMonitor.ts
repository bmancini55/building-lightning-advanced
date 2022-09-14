import { ILogger } from "@node-lightning/logger";
import { ILndClient } from "../../../shared/data/lnd/ILndClient";
import { Lnd } from "../../../shared/data/lnd/v0.12.1-beta/Types";
import { LoopOutRequest } from "./LoopOutRequest";

export type InvoiceChangedHandler = (hash: string) => void;

export class LndInvoiceMonitor {
    public logger: ILogger;
    public acceptedHandlers: Map<string, InvoiceChangedHandler> = new Map();
    public settledHandlers: Map<string, InvoiceChangedHandler> = new Map();

    constructor(logger: ILogger, readonly lnd: ILndClient) {
        this.logger = logger.sub(LndInvoiceMonitor.name);
    }

    public async watch(
        hash: string,
        onAccepted?: InvoiceChangedHandler,
        onSettled?: InvoiceChangedHandler,
    ): Promise<void> {
        // attach the handlers
        if (onAccepted) this.acceptedHandlers.set(hash, onAccepted);
        if (onSettled) this.settledHandlers.set(hash, onSettled);

        // subscribe to the invoice
        this.lnd.subscribeSingleInvoice({ r_hash: Buffer.from(hash, "hex") }, invoice => {
            this.logger.info(`hash=${hash} status=${invoice.state}`);
            if (invoice.state === "ACCEPTED") {
                this._handle(this.acceptedHandlers, invoice);
            } else if (invoice.state === "SETTLED") {
                this._handle(this.settledHandlers, invoice);
            }
        });
    }

    /**
     * Constructs a HOLD invoice using the hash created by the loop out claimaint
     * @param request
     * @returns
     */
    public async generateHoldInvoice(request: LoopOutRequest): Promise<string> {
        const result = await this.lnd.addHoldInvoice({
            hash: Buffer.from(request.hash, "hex"),
            cltv_expiry: (40 + request.finalCltvExpiryDelta).toString(),
            value: (request.loopOutSats + request.feeSats).toString(),
        });
        return result.payment_request;
    }

    public async settleInvoice(preimage: Buffer): Promise<void> {
        await this.lnd.settleInvoice(preimage);
    }

    protected _handle(collection: Map<string, (hash: string) => void>, invoice: Lnd.Invoice) {
        const hash = invoice.r_hash.toString("hex");
        const handler = collection.get(hash);
        if (handler) {
            collection.delete(hash);
            handler(hash);
        }
    }
}
