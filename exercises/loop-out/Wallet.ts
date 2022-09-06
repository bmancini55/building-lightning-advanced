import * as Bitcoin from "@node-lightning/bitcoin";
import * as Bitcoind from "@node-lightning/bitcoind";

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * This is a very basic wallet that monitors the P2WPKH address for a single key.
 */
export class Wallet {
    public bestBlockHash: string;
    public utxos: Map<string, Bitcoin.Value> = new Map();
    public readonly scriptPubKey: Bitcoin.Script;
    public readonly scriptPubKeyHex: string;

    public constructor(
        readonly bitcoind: Bitcoind.BitcoindClient,
        readonly pk: Bitcoin.PrivateKey,
        readonly onReceive: (tx: Bitcoind.Transaction, vout: Bitcoind.Output) => void,
        readonly onSpend: (tx: Bitcoind.Transaction, vin: Bitcoind.Input) => void,
    ) {
        this.scriptPubKey = Bitcoin.Script.p2wpkhLock(this.pk.toPubKey(true).hash160());

        this.scriptPubKeyHex = this.scriptPubKey.serializeCmds().toString("hex");
    }

    public getUtxo(): string {
        return this.utxos.keys().next().value;
    }

    public async sync() {
        //
        this.bestBlockHash = await this.bitcoind.getBlockHash(1);

        // eslint-disable-next-line no-constant-condition
        while (true) {
            console.log("syncing", this.bestBlockHash);
            const block = await this.bitcoind.getBlock(this.bestBlockHash);

            await this.processBlock(block);

            if (!block.nextblockhash) break;
            this.bestBlockHash = block.nextblockhash;
        }
    }

    public async monitor() {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const bestHash = await this.bitcoind.getBestBlockHash();
            if (bestHash !== this.bestBlockHash) {
                console.log("block", bestHash);
                this.bestBlockHash = bestHash;

                const block = await this.bitcoind.getBlock(bestHash);
                await this.processBlock(block);
            }
            await wait(5000); // try every 5 seconds
        }
    }

    protected async processBlock(block: Bitcoind.Block) {
        // scan for receipt
        const results = this.scanBlockForReceipt(block, this.scriptPubKeyHex);
        for (const [tx, vout] of results) {
            const utxo = `${tx.txid}:${vout.n}`;
            const value = Bitcoin.Value.fromBitcoin(vout.value);
            console.log(`received ${utxo} ${vout.value}`);
            this.utxos.set(utxo, value);
            await this.onReceive(tx, vout);
        }

        // scan for spend
        const spends = this.scanBlockForSpend(block, this.utxos);
        for (const [tx, vin] of spends) {
            const utxo = `${vin.txid}:${vin.vout}`;
            const value = this.utxos.get(utxo);
            console.log(`spent ${utxo} ${value.bitcoin}`);
            this.utxos.delete(utxo);
            await this.onSpend(tx, vin);
        }
    }

    protected *scanBlockForReceipt(
        block: Bitcoind.Block,
        scriptSig: string,
    ): Generator<[Bitcoind.Transaction, Bitcoind.Output]> {
        for (const tx of block.tx) {
            const vouts = this.scanTxForReceipt(tx, scriptSig);
            for (const vout of vouts) {
                yield [tx, vout];
            }
        }
    }

    protected *scanTxForReceipt(
        tx: Bitcoind.Transaction,
        scriptSig: string,
    ): Generator<Bitcoind.Output> {
        for (const vout of tx.vout) {
            if (vout.scriptPubKey.hex === scriptSig) {
                yield vout;
            }
        }
    }

    protected *scanBlockForSpend(
        block: Bitcoind.Block,
        outpoints: Map<string, Bitcoin.Value>,
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
        outpoints: Map<string, Bitcoin.Value>,
    ): Generator<Bitcoind.Input> {
        for (const vin of tx.vin) {
            const outpoint = `${vin.txid}:${vin.vout}`;
            if (outpoints.has(outpoint)) {
                yield vin;
            }
        }
    }
}
