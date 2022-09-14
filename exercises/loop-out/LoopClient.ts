import { Logger, ConsoleTransport, LogLevel } from "@node-lightning/logger";
import crypto from "crypto";
import * as Bitcoind from "@node-lightning/bitcoind";
import * as Bitcoin from "@node-lightning/bitcoin";
import { Wallet } from "./Wallet";
import { prompt } from "enquirer";
import { sha256 } from "../../shared/Sha256";
import { createHtlcDescriptor } from "./CreateHtlcDescriptor";
import { BlockMonitor } from "./BlockMonitor";
import { ClientFactory } from "../../shared/ClientFactory";

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

    result = await prompt({
        type: "input",
        name: "htlcamount",
        message: "Enter the htlc amount in satoshis",
    });
    const htlcAmount = Bitcoin.Value.fromSats(Number(result.htlcamount));

    // Create an address where simulated mining can go
    const mineAddress = await bitcoind.getNewAddress();

    // perform a chain sync
    console.log("synchronizing chain");
    const monitor = new BlockMonitor(bitcoind);
    const wallet = new Wallet(logger, bitcoind, monitor);
    wallet.addKey(ourPrivKey);

    await monitor.sync();
    monitor.watch();

    // enter their
    result = await prompt({
        type: "input",
        name: "address",
        message: "Enter the service nodes address",
    });
    const theirAddress = result.address;

    result = await prompt({
        type: "input",
        name: "payment_request",
        message: "Enter the payment_request the loop service generated",
    });

    // waiting for broadcast htlc transaction
    console.log("watching for htlc transaction");
    const htlcScripPubKey = Bitcoin.Script.p2wshLock(
        createHtlcDescriptor(
            hash,
            ourPrivKey.toPubKey(true).hash160(),
            Bitcoin.Address.decodeBech32(theirAddress).program,
        ),
    );

    monitor.addConnectedHandler(async (block: Bitcoind.Block) => {
        for (const tx of block.tx) {
            for (const vout of tx.vout) {
                if (vout.scriptPubKey.hex === htlcScripPubKey.serializeCmds().toString("hex")) {
                    // create the claim transaction
                    const claimTx = createClaimTx(
                        theirAddress,
                        hash,
                        preimage,
                        ourPrivKey,
                        htlcAmount,
                        `${tx.txid}:${vout.n}`,
                    );

                    // broadcast the claim transaction
                    console.log("found transaction, broadcasting claim transaction");
                    await bitcoind.sendRawTransaction(claimTx);

                    // mine a block so everyone can detect it
                    await bitcoind.generateToAddress(1, mineAddress);
                }
            }
        }
    });

    console.log("paying invoice");
    await lightning.sendPaymentV2(
        { payment_request: result.payment_request, timeout_seconds: 600 },
        invoice => {
            console.log("invoice status is now:" + invoice.status);
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
) {
    const theirAddressDecoded = Bitcoin.Address.decodeBech32(theirAddress);

    const htlcScript = createHtlcDescriptor(
        hash,
        ourPrivKey.toPubKey(true).hash160(),
        theirAddressDecoded.program,
    );

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
