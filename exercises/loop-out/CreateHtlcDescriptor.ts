import * as Bitcoin from "@node-lightning/bitcoin";

export function createHtlcDescriptor(
    hash: Buffer,
    claimPubKeyHash: Buffer,
    refundPubKeyHash: Buffer,
): Bitcoin.Script {
    // add the amount output
    return new Bitcoin.Script(
        Bitcoin.OpCode.OP_SHA256,
        hash,
        Bitcoin.OpCode.OP_EQUAL,
        Bitcoin.OpCode.OP_IF,
            Bitcoin.OpCode.OP_DUP,
            Bitcoin.OpCode.OP_HASH160,
            claimPubKeyHash,
        Bitcoin.OpCode.OP_ELSE,
            Bitcoin.Script.number(20),
            Bitcoin.OpCode.OP_CHECKSEQUENCEVERIFY,
            Bitcoin.OpCode.OP_DROP,
            Bitcoin.OpCode.OP_DUP,
            Bitcoin.OpCode.OP_HASH160,
            refundPubKeyHash,
        Bitcoin.OpCode.OP_ENDIF,
        Bitcoin.OpCode.OP_EQUALVERIFY,
        Bitcoin.OpCode.OP_CHECKSIG,
    ); // prettier-ignore
}
