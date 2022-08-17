import "dotenv/config";
import fs from "fs/promises";

/**
 * Options and configurations used by the application
 */
export class Options {
    /**
     * Constructs an Options instance from environment variables
     * @returns
     */
    public static async fromEnv(): Promise<Options> {
        const port = Number(process.env.PORT);
        const lndRestHost = process.env.LND_REST_HOST;
        const lndRpcHost = process.env.LND_RPC_HOST;
        const lndCert = await fs.readFile(process.env.LND_CERT_PATH);

        let lndAdminMacaroon: Buffer;
        if (process.env.LND_ADMIN_MACAROON_PATH) {
            lndAdminMacaroon = await fs.readFile(process.env.LND_ADMIN_MACAROON_PATH);
        }

        let lndInvoiceMacaroon: Buffer;
        if (process.env.LND_INVOICE_MACAROON_PATH) {
            lndInvoiceMacaroon = await fs.readFile(process.env.LND_INVOICE_MACAROON_PATH);
        }

        let lndReadonlyMacaroon: Buffer;
        if (process.env.LND_READONLY_MACAROON_PATH) {
            lndReadonlyMacaroon = await fs.readFile(process.env.LND_READONLY_MACAROON_PATH);
        }

        return new Options(
            port,
            lndRestHost,
            lndRpcHost,
            lndCert,
            lndAdminMacaroon,
            lndInvoiceMacaroon,
            lndReadonlyMacaroon,
        );
    }

    constructor(
        readonly port: number,
        readonly lndRestHost?: string,
        readonly lndRpcHost?: string,
        readonly lndCert?: Buffer,
        readonly lndAdminMacaroon?: Buffer,
        readonly lndInvoiceMacaroon?: Buffer,
        readonly lndReadonlyMacaroon?: Buffer,
    ) {}
}
