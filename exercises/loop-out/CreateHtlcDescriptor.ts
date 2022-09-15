import * as Bitcoin from "@node-lightning/bitcoin";

/**
 * Constructs an HTLC script that uses the format of BIP199.
 * @param hash 32-byte hash
 * @param claimPubKeyHash 20-byte pubkeyhash for the receiver
 * @param refundPubKeyHash 20-byte pubkeyhash for the offer
 * @param timeoutDelay blocks before a timeout is active
 * @returns
 */
export function createHtlcDescriptor(
    hash: Buffer,
    claimPubKeyHash: Buffer,
    refundPubKeyHash: Buffer,
    timeoutDelay = 40,
): Bitcoin.Script {
    return new Bitcoin.Script(
        Bitcoin.OpCode.OP_SHA256,
        hash,
        Bitcoin.OpCode.OP_EQUAL,
        Bitcoin.OpCode.OP_IF,
            Bitcoin.OpCode.OP_DUP,
            Bitcoin.OpCode.OP_HASH160,
            claimPubKeyHash,
        Bitcoin.OpCode.OP_ELSE,
            Bitcoin.Script.number(timeoutDelay),
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
