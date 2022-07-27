import { ClientFactory } from "../../shared/ClientFactory";

async function run(): Promise<void> {
    // Expects the hash as a 32-byte hex encoded argument
    const hash = Buffer.from(process.argv[2], "hex");

    // Constructs a LND client from the environment variables
    const client = await ClientFactory.lndFromEnv();

    // Finally we can cancel the invoice.
    return await client.cancelInvoice(hash);
}

run().then(console.log).catch(console.error);
