import { Lnd } from "./v0.12.1-beta/Types";

export interface ILndClient {
    getInfo(): Promise<Lnd.Info>;
    addInvoice(options: Lnd.AddInvoiceInput): Promise<Lnd.AddInvoiceResult>;
    listInvoices(options: Partial<Lnd.ListInvoicesRequest>): Promise<Lnd.ListInvoiceResponse>;
    subscribeInvoices(
        cb: (invoice: Lnd.Invoice) => void,
        options: Partial<Lnd.SubscribeInvoicesOptions>,
    );
    signMessage(msg: Buffer): Promise<Lnd.SignMessageResponse>;
    verifyMessage(msg: Buffer, signature: string): Promise<Lnd.VerifyMessageResponse>;

    getGraph(): Promise<Lnd.Graph>;
    subscribeGraph(cb: (update: Lnd.GraphUpdate) => void): Promise<void>;

    addHoldInvoice(options: Lnd.AddHoldInvoiceInput): Promise<Lnd.AddHoldInvoiceResult>;
    cancelInvoice(hash: Buffer): Promise<void>;
    settleInvoice(preimage: Buffer): Promise<void>;

    sendPaymentV2(
        request: Partial<Lnd.SendPaymentRequest>,
        cb: (payment: Lnd.Payment) => void,
    ): Promise<void>;

    buildRoute(request: Partial<Lnd.BuildRouteRequest>): Promise<Lnd.BuildRouteResponse>;
    sendToRouteV2(
        payment_hash: Buffer,
        route: Lnd.Route,
        skip_temp_err: boolean,
    ): Promise<Lnd.HtlcAttempt>;

    listChannels(options?: Partial<Lnd.ListChannelsRequest>): Promise<Lnd.ListChannelsResponse>;
}
