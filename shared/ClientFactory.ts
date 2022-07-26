import { LndRpcClient } from "./data/lnd/v0.12.1-beta/LndRpcClient";
import { Options } from "./Options";
import { ILndClient } from "./data/lnd/ILndClient";

/**
 * Factory for creating clients
 */
export class ClientFactory {
    /**
     * Constructs an LND GRPC client from environment variables.
     * @returns
     */
    public static async lndFromEnv(): Promise<ILndClient> {
        const options = await Options.fromEnv();
        return new LndRpcClient(options.lndRpcHost, options.lndAdminMacaroon, options.lndCert);
    }
}
