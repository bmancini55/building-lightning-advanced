import { ILogger } from "@node-lightning/logger";
import crypto from "crypto";
import { StreamReader } from "@node-lightning/bufio";
import * as Bitcoin from "@node-lightning/bitcoin";
import { TxOut } from "@node-lightning/bitcoin";
import * as Bitcoind from "@node-lightning/bitcoind";
import { BlockMonitor } from "./BlockMonitor";
import { BitcoindClient } from "@node-lightning/bitcoind";

/**
 * This is a very basic wallet that monitors for P2WPKH addresses that
 * are controlled by the wallet. It also includes some test wallet
 * functionality to add funds or mine blocks to assist with testing
 * on-chain logic.
 */
export class Wallet {
    public logger: ILogger;
    public bestBlockHash: string;
    public keys: Set<Bitcoin.PrivateKey> = new Set();

    protected ownedUtxos: Map<string, [Bitcoin.TxOut, Bitcoin.PrivateKey]> = new Map();
    protected watchedScriptPubKey: Map<string, Bitcoin.PrivateKey> = new Map();

    public constructor(
        logger: ILogger,
        readonly bitcoind: BitcoindClient,
        readonly blockMonitor: BlockMonitor,
    ) {
        this.logger = logger.sub(Wallet.name);

        // connect to the block monitor so we can process blocks
        blockMonitor.connectedHandlers.add(this.processBlock.bind(this));
    }

    /**
     * For use in regtest networks where we can use `minetoaddress` API.
     * This works by creating an address controlled by the wallet, sending
     * to it from the bitcoind node, and mining to an address controlled
     * by the bitcoind node.
     */
    public async fundTestWallet(): Promise<Bitcoin.PrivateKey> {
        // adds a new key to the wallet
        const key = this.createKey();
        const address = key.toPubKey(true).toP2wpkhAddress();

        // add some funds to the private key by sending from the
        // bitcoind wallet to our new address and then mining a block
        this.logger.debug(`adding funds to ${address}`);
        await this.bitcoind.sendToAddress(address, 1);

        // mine the block so there are funds
        await this.testWalletMine(1);

        return key;
    }

    /**
     * Mines a block to an address controlled by the bitcoind node.
     * @param blocks
     */
    public async testWalletMine(blocks = 1): Promise<void> {
        // create an address in bitcoind managed wallet that we'll mine into
        const mineAddress = await this.bitcoind.getNewAddress();

        // generate block to address
        await this.bitcoind.generateToAddress(blocks, mineAddress);
    }

    /**
     * Creates a new PrivateKey and adds it to the wallet.
     * @param network
     * @returns
     */
    public createKey(network: Bitcoin.Network = Bitcoin.Network.regtest): Bitcoin.PrivateKey {
        const key = new Bitcoin.PrivateKey(crypto.randomBytes(32), network);
        this.addKey(key);
        return key;
    }

    /**
     * Adds the key to the wallet. For existing address a scan of the
     * blockchain for UTXOs must be performed.
     * @param key
     */
    public addKey(key: Bitcoin.PrivateKey) {
        this.logger.debug("adding", key.toPubKey(true).toP2wpkhAddress());
        this.keys.add(key);

        // watch for the p2wpkh spend
        const scriptPubKey = Bitcoin.Script.p2wpkhLock(key.toPubKey(true).toBuffer());
        const scriptPubKeyHex = scriptPubKey.serializeCmds().toString("hex");
        this.watchedScriptPubKey.set(scriptPubKeyHex, key);
    }

    /**
     * Gets the next available UTXO. As a simplification we assume there
     * are enough funds. In reality we would implement a proper UTXO
     * selection algorithm.
     * @returns
     */
    public getUtxo(): string {
        return this.ownedUtxos.keys().next().value;
    }

    /**
     * Funds a partially constructed transaction by finding a UTXO controlled
     * by the wallet and using it as the input. It also attached a change
     * output after subtracting a fixed fee rate. A proper wallet would
     * track proper fee rates and perform proper fee calculations.
     * @param tx
     */
    public fundTx(tx: Bitcoin.TxBuilder) {
        const utxoId = this.getUtxo();
        const [utxo, utxoPrvKey] = this.ownedUtxos.get(utxoId);
        const utxoPubKey = utxoPrvKey.toPubKey(true).toBuffer();

        const changePrvKey = this.createKey();
        const changePubKey = changePrvKey.toPubKey(true).toBuffer();

        // create the funding input
        tx.addInput(utxoId);

        // calculate the change due
        const fees = Bitcoin.Value.fromSats(244); // use a fixed fee for simplicity
        const changeOutput = utxo.value.clone();
        const spentValue = Bitcoin.Value.zero();
        for (const output of tx.outputs) {
            spentValue.add(output.value);
        }
        changeOutput.sub(fees);
        changeOutput.sub(spentValue);

        // construct and add the change output
        const changeScriptPubKey = Bitcoin.Script.p2wpkhLock(changePubKey);
        tx.addOutput(changeOutput, changeScriptPubKey);

        // add the witness to the input data
        tx.addWitness(
            0,
            tx.signSegWitv0(
                0,
                Bitcoin.Script.p2pkhLock(utxoPubKey),
                utxoPrvKey.toBuffer(),
                utxo.value,
            ),
        );
        tx.addWitness(0, utxoPubKey);
    }

    /**
     * Broadcasts a transaction
     * @param tx
     * @param mine
     */
    public async sendTx(tx: Bitcoin.Tx, mine = true) {
        this.logger.info("broadcasting txid", tx.txId.toString());
        await this.bitcoind.sendRawTransaction(tx.toHex());
        if (mine) await this.testWalletMine();
    }

    protected async processBlock(block: Bitcoind.Block) {
        for (const tx of block.tx) {
            // scan for spends
            const vins = this.scanTxForSpend(tx, this.ownedUtxos);
            for (const vin of vins) {
                const utxoId = `${vin.txid}:${vin.vout}`;
                const [txOut] = this.ownedUtxos.get(utxoId);
                this.logger.info(`sent ${txOut.value.bitcoin.toFixed(8)} - ${utxoId}`);
                this.ownedUtxos.delete(utxoId);
            }

            // scan for receipts
            const vouts = this.scanTxForReceipt(tx, this.watchedScriptPubKey);
            for (const vout of vouts) {
                const outpoint = new Bitcoin.OutPoint(tx.txid, vout.n);
                const utxo = new TxOut(
                    Bitcoin.Value.fromBitcoin(vout.value),
                    Bitcoin.Script.parse(StreamReader.fromHex(vout.scriptPubKey.hex)),
                );
                const privateKey = this.watchedScriptPubKey.get(vout.scriptPubKey.hex);
                this.logger.info(`rcvd ${utxo.value.bitcoin.toFixed(8)} - ${outpoint.toString()}`);
                this.ownedUtxos.set(outpoint.toString(), [utxo, privateKey]);
            }
        }
    }

    protected *scanTxForReceipt(
        tx: Bitcoind.Transaction,
        scriptPubKeys: Map<string, unknown>,
    ): Generator<Bitcoind.Output> {
        for (const vout of tx.vout) {
            if (scriptPubKeys.has(vout.scriptPubKey.hex)) {
                yield vout;
            }
        }
    }

    protected *scanTxForSpend(
        tx: Bitcoind.Transaction,
        outpoints: Map<string, unknown>,
    ): Generator<Bitcoind.Input> {
        for (const vin of tx.vin) {
            const outpoint = `${vin.txid}:${vin.vout}`;
            if (outpoints.has(outpoint)) {
                yield vin;
            }
        }
    }
}
