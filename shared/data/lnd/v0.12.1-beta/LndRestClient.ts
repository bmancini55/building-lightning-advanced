import https from "https";
import { ILndClient } from "../ILndClient";
import { Lnd } from "./Types";

/**
 * A domain specific REST client for LND. This class makes requests using
 * the macaroon and TLS cert provided in the constructor.
 */
export class LndRestClient implements ILndClient {
    constructor(readonly host: string, readonly macaroon: Buffer, readonly cert: Buffer) {}

    /**
     * GetInfo returns general information concerning the lightning node including it's identity
     * pubkey, alias, the chains it is connected to, and information concerning the number of
     * open+pending channels.
     * Reference: https://api.lightning.community/#getinfo
     * @returns
     */
    public async getInfo(): Promise<Lnd.Info> {
        throw new Error("Method not implemented.");
    }

    /**
     * AddInvoice attempts to add a new invoice to the invoice database. Any duplicated invoices
     * are rejected, therefore all invoices must have a unique payment preimage.
     * Reference: https://api.lightning.community/?shell#addinvoice
     * @param options
     * @returns
     */
    public async addInvoice(options: Lnd.AddInvoiceInput): Promise<Lnd.AddInvoiceResult> {
        throw new Error("Method not implemented.");
    }

    /**
     * ListInvoices returns a list of all the invoices currently stored within the database. Any
     * active debug invoices are ignored. It has full support for paginated responses, allowing
     * users to query for specific invoices through their add_index. This can be done by using
     * either the first_index_offset or last_index_offset fields included in the response as the
     * index_offset of the next request. By default, the first 100 invoices created will be
     * returned. Backwards pagination is also supported through the Reversed flag.
     * Reference: https://api.lightning.community/?shell#listinvoices
     * @param options
     * @returns
     */
    public async listInvoices(
        options: Partial<Lnd.ListInvoicesRequest>,
    ): Promise<Lnd.ListInvoiceResponse> {
        throw new Error("Method not implemented.");
    }

    /**
     * SubscribeInvoices returns a uni-directional stream (server -> client) for notifying the
     * client of newly added/settled invoices. The caller can optionally specify the add_index
     * and/or the settle_index. If the add_index is specified, then we'll first start by sending
     * add invoice events for all invoices with an add_index greater than the specified value. If
     * the settle_index is specified, the next, we'll send out all settle events for invoices with
     * a settle_index greater than the specified value. One or both of these fields can be set. If
     * no fields are set, then we'll only send out the latest add/settle events.
     * References: https://api.lightning.community/?javascript#subscribecustommessages
     * @param cb
     * @param options
     * @returns
     */
    public async subscribeInvoices(
        cb: (invoice: Lnd.Invoice) => void,
        options: Partial<Lnd.SubscribeInvoicesOptions>,
    ) {
        throw new Error("Method not implemented.");
    }

    /**
     * SignMessage signs a message with this node's private key. The returned signature string is
     * zbase32 encoded and pubkey recoverable, meaning that only the message digest and signature
     * are needed for verification.
     * @param msg
     */
    public async signMessage(msg: Buffer): Promise<Lnd.SignMessageResponse> {
        throw new Error("Method not implemented.");
    }

    /**
     * VerifyMessage verifies a signature over a msg. The signature must be zbase32 encoded and
     * signed by an active node in the resident node's channel database. In addition to returning
     * the validity of the signature, VerifyMessage also returns the recovered pubkey from the
     * signature.
     * @param options
     * @returns
     */
    public async verifyMessage(msg: Buffer, signature: string): Promise<Lnd.VerifyMessageResponse> {
        throw new Error("Method not implemented.");
    }

    /**
     * Obtains the latest graph state from point of view of the node.
     * Returns nodes and channel edges.
     * @returns
     */
    public async getGraph(): Promise<Lnd.Graph> {
        return this.get("/v1/graph");
    }

    /**
     * Initiates a streaming RPC that provides updates to changes in the
     * graph state from the point of view of the node. Includes events
     * for new nodes coming online, nodes updating their information, new
     * channels being advertised, updates to routing policy for each
     * direction of the channel, and when channels are closed.
     * @param cb
     * @returns
     */
    public subscribeGraph(cb: (update: Lnd.GraphUpdate) => void): Promise<void> {
        const path = "/v1/graph/subscribe";
        return new Promise((resolve, reject) => {
            const url = `${this.host}${path}`;
            const options = {
                headers: {
                    "grpc-metadata-macaroon": this.macaroon.toString("hex"),
                },
                ca: this.cert,
            };
            const req = https.request(url, options, res => {
                res.on("data", buf => {
                    cb(JSON.parse(buf.toString()));
                });
                res.on("end", () => {
                    resolve(null);
                });
            });
            req.on("error", reject);
            req.end();
        });
    }

    /**
     * Helper function for making HTTP GET requests to the LND node's
     * REST API. This method includes the the macaroon provided at
     * instance construction and connects using the node's TLS certificate.
     * @param path API path, ex: /api/graph
     * @returns
     */
    public async get<T>(path: string): Promise<T> {
        return new Promise((resolve, reject) => {
            const url = `${this.host}${path}`;
            const options = {
                headers: {
                    "grpc-metadata-macaroon": this.macaroon.toString("hex"),
                },
                ca: this.cert,
            };
            const req = https.request(url, options, res => {
                const bufs: Buffer[] = [];
                res.on("data", buf => {
                    bufs.push(buf);
                });
                res.on("end", () => {
                    const result = Buffer.concat(bufs);
                    resolve(JSON.parse(result.toString("utf-8")));
                });
            });
            req.on("error", reject);
            req.end();
        });
    }
}
