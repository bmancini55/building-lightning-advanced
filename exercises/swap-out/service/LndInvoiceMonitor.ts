import * as Bitcoin from "@node-lightning/bitcoin";
import { ILogger } from "@node-lightning/logger";
import { ILndClient } from "../../../shared/data/lnd/ILndClient";
import { Lnd } from "../../../shared/data/lnd/v0.12.1-beta/Types";
import { Request } from "./Request";

export type InvoiceChangedHandler = (hash: string) => void;

/**
 * Monitors invoice states and triggers callback for various invoice states.
 */
export class LndInvoiceMonitor {
    public logger: ILogger;
    public acceptedHandlers: Map<string, InvoiceChangedHandler> = new Map();
    public settledHandlers: Map<string, InvoiceChangedHandler> = new Map();

    constructor(logger: ILogger, readonly lnd: ILndClient) {
        this.logger = logger.sub(LndInvoiceMonitor.name);
    }

    /**
     * Constructs a HOLD invoice using the hash created by the loop-out
     * requestor. LND uses a default min_final_cltv_expiry of 40 blocks
     * so we will add an additional expiry period to allow our service
     * to handle the on-chain portion and still have a reasonable timeout
     * for the off-chain portion.
     * @param request
     * @returns
     */
    public async generateHoldInvoice(request: Request): Promise<string> {
        const DEFAULT_MIN_FINAL_EXPIRY = 40;
        const value = Bitcoin.Value.zero();
        value.add(request.loopOutSats);
        value.add(request.feeSats);

        const result = await this.lnd.addHoldInvoice({
            hash: request.hash,
            cltv_expiry: (DEFAULT_MIN_FINAL_EXPIRY + request.onChainCltvExpiryDelta).toString(),
            value: value.sats.toString(),
        });

        return result.payment_request;
    }

    /**
     * Settles the invoice given the preimage.
     * @param preimage
     */
    public async settleInvoice(preimage: Buffer): Promise<void> {
        await this.lnd.settleInvoice(preimage);
    }

    /**
     * Watches a specific invoice and calls handlers depending on the
     * state change of the invoice
     * @param hash
     * @param onAccepted
     * @param onSettled
     */
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
            this.logger.debug(`hash=${hash} status=${invoice.state}`);
            if (invoice.state === "ACCEPTED") {
                this._handle(this.acceptedHandlers, invoice);
            } else if (invoice.state === "SETTLED") {
                this._handle(this.settledHandlers, invoice);
            }
        });
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
