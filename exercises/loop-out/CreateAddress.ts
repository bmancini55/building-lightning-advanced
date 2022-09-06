import crypto from "crypto";
import * as Bitcoin from "@node-lightning/bitcoin";

async function run() {
    const utxoPrivKey = new Bitcoin.PrivateKey(crypto.randomBytes(32), Bitcoin.Network.regtest);
    console.log("private key", utxoPrivKey.toHex());

    const utxoPubKey = utxoPrivKey.toPubKey(true);
    console.log("address", utxoPubKey.toP2wpkhAddress());
}

run().catch(console.error);
