import crypto from "crypto";
import * as Bitcoind from "@node-lightning/bitcoind";
import * as Bitcoin from "@node-lightning/bitcoin";
import { Wallet } from "./Wallet";
import { prompt } from "enquirer";
import { sha256 } from "../../shared/Sha256";

async function run() {
    let result: any = await prompt({
        type: "input",
        name: "privkey",
        message: "Enter a private key or leave blank to generate one",
    });
    const ourPrivKey = new Bitcoin.PrivateKey(
        result.privkey ? Buffer.from(result.privkey, "hex") : crypto.randomBytes(32),
        Bitcoin.Network.regtest,
    );
    const ourAddress = ourPrivKey.toPubKey(true).toP2wpkhAddress();
    console.log("our private key", ourPrivKey.toHex());
    console.log("our address", ourAddress);

    const bitcoind = new Bitcoind.BitcoindClient({
        host: "127.0.0.1",
        port: 18443,
        rpcuser: "polaruser",
        rpcpassword: "polarpass",
        zmqpubrawblock: "tcp://127.0.0.1:28334",
        zmqpubrawtx: "tcp://127.0.0.1:29335",
    });

    const wallet = new Wallet(
        bitcoind,
        () => {
            /**  */
        },
        () => {
            /**  */
        },
    );
    await wallet.sync();
    wallet.monitor();

    // construct a preimage and a hash
    result = await prompt({
        type: "input",
        name: "preimage",
        message: "Enter a preimage or enter to create one",
    });
    const preimage = result.preimage ? Buffer.from(result.preimage, "hex") : crypto.randomBytes(32);
    console.log("preimage", preimage.toString("hex"));

    const hash = sha256(preimage);
    console.log("hash", hash.toString("hex"));

    // enter their
    result = await prompt({
        type: "input",
        name: "address",
        message: "Enter the service nodes address",
    });
    const theirAddress = result.address;

    result = await prompt({
        type: "input",
        name: "htlcamount",
        message: "Enter the htlc amount in satoshis",
    });
    const htlcAmount = Bitcoin.Value.fromSats(Number(result.htlcamount));

    result = await prompt({
        type: "input",
        name: "htlcutxo",
        message: "Enter the htlc utxo",
    });
    const htlcUtox = result.htlcutxo;
    const tx = createClaimTx(theirAddress, hash, preimage, ourPrivKey, htlcAmount, htlcUtox);

    await bitcoind.sendRawTransaction(tx);
}

run().catch(console.error);

function createClaimTx(
    theirAddress: string,
    hash: Buffer,
    preimage: Buffer,
    ourPrivKey: Bitcoin.PrivateKey,
    htlcAmount: Bitcoin.Value,
    htlcOutpoint: string,
) {
    const theirAddressDecoded = Bitcoin.Address.decodeBech32(theirAddress);

    const htlcScript = new Bitcoin.Script(
        Bitcoin.OpCode.OP_SHA256,
        hash,
        Bitcoin.OpCode.OP_EQUAL,
        Bitcoin.OpCode.OP_IF,
            Bitcoin.OpCode.OP_DUP,
            Bitcoin.OpCode.OP_HASH160,
            ourPrivKey.toPubKey(true).hash160(),
        Bitcoin.OpCode.OP_ELSE,
            Bitcoin.Script.number(20),
            Bitcoin.OpCode.OP_CHECKSEQUENCEVERIFY,
            Bitcoin.OpCode.OP_DROP,
            Bitcoin.OpCode.OP_DUP,
            Bitcoin.OpCode.OP_HASH160,
            theirAddressDecoded.program,
        Bitcoin.OpCode.OP_ENDIF,
        Bitcoin.OpCode.OP_EQUALVERIFY,
        Bitcoin.OpCode.OP_CHECKSIG,
    ); // prettier-ignore

    console.log(htlcScript.sha256().toString("hex"));

    // claim funds
    const fees = Bitcoin.Value.fromSats(141);
    const htlcAmountLessFees = htlcAmount.clone();
    htlcAmountLessFees.sub(fees);

    const txBuilder = new Bitcoin.TxBuilder();
    txBuilder.addInput(htlcOutpoint);
    txBuilder.addOutput(
        htlcAmountLessFees,
        Bitcoin.Script.p2wpkhLock(ourPrivKey.toPubKey(true).toBuffer()),
    );

    // add witness
    txBuilder.addWitness(
        0,
        txBuilder.signSegWitv0(0, htlcScript, ourPrivKey.toBuffer(), htlcAmount),
    );
    txBuilder.addWitness(0, ourPrivKey.toPubKey(true).toBuffer());
    txBuilder.addWitness(0, preimage);
    txBuilder.addWitness(0, htlcScript.serializeCmds());

    return txBuilder.toHex();
}
