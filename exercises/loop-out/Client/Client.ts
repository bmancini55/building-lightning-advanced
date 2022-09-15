import { Logger, ConsoleTransport, LogLevel } from "@node-lightning/logger";
import crypto from "crypto";
import * as Bitcoind from "@node-lightning/bitcoind";
import * as Bitcoin from "@node-lightning/bitcoin";
import { Wallet } from "../Wallet";
import { prompt } from "enquirer";
import { sha256 } from "../../../shared/Sha256";
import { createHtlcDescriptor } from "../CreateHtlcDescriptor";
import { BlockMonitor } from "../BlockMonitor";
import { ClientFactory } from "../../../shared/ClientFactory";
import { Http } from "../../../shared/Http";
import { Api } from "../ApiTypes";

async function run() {
    // Constructs a structure logger for the application
    const logger = new Logger("LoopOutService");
    logger.transports.push(new ConsoleTransport(console));
    logger.level = LogLevel.Debug;

    const lightning = await ClientFactory.lndFromEnv("N2_");
    const bitcoind = new Bitcoind.BitcoindClient({
        host: "127.0.0.1",
        port: 18443,
        rpcuser: "polaruser",
        rpcpassword: "polarpass",
        zmqpubrawblock: "tcp://127.0.0.1:28334",
        zmqpubrawtx: "tcp://127.0.0.1:29335",
    });

    const monitor = new BlockMonitor(bitcoind);
    const wallet = new Wallet(logger, bitcoind, monitor);

    const ourPrivKey = wallet.createKey();
    const ourAddress = ourPrivKey.toPubKey(true).toP2wpkhAddress();
    logger.info("our address", ourAddress);

    const preimage = crypto.randomBytes(32);
    logger.info("preimage", preimage.toString("hex"));

    const hash = sha256(preimage);
    logger.info("hash", hash.toString("hex"));

    const htlcAmount = Bitcoin.Value.fromSats(Number(process.argv[2] || 10000));

    await monitor.sync();
    monitor.watch();

    // send the request to the service
    const apiRequest: Api.LoopOutRequest = {
        htlcClaimAddress: ourAddress,
        hash: hash.toString("hex"),
        loopOutSats: Number(htlcAmount.sats),
    };
    const apiResponse = await Http.post<Api.LoopOutResponse>(
        "http://127.0.0.1:1008/api/loop/out",
        apiRequest,
    );

    // waiting for broadcast htlc transaction
    const htlcScripPubKey = Bitcoin.Script.p2wshLock(
        createHtlcDescriptor(
            hash,
            ourPrivKey.toPubKey(true).hash160(),
            Bitcoin.Address.decodeBech32(apiResponse.htlcRefundAddress).program,
        ),
    );
    const htlcScriptPubKeyHex = htlcScripPubKey.serializeCmds().toString("hex");

    monitor.addConnectedHandler(async (block: Bitcoind.Block) => {
        for (const tx of block.tx) {
            for (const vout of tx.vout) {
                if (vout.scriptPubKey.hex === htlcScriptPubKeyHex) {
                    // create the claim transaction
                    const claimTx = createClaimTx(
                        apiResponse.htlcRefundAddress,
                        hash,
                        preimage,
                        ourPrivKey,
                        htlcAmount,
                        `${tx.txid}:${vout.n}`,
                    );

                    // broadcast the claim transaction
                    logger.info("found on-chain HTLC, broadcasting claim transaction");
                    await wallet.sendTx(claimTx);
                }
            }
        }
    });

    logger.info("paying invoice");
    await lightning.sendPaymentV2(
        { payment_request: apiResponse.paymentRequest, timeout_seconds: 600 },
        invoice => {
            logger.info("invoice status is now:" + invoice.status);
        },
    );
}

run().catch(console.error);

function createClaimTx(
    theirAddress: string,
    hash: Buffer,
    preimage: Buffer,
    ourPrivKey: Bitcoin.PrivateKey,
    htlcAmount: Bitcoin.Value,
    htlcOutpoint: string,
): Bitcoin.Tx {
    const theirAddressDecoded = Bitcoin.Address.decodeBech32(theirAddress);

    const htlcScript = createHtlcDescriptor(
        hash,
        ourPrivKey.toPubKey(true).hash160(),
        theirAddressDecoded.program,
    );

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

    return txBuilder.toTx();
}
