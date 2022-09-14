import { ILogger } from "@node-lightning/logger";
import crypto from "crypto";
import { StreamReader } from "@node-lightning/bufio";
import * as Bitcoin from "@node-lightning/bitcoin";
import { TxOut } from "@node-lightning/bitcoin";
import * as Bitcoind from "@node-lightning/bitcoind";
import { BlockMonitor } from "./BlockMonitor";
import { BitcoindClient } from "@node-lightning/bitcoind";

/**
 * This is a very basic wallet that monitors the P2WPKH address for a single key.
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
        // create a scoped logger for the wallet
        this.logger = logger.sub(Wallet.name);

        // connect to the block monitor so we can process blocks
        blockMonitor.connectedHandlers.add(this.processBlock.bind(this));
    }

    /**
     * This method
     */
    public async fundTestWallet(): Promise<Bitcoin.PrivateKey> {
        // create an address in bitcoind managed wallet that we'll mine into
        const mineAddress = await this.bitcoind.getNewAddress();

        // adds a new key to the wallet
        const key = this.createKey();
        const address = key.toPubKey(true).toP2wpkhAddress();

        // add some funds to the private key by sending from the
        // bitcoind wallet to our new address and then mining a block
        this.logger.info(`adding funds to ${address}`);
        await this.bitcoind.sendToAddress(address, 1);
        await this.bitcoind.generateToAddress(1, mineAddress);

        return key;
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
        this.logger.info("adding", key.toPubKey(true).toP2wpkhAddress());
        this.keys.add(key);

        // watch for the p2wpkh spend
        const scriptPubKey = Bitcoin.Script.p2wpkhLock(key.toPubKey(true).toBuffer());
        const scriptPubKeyHex = scriptPubKey.serializeCmds().toString("hex");
        this.watchedScriptPubKey.set(scriptPubKeyHex, key);
    }

    public getUtxo(): string {
        return this.ownedUtxos.keys().next().value;
    }

    public fundTx(tx: Bitcoin.TxBuilder) {
        const utxoId = this.getUtxo();
        const [utxo, utxoPrvKey] = this.ownedUtxos.get(utxoId);
        const utxoPubKey = utxoPrvKey.toPubKey(true).toBuffer();

        // const changePrvKey = this.addKey();
        // const changePubKey = changePrvKey.toPubKey(true).toBuffer();

        // create the funding input
        tx.addInput(utxoId, Bitcoin.Sequence.rbf());

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
        const changeScriptPubKey = Bitcoin.Script.p2wpkhLock(utxoPubKey);
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

    public async sendTx(tx: Bitcoin.Tx) {
        await this.bitcoind.sendRawTransaction(tx.toHex());
    }

    protected async processBlock(block: Bitcoind.Block) {
        // scan for receipts
        const results = this.scanBlockForReceipt(block, this.watchedScriptPubKey);
        for (const [tx, vout] of results) {
            const outpoint = new Bitcoin.OutPoint(tx.txid, vout.n);
            const utxo = new TxOut(
                Bitcoin.Value.fromBitcoin(vout.value),
                Bitcoin.Script.parse(StreamReader.fromHex(vout.scriptPubKey.hex)),
            );
            const privateKey = this.watchedScriptPubKey.get(vout.scriptPubKey.hex);
            this.logger.info(`rcvd ${utxo.value.bitcoin.toFixed(8)} - ${outpoint.toString()}`);
            this.ownedUtxos.set(outpoint.toString(), [utxo, privateKey]);
        }

        // scan for spends
        const spends = this.scanBlockForSpend(block, this.ownedUtxos);
        for (const [, vin] of spends) {
            const utxoId = `${vin.txid}:${vin.vout}`;
            const [txOut] = this.ownedUtxos.get(utxoId);
            this.logger.info(`sent ${txOut.value.bitcoin.toFixed(8)} - ${utxoId}`);
            this.ownedUtxos.delete(utxoId);
        }
    }

    protected *scanBlockForReceipt(
        block: Bitcoind.Block,
        scriptPubKeys: Map<string, any>,
    ): Generator<[Bitcoind.Transaction, Bitcoind.Output]> {
        for (const tx of block.tx) {
            const vouts = this.scanTxForReceipt(tx, scriptPubKeys);
            for (const vout of vouts) {
                yield [tx, vout];
            }
        }
    }

    protected *scanTxForReceipt(
        tx: Bitcoind.Transaction,
        scriptPubKeys: Map<string, any>,
    ): Generator<Bitcoind.Output> {
        for (const vout of tx.vout) {
            if (scriptPubKeys.has(vout.scriptPubKey.hex)) {
                yield vout;
            }
        }
    }

    protected *scanBlockForSpend(
        block: Bitcoind.Block,
        outpoints: Map<string, any>,
    ): Generator<[Bitcoind.Transaction, Bitcoind.Input]> {
        for (const tx of block.tx) {
            const vins = this.scanTxForSpend(tx, outpoints);
            for (const vin of vins) {
                yield [tx, vin];
            }
        }
    }

    protected *scanTxForSpend(
        tx: Bitcoind.Transaction,
        outpoints: Map<string, any>,
    ): Generator<Bitcoind.Input> {
        for (const vin of tx.vin) {
            const outpoint = `${vin.txid}:${vin.vout}`;
            if (outpoints.has(outpoint)) {
                yield vin;
            }
        }
    }
}
