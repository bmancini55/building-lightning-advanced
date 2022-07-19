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

    constructor(host: string, macaroon: Buffer, cert: Buffer) {
        const loaderOptions = {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true,
        };
        const protoPath = path.join(__dirname, "rpc.proto");
        const packageDefinition = protoLoader.loadSync(protoPath, loaderOptions);
        const lnrpcDescriptor = grpc.loadPackageDefinition(packageDefinition);
        const lnrpc: any = lnrpcDescriptor.lnrpc;

        const metadata = new grpc.Metadata();
        metadata.add("macaroon", macaroon.toString("hex"));
        const macaroonCreds = grpc.credentials.createFromMetadataGenerator((_args, callback) => {
            callback(null, metadata);
        });
        const sslCreds = grpc.credentials.createSsl(cert);
        const credentials = grpc.credentials.combineChannelCredentials(sslCreds, macaroonCreds);

        this.lightning = new lnrpc.Lightning(host, credentials);
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
}
