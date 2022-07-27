import { sha256 } from "../../shared/Sha256";

async function run() {
    // read the command line argument
    const data = process.argv[2];

    // hash the raw data to make it 32-bytes
    const preimage = sha256(data);

    // hash the preimage value
    const hash = sha256(preimage);

    console.log("data:     ", data);
    console.log("preimage: ", preimage.toString("hex"));
    console.log("hash:     ", hash.toString("hex"));
}

run().catch(console.error);
