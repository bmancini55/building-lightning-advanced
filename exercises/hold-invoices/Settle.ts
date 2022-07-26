import { ClientFactory } from "../../shared/ClientFactory";
import { sha256 } from "../../shared/Sha256";

async function run(): Promise<void> {
    // Receives the preimage from the command line
    const preimage = process.argv[2];

    // Constructs a LND client from the environment variables
    const client = await ClientFactory.lndFromEnv();

    // The preimage must be 32-bytes so the first hash ensures the value
    // is 32-bytes. The second hash constructs the
    // hash from the preimage.
    const preimage32 = sha256(preimage);

    // Settle the invoice using the 32-byte preimage
    return await client.settleInvoice(preimage32);
}

run().then(console.log).catch(console.error);
