/* eslint-disable @typescript-eslint/no-explicit-any */
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import { Lnd } from "./Types";
import { promisify } from "util";
import { ILndClient } from "../ILndClient";

process.env.GRPC_SSL_CIPHER_SUITES = "HIGH+ECDSA";

/**
 * A domain specific RPC client for LND. This class makes requests using
 * the macaroon and TLS cert provided in the constructor. This class is
 * based on instructions for creating a GRPC client from
 * https://github.com/lightningnetwork/lnd/blob/master/docs/grpc/javascript.md
 */
export class LndRpcClient implements ILndClient {
    protected lightning: any;
    protected invoices: any;
    protected router: any;

    constructor(host: string, macaroon: Buffer, cert: Buffer) {
        const loaderOptions = {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true,
        };
        const lightningPath = path.join(__dirname, "lightning.proto");
        const invoicesPath = path.join(__dirname, "invoices.proto");
        const routerPath = path.join(__dirname, "router.proto");
        const packageDefinition = protoLoader.loadSync(
            [lightningPath, invoicesPath, routerPath],
            loaderOptions,
        );
        const definition: any = grpc.loadPackageDefinition(packageDefinition);

        const metadata = new grpc.Metadata();
        metadata.add("macaroon", macaroon.toString("hex"));
        const macaroonCreds = grpc.credentials.createFromMetadataGenerator((_args, callback) => {
            callback(null, metadata);
        });
        const sslCreds = grpc.credentials.createSsl(cert);
        const credentials = grpc.credentials.combineChannelCredentials(sslCreds, macaroonCreds);

        this.lightning = new definition.lnrpc.Lightning(host, credentials);
        this.invoices = new definition.invoicesrpc.Invoices(host, credentials);
        this.router = new definition.routerrpc.Router(host, credentials);
    }

    /**
     * GetInfo returns general information concerning the lightning node including it's identity
     * pubkey, alias, the chains it is connected to, and information concerning the number of
     * open+pending channels.
     * Reference: https://api.lightning.community/#getinfo
     * @returns
     */
    public getInfo(): Promise<Lnd.Info> {
        return promisify(this.lightning.getInfo.bind(this.lightning))({});
    }

    /**
     * AddInvoice attempts to add a new invoice to the invoice database. Any duplicated invoices
     * are rejected, therefore all invoices must have a unique payment preimage.
     * Reference: https://api.lightning.community/?shell#addinvoice
     * @param options
     * @returns
     */
    public addInvoice(options: Lnd.AddInvoiceInput): Promise<Lnd.AddInvoiceResult> {
        const invoice = {
            memo: options.memo ?? "",
            r_preimage: options.preimage?.toString("base64"),
            value: options.amt,
            value_msat: options.amt_msat,
            description_hash: options.description_hash,
            export: options.expiry ?? 3600,
            fallback_addr: options.fallback_addr,
            private: options.private,
        };
        return promisify(this.lightning.addInvoice.bind(this.lightning))(invoice);
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
    public listInvoices(
        options: Partial<Lnd.ListInvoicesRequest> = {},
    ): Promise<Lnd.ListInvoiceResponse> {
        return promisify(this.lightning.listInvoices.bind(this.lightning))(options);
    }

    /**
     * LookupInvoice attempts to look up an invoice according to its payment hash. The passed
     * payment hash must be exactly 32 bytes, if not, an error is returned.
     * @param r_hash_str
     * @returns
     */
    public lookupInvoice(r_hash_str: string): Promise<Lnd.Invoice> {
        return promisify(this.lightning.lookupInvoice.bind(this.lightning))({ r_hash_str });
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
    public subscribeInvoices(
        cb: (invoice: Lnd.Invoice) => void,
        options: Partial<Lnd.SubscribeInvoicesOptions> = {},
    ) {
        return new Promise(resolve => {
            const call = this.lightning.subscribeInvoices(options);
            call.on("data", cb);
            call.on("end", resolve);
        });
    }

    /**
     * SignMessage signs a message with this node's private key. The returned signature string is
     * zbase32 encoded and pubkey recoverable, meaning that only the message digest and signature
     * are needed for verification.
     * @param msg
     */
    public signMessage(msg: Buffer): Promise<Lnd.SignMessageResponse> {
        const options = {
            msg,
        };
        return promisify(this.lightning.signMessage.bind(this.lightning))(options);
    }

    /**
     * VerifyMessage verifies a signature over a msg. The signature must be zbase32 encoded and
     * signed by an active node in the resident node's channel database. In addition to returning
     * the validity of the signature, VerifyMessage also returns the recovered pubkey from the
     * signature.
     * @param options
     * @returns
     */
    public verifyMessage(msg: Buffer, signature: string): Promise<Lnd.VerifyMessageResponse> {
        const options = {
            msg,
            signature,
        };
        return promisify(this.lightning.verifyMessage.bind(this.lightning))(options);
    }

    /**
     * Obtains the latest graph state from point of view of the node.
     * Returns nodes and channel edges.
     * @returns
     */
    public getGraph(): Promise<Lnd.Graph> {
        throw new Error("Not implemented");
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
        throw new Error("Not implemented");
    }

    /**
     * AddHoldInvoice creates a hold invoice. It ties the invoice to the hash supplied in the request.
     * Reference: https://api.lightning.community/#addholdinvoice
     * @param options
     * @returns
     */
    public addHoldInvoice(options: Lnd.AddHoldInvoiceInput): Promise<Lnd.AddHoldInvoiceResult> {
        const invoice = {
            hash: options.hash,
            memo: options.memo,
            value: options.value,
            value_msat: options.value_msat,
            description_hash: options.description_hash,
            export: options.expiry,
            fallback_addr: options.fallback_addr,
            private: options.private,
        };
        return promisify(this.invoices.addHoldInvoice.bind(this.invoices))(invoice);
    }

    /**
     * CancelInvoice cancels a currently open invoice. If the invoice is already canceled, this call
     * will succeed. If the invoice is (already settled, it will fail.
     * Reference: https://api.lightning.community/#cancelinvoice
     * @param payment_hash
     * @returns
     */
    public cancelInvoice(payment_hash: Buffer): Promise<void> {
        const options = {
            payment_hash,
        };
        return promisify(this.invoices.cancelInvoice.bind(this.invoices))(options);
    }

    /**
     * SettleInvoice settles an accepted invoice. If the invoice is already settled, this call will
     * succeed.
     * Reference: https://api.lightning.community/#settleinvoice
     * @param preimage
     * @returns
     */
    public settleInvoice(preimage: Buffer): Promise<void> {
        const options = {
            preimage,
        };
        return promisify(this.invoices.settleInvoice.bind(this.invoices))(options);
    }

    /**
     * SendPaymentV2 attempts to route a payment described by the passed PaymentRequest to the final
     * destination. The call returns a stream of payment updates.
     * @param request
     * @returns
     */
    public sendPaymentV2(
        request: Partial<Lnd.SendPaymentRequest>,
        cb: (payment: Lnd.Payment) => void,
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const stream = this.router.sendPaymentV2(request);
            stream.on("data", d => cb(d));
            stream.on("error", reject);
            stream.on("end", resolve);
        });
    }

    /**
     * BuildRoute builds a fully specified route based on a list of hop public keys. It retrieves
     * the relevant channel policies from the graph in order to calculate the correct fees and time locks.
     * @param request
     * @returns
     */
    public async buildRoute(
        request: Partial<Lnd.BuildRouteRequest>,
    ): Promise<Lnd.BuildRouteResponse> {
        return promisify(this.router.buildRoute.bind(this.router))(request);
    }

    /**
     * SendToRouteV2 attempts to make a payment via the specified route. This method differs from
     * SendPayment in that it allows users to specify a full route manually. This can be used for
     * things like rebalancing, and atomic swaps.
     * @param payment_hash
     * @param route
     * @param skip_temp_err
     * @returns
     */
    public async sendToRouteV2(
        payment_hash: Buffer,
        route: Lnd.Route,
        skip_temp_err = false,
    ): Promise<Lnd.HtlcAttempt> {
        const options = {
            payment_hash,
            route,
            skip_temp_err,
        };
        return promisify(this.router.sendToRouteV2.bind(this.router))(options);
    }

    /**
     * ListChannels returns a description of all the open channels that this node is a participant in.
     * @param options
     */
    public async listChannels(
        options: Partial<Lnd.ListChannelsRequest> = {},
    ): Promise<Lnd.ListChannelsResponse> {
        return promisify(this.lightning.listChannels.bind(this.lightning))(options);
    }

    /**
     * SubscribeSingleInvoice returns a uni-directional stream (server -> client) to notify the
     * client of state transitions of the specified invoice. Initially the current invoice state is
     * always sent out.
     * @param request
     * @param cb
     * @returns
     */
    public subscribeSingleInvoice(
        request: Lnd.SubscribeSingleInvoiceRequest,
        cb: (invoice: Lnd.Invoice) => void,
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const stream = this.invoices.subscribeSingleInvoice(request);
            stream.on("data", d => cb(d));
            stream.on("error", reject);
            stream.on("end", resolve);
        });
    }
}
