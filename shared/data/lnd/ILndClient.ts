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
}
