import * as Bitcoin from "@node-lightning/bitcoin";
import * as Bitcoind from "@node-lightning/bitcoind";
import { BlockMonitor } from "./BlockMonitor";

/**
 * This is a very basic wallet that monitors the P2WPKH address for a single key.
 */
export class Wallet {
    public bestBlockHash: string;
    public keys: Set<Bitcoin.PrivateKey> = new Set();
    public utxos: Set<string> = new Set();
    public scriptPubKeys: Set<string> = new Set();

    public constructor(readonly blockMonitor: BlockMonitor) {
        blockMonitor.handlers.add(this.processBlock.bind(this));
    }

    public addKey(key: Bitcoin.PrivateKey) {
        this.keys.add(key);
        this.addScriptPubKey(Bitcoin.Script.p2wpkhLock(key.toPubKey(true).toBuffer()));
    }

    public addScriptPubKey(script: Bitcoin.Script) {
        this.scriptPubKeys.add(script.serializeCmds().toString("hex"));
    }

    public getUtxo(): string {
        return this.utxos.keys().next().value;
    }

    protected async processBlock(block: Bitcoind.Block) {
        // scan for receipt
        const results = this.scanBlockForReceipt(block, this.scriptPubKeys);
        for (const [tx, vout] of results) {
            const utxo = `${tx.txid}:${vout.n}`;
            console.log(`received ${utxo}`);
            this.utxos.add(utxo);
        }

        // scan for spend
        const spends = this.scanBlockForSpend(block, this.utxos);
        for (const [tx, vin] of spends) {
            const utxo = `${vin.txid}:${vin.vout}`;
            console.log(`spent ${utxo}`);
            this.utxos.delete(utxo);
        }
    }

    protected *scanBlockForReceipt(
        block: Bitcoind.Block,
        scriptPubKeys: Set<string>,
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
        scriptPubKeys: Set<string>,
    ): Generator<Bitcoind.Output> {
        for (const vout of tx.vout) {
            if (scriptPubKeys.has(vout.scriptPubKey.hex)) {
                yield vout;
            }
        }
    }

    protected *scanBlockForSpend(
        block: Bitcoind.Block,
        outpoints: Set<string>,
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
        outpoints: Set<string>,
    ): Generator<Bitcoind.Input> {
        for (const vin of tx.vin) {
            const outpoint = `${vin.txid}:${vin.vout}`;
            if (outpoints.has(outpoint)) {
                yield vin;
            }
        }
    }
}
