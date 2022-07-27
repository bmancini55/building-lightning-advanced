import { ClientFactory } from "../../shared/ClientFactory";

async function run(): Promise<void> {
    // Expects the preimage in the command line is a 32-byte hex encoded value
    const preimage = Buffer.from(process.argv[2], "hex");

    // Constructs a LND client from the environment variables
    const client = await ClientFactory.lndFromEnv();

    // Settle the invoice using the 32-byte preimage
    return await client.settleInvoice(preimage);
}

run().then(console.log).catch(console.error);
