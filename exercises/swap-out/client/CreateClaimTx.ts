import * as Bitcoin from "@node-lightning/bitcoin";
/**
 * Constructs a claim transaction for the HTLC that spends the hash-path
 * of the HTLC. The witness data used is [<claim_sig>, <preimage>, <htlc_script>]
 * @param htlcDescriptor the HTLC script
 * @param preimage used to generate the hash
 * @param htlcClaimPrivKey private key used to generate the claim signature
 * @param htlcAmount amount of the htlc
 * @param htlcOutpoint outpoint of the htlc
 * @returns
 */
export function createClaimTx(
    htlcDescriptor: Bitcoin.Script,
    preimage: Buffer,
    htlcClaimPrivKey: Bitcoin.PrivateKey,
    htlcAmount: Bitcoin.Value,
    htlcOutpoint: string,
): Bitcoin.Tx {
    const txBuilder = new Bitcoin.TxBuilder();

    // single input that is the HTLC's outpoint
    txBuilder.addInput(htlcOutpoint);

    // calculate fees at 1-sat/byte
    const fees = Bitcoin.Value.fromSats(141);
    const htlcAmountLessFees = htlcAmount.clone();
    htlcAmountLessFees.sub(fees);

    // single output that spends the HTLC to a standard P2WPKH claim address
    txBuilder.addOutput(
        htlcAmountLessFees,
        Bitcoin.Script.p2wpkhLock(htlcClaimPrivKey.toPubKey(true).toBuffer()),
    );

    // witness 0: signature
    txBuilder.addWitness(
        0,
        txBuilder.signSegWitv0(0, htlcDescriptor, htlcClaimPrivKey.toBuffer(), htlcAmount),
    );

    // witness 1: claim public key
    txBuilder.addWitness(0, htlcClaimPrivKey.toPubKey(true).toBuffer());

    // witness 2: preimage
    txBuilder.addWitness(0, preimage);

    // witness 3: htlc script (required for spend p2wsh input)
    txBuilder.addWitness(0, htlcDescriptor.serializeCmds());

    return txBuilder.toTx();
}
