import { Logger, ConsoleTransport, LogLevel } from "@node-lightning/logger";
import { BitcoindClient } from "@node-lightning/bitcoind";
import { ClientFactory } from "../../../shared/ClientFactory";
import { Wallet } from "../Wallet";
import { BlockMonitor } from "../BlockMonitor";
import { RequestManager } from "./RequestManager";
import { LndInvoiceMonitor } from "./LndInvoiceMonitor";
import { api } from "./Api";

async function run() {
    // Constructs a structured logger for the application
    const logger = new Logger("LoopOutService");
    logger.transports.push(new ConsoleTransport(console));
    logger.level = LogLevel.Debug;

    // Constructs a LND client from the environment variables
    const lightning = await ClientFactory.lndFromEnv("BOB_");

    // Construct bitcoind client
    const bitcoind = new BitcoindClient({
        rpcurl: process.env.BITCOIND_RPC_URL,
        rpcuser: process.env.BITCOIND_RPC_USER,
        rpcpassword: process.env.BITCOIND_RPC_PASSWORD,
    });

    // Construct a blockchain monitor to be notified when blocks are
    // added to the blockchain.
    const blockMonitor = new BlockMonitor(bitcoind);

    // Construct a wallet that will manage keys, scan for UTXOs, and
    // allow us to sign transactions using keys controlled by the wallet.
    const wallet = new Wallet(logger, bitcoind, blockMonitor);

    // Construct an invoice monitor
    const lndInvoiceMonitor = new LndInvoiceMonitor(logger, lightning);

    // Construct a request manager that will handle the state changes
    // for loop-out requests
    const requestManager = new RequestManager(logger, lndInvoiceMonitor, blockMonitor, wallet);

    // Add some test funds to our wallet so that we can perform on-chain
    // transactions
    await wallet.fundTestWallet();

    // Sync the wallet with the blockchain
    await blockMonitor.start();

    // Construct and start an API to receive requests
    const router = api(requestManager);
    router.listen(1008, () => {
        logger.info("listening on 1008");
    });
}

run().catch(console.error);
