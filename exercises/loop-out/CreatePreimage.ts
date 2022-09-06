import crypto from "crypto";
import { sha256 } from "../../shared/Sha256";

export async function run() {
    const preimage = crypto.randomBytes(32);
    console.log("preimage", preimage.toString("hex"));

    const hash = sha256(preimage);
    console.log("hash", hash.toString("hex"));
}

run().catch(console.error);
