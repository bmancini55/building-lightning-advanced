import * as Bitcoin from "@node-lightning/bitcoin";
import { sha256 } from "../../shared/Sha256";
async function run() {
    console.log(process.argv);

    const preimage = Buffer.from(process.argv[2], "hex");
    const hash = sha256(preimage);

    const htlcAmount = Bitcoin.Value.fromSats(Number(process.argv[3]));
    const htlcOutpoint = Bitcoin.OutPoint.fromString(process.argv[4]);

    const ourPrivKey = new Bitcoin.PrivateKey(
        Buffer.from(process.argv[5], "hex"),
        Bitcoin.Network.regtest,
    );

    const theirAddress = Bitcoin.Address.decodeBech32(process.argv[6]);

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
            theirAddress.program,
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

    console.log(txBuilder.toHex());
}

run().catch(console.error);
