import crypto from "crypto";
import util from "util";
import * as Bitcoin from "@node-lightning/bitcoin";
import { BitcoindClient } from "@node-lightning/bitcoind";
import { ClientFactory } from "../../shared/ClientFactory";
import { ILndClient } from "../../shared/data/lnd/ILndClient";
import { Lnd } from "../../shared/data/lnd/v0.12.1-beta/Types";
import { Tx } from "@node-lightning/bitcoin";
import { Wallet } from "./Wallet";
import { prompt } from "enquirer";
import { createHtlcDescriptor as createHtlcDescriptor } from "./CreateHtlcDescriptor";
import { BlockMonitor } from "./BlockMonitor";
import { LoopOutRequest } from "./LoopOutService/LoopOutRequest";
import { LoopOutRequestManager } from "./LoopOutService/LoopOutRequestManager";
import { LndInvoiceAdapter } from "./LoopOutService/LndInvoiceAdapter";

async function run() {
    // Constructs a LND client from the environment variables
    const lightning = await ClientFactory.lndFromEnv();

    // Construct bitcoind client
    const bitcoind = new BitcoindClient({
        host: "127.0.0.1",
        port: 18443,
        rpcuser: "polaruser",
        rpcpassword: "polarpass",
        zmqpubrawblock: "tcp://127.0.0.1:28334",
        zmqpubrawtx: "tcp://127.0.0.1:29335",
    });

    // We'll use this address for mining blocks
    const mineAddress = await bitcoind.getNewAddress();

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
    console.log("our public  key", ourPrivKey.toPubKey(true).toHex());
    console.log("our address", ourAddress);

    // prompt for their address
    result = await prompt({
        type: "input",
        name: "address",
        message: "Enter their payment address",
    });
    const theirAddress = result.address;

    // prompt for the value
    result = await prompt({
        type: "input",
        name: "hash",
        message: "Enter the hash from the user",
    });
    const hash = result.hash;

    // prompt for the value
    result = await prompt({
        type: "input",
        name: "satoshis",
        message: "Enter the value in satoshis",
    });
    const satoshis = Number(result.satoshis);

    const monitor = new BlockMonitor(bitcoind);
    const wallet = new Wallet(monitor);
    wallet.addKey(ourPrivKey);

    // add some funds to the private key
    console.log(`adding funds to ${ourAddress}`);
    await bitcoind.sendToAddress(ourPrivKey.toPubKey(true).toP2wpkhAddress(), 1);
    await bitcoind.generateToAddress(1, mineAddress);

    // sync the wallet
    console.log("performing sync");
    await monitor.sync();
    monitor.watch();

    const request = new LoopOutRequest(theirAddress, hash, satoshis);
    const lndInvoiceAdapter = new LndInvoiceAdapter(lightning);
    const manager = new LoopOutRequestManager(lndInvoiceAdapter, wallet, ourPrivKey);

    monitor.addConnectedHandler(manager.onBlockConnected.bind(manager));

    await manager.addRequest(request);
}

run().catch(console.error);
