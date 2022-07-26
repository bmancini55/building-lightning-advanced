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

    // We then construct the hash from the 32-byte preimage. If we don't
    // do this we won't be able to settle the invoice because the preimage
    // will be considered invalid.
    const hash = sha256(preimage32);

    // Finally we can cancel the invoice.
    return await client.cancelInvoice(hash);
}

run().then(console.log).catch(console.error);
