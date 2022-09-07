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
    public static async fromEnv(prefix = ""): Promise<Options> {
        const lndRestHost = getEnv(prefix, "LND_REST_HOST");
        const lndRpcHost = getEnv(prefix, "LND_RPC_HOST");
        const lndCert = await fs.readFile(getEnv(prefix, "LND_CERT_PATH"));

        let lndAdminMacaroon: Buffer;
        if (getEnv(prefix, "LND_ADMIN_MACAROON_PATH")) {
            lndAdminMacaroon = await fs.readFile(getEnv(prefix, "LND_ADMIN_MACAROON_PATH"));
        }

        let lndInvoiceMacaroon: Buffer;
        if (getEnv(prefix, "LND_INVOICE_MACAROON_PATH")) {
            lndInvoiceMacaroon = await fs.readFile(getEnv(prefix, "LND_INVOICE_MACAROON_PATH"));
        }

        let lndReadonlyMacaroon: Buffer;
        if (getEnv(prefix, "LND_READONLY_MACAROON_PATH")) {
            lndReadonlyMacaroon = await fs.readFile(getEnv(prefix, "LND_READONLY_MACAROON_PATH"));
        }

        return new Options(
            lndRestHost,
            lndRpcHost,
            lndCert,
            lndAdminMacaroon,
            lndInvoiceMacaroon,
            lndReadonlyMacaroon,
        );
    }

    constructor(
        readonly lndRestHost?: string,
        readonly lndRpcHost?: string,
        readonly lndCert?: Buffer,
        readonly lndAdminMacaroon?: Buffer,
        readonly lndInvoiceMacaroon?: Buffer,
        readonly lndReadonlyMacaroon?: Buffer,
    ) {}
}

function getEnv(prefix: string, key: string) {
    return process.env[prefix + key];
}
