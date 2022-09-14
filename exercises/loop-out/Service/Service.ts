import * as Bitcoin from "@node-lightning/bitcoin";
import { Logger, ConsoleTransport, LogLevel } from "@node-lightning/logger";
import { BitcoindClient } from "@node-lightning/bitcoind";
import { ClientFactory } from "../../../shared/ClientFactory";
import { Wallet } from "../Wallet";
import { prompt } from "enquirer";
import { BlockMonitor } from "../BlockMonitor";
import { Request } from "./Request";
import { RequestManager } from "./RequestManager";
import { LndInvoiceMonitor } from "./LndInvoiceMonitor";

async function run() {
    // Constructs a structure logger for the application
    const logger = new Logger("LoopOutService");
    logger.transports.push(new ConsoleTransport(console));
    logger.level = LogLevel.Debug;

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

    // prompt for their address
    let result: any = await prompt({
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
    const hash = Buffer.from(result.hash, "hex");

    // prompt for the value
    result = await prompt({
        type: "input",
        name: "satoshis",
        message: "Enter the value in satoshis",
    });
    const satoshis = Bitcoin.Value.fromSats(Number(result.satoshis));

    const blockMonitor = new BlockMonitor(bitcoind);
    const wallet = new Wallet(logger, bitcoind, blockMonitor);

    const request = new Request(theirAddress, hash, satoshis);
    const lndInvoiceAdapter = new LndInvoiceMonitor(logger, lightning);
    const manager = new RequestManager(logger, lndInvoiceAdapter, blockMonitor, wallet);

    // add some test funds to our wallet
    await wallet.fundTestWallet();

    // sync the wallet
    await blockMonitor.sync();
    blockMonitor.watch();

    // finally add the request
    await manager.addRequest(request);
}

run().catch(console.error);