import { Logger, ConsoleTransport, LogLevel } from "@node-lightning/logger";
import { BitcoindClient } from "@node-lightning/bitcoind";
import { ClientFactory } from "../../../shared/ClientFactory";
import { Wallet } from "../Wallet";
import { BlockMonitor } from "../BlockMonitor";
import { RequestManager } from "./RequestManager";
import { LndInvoiceMonitor } from "./LndInvoiceMonitor";
import { api } from "./Api";

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

    const blockMonitor = new BlockMonitor(bitcoind);
    const wallet = new Wallet(logger, bitcoind, blockMonitor);

    const lndInvoiceAdapter = new LndInvoiceMonitor(logger, lightning);
    const manager = new RequestManager(logger, lndInvoiceAdapter, blockMonitor, wallet);

    // add some test funds to our wallet
    await wallet.fundTestWallet();

    // sync the wallet
    await blockMonitor.sync();
    blockMonitor.watch();

    const router = api(manager);
    router.listen(1008, () => {
        logger.info("listening on 1008");
    });
}

run().catch(console.error);
