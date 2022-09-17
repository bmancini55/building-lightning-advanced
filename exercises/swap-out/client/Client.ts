import { Logger, ConsoleTransport, LogLevel } from "@node-lightning/logger";
import crypto from "crypto";
import * as Bitcoind from "@node-lightning/bitcoind";
import * as Bitcoin from "@node-lightning/bitcoin";
import { Wallet } from "../Wallet";
import { sha256 } from "../../../shared/Sha256";
import { createHtlcDescriptor } from "../CreateHtlcDescriptor";
import { createClaimTx } from "./CreateClaimTx";
import { BlockMonitor } from "../BlockMonitor";
import { ClientFactory } from "../../../shared/ClientFactory";
import { Http } from "../../../shared/Http";
import { Api } from "../ApiTypes";

async function run() {
    // Constructs a structure logger for the application
    const logger = new Logger("SwapOutService");
    logger.transports.push(new ConsoleTransport(console));
    logger.level = LogLevel.Debug;

    // Construct a LND connection
    const lightning = await ClientFactory.lndFromEnv("ALICE_");

    // Construct a Bitcoind connection that will be used by our wallet
    // and our block chain monitor
    const bitcoind = new Bitcoind.BitcoindClient({
        rpcurl: process.env.BITCOIND_RPC_URL,
        rpcuser: process.env.BITCOIND_RPC_USER,
        rpcpassword: process.env.BITCOIND_RPC_PASSWORD,
    });

    // Construct a blockchain monitor to be notified when blocks are
    // added to the blockchain.
    const monitor = new BlockMonitor(bitcoind);

    // Construct a wallet that will manage keys, scan for UTXOs, and
    // allow us to sign transactions using keys controlled by the wallet.
    const wallet = new Wallet(logger, bitcoind, monitor);

    // Create a key that will be used for claiming the on-chain HTLC.
    // This address will be used in the hash-spend branch of the HTLC.
    const htlcClaimPrivKey = wallet.createKey();
    const htlcClaimPubKey = htlcClaimPrivKey.toPubKey(true);
    const htlcClaimAddress = htlcClaimPubKey.toP2wpkhAddress();
    logger.info("generated claim address", htlcClaimAddress);

    // Construct a random preimage
    const preimage = crypto.randomBytes(32);
    const hash = sha256(preimage);
    logger.info("generated preimage", preimage.toString("hex"));
    logger.info("generated hash", hash.toString("hex"));

    // Read the value in satoshis that the HTLC should be constructed for
    const htlcValue = Bitcoin.Value.fromSats(Number(process.argv[2] || 10000));

    // Start monitoring the blockchain
    await monitor.start();

    // Send the request to the service using our nicely generated information
    const apiRequest: Api.SwapOutRequest = {
        htlcClaimAddress: htlcClaimAddress,
        hash: hash.toString("hex"),
        swapOutSats: Number(htlcValue.sats),
    };
    logger.debug("service request", apiRequest);
    const apiResponse: Api.SwapOutResponse = await Http.post<Api.SwapOutResponse>(
        "http://127.0.0.1:1008/api/swap/out",
        apiRequest,
    );
    logger.debug("service response", apiResponse);

    // Since our HTLC isn't going to change, we can pre-generate its
    // Script so that we can more efficiently watch for it.
    const htlcDescriptor = createHtlcDescriptor(
        hash,
        htlcClaimPrivKey.toPubKey(true).hash160(),
        Bitcoin.Address.decodeBech32(apiResponse.htlcRefundAddress).program,
    );
    logger.debug("constructed HTLC script", htlcDescriptor.toString());

    // Using the Script we pre-generate the ScriptPubKey that we should
    // expect in a transaction output. Recall that a P2WSH ScriptPubKey
    // is 0x00 + sha256(script) which will be 33-bytes.
    const htlcScriptPubKeyHex = Bitcoin.Script.p2wshLock(htlcDescriptor)
        .serializeCmds()
        .toString("hex");
    logger.debug("constructed HTLC scriptPubKey", htlcScriptPubKeyHex);

    // Before we pay the invoice we want to be sure we are watching
    // blockchain. We do this by watching scanning all outputs in all
    // transactions in a block for an output with our expected 33-byte
    // ScriptPubKey we just computed.
    monitor.addConnectedHandler(async (block: Bitcoind.Block) => {
        for (const tx of block.tx) {
            for (const vout of tx.vout) {
                if (vout.scriptPubKey.hex === htlcScriptPubKeyHex) {
                    // Upon finding the HTLC on-chain, we will now generate
                    // a claim transaction
                    logger.info("found on-chain HTLC, broadcasting claim transaction");
                    const claimTx = createClaimTx(
                        htlcDescriptor,
                        preimage,
                        htlcClaimPrivKey,
                        htlcValue,
                        `${tx.txid}:${vout.n}`,
                    );

                    // Broadcast the claim transaction
                    logger.debug("broadcasting claim transaction", claimTx.toHex());
                    await wallet.sendTx(claimTx);

                    // Stop listening for blocks
                    await monitor.stop();
                }
            }
        }
    });

    // Now that we are all setup, we can pay the invoice. Upon receipt
    // the Swap-Out Service should broadcast the HTLC transaction that
    // are waiting for.
    logger.info("paying invoice");
    await lightning.sendPaymentV2(
        { payment_request: apiResponse.paymentRequest, timeout_seconds: 600 },
        invoice => {
            logger.info("invoice status is now:" + invoice.status);
        },
    );
}

run().catch(console.error);
