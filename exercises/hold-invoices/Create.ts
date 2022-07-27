import { ClientFactory } from "../../shared/ClientFactory";
import { Lnd } from "../../shared/data/lnd/v0.12.1-beta/Types";

async function run(): Promise<Lnd.AddHoldInvoiceResult> {
    // Expects the hash as 32-byte hex
    const hash = Buffer.from(process.argv[2], "hex");

    // Constructs a LND client from the environment variables
    const client = await ClientFactory.lndFromEnv();

    // Finally construct the HOLD invoice
    const options: Lnd.AddHoldInvoiceInput = {
        memo: "Exercise",
        value: "1000",
        hash,
    };
    return await client.addHoldInvoice(options);
}

run().then(console.log).catch(console.error);
