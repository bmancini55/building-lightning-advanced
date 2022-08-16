import util from "util";
import crypto from "crypto";
import { ClientFactory } from "../../shared/ClientFactory";
import { Lnd } from "../../shared/data/lnd/v0.12.1-beta/Types";
import { sha256 } from "../../shared/Sha256";

async function run(): Promise<void> {
    // Obtains destination and amount from command line
    const dest = Buffer.from(process.argv[2], "hex");
    const amt = process.argv[3];

    // Generates a preimage and a hash
    const secret = crypto.randomBytes(32);
    const hash = sha256(secret);

    console.log("Dest    ", dest.toString("hex"));
    console.log("Amt     ", amt);
    console.log("Preimage", secret.toString("hex"));
    console.log("Hash    ", hash.toString("hex"));

    // Constructs a LND client from the environment variables
    const client = await ClientFactory.lndFromEnv();

    // Initiate spontaneous using keysend
    await client.sendPaymentV2(
        {
            dest,
            amt,
            payment_hash: hash,
            dest_custom_records: { 5482373484: secret },
            timeout_seconds: 60,
        },
        (payment: Lnd.Payment) => {
            console.log(util.inspect(payment, false, 6, true));
        },
    );
}

run().then(console.log).catch(console.error);
