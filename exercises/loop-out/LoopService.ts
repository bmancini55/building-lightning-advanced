import crypto from "crypto";
import * as Bitcoin from "@node-lightning/bitcoin";
import * as Bitcoind from "@node-lightning/bitcoind";
import { BitcoindClient } from "@node-lightning/bitcoind";
import { ClientFactory } from "../../shared/ClientFactory";
import { ILndClient } from "../../shared/data/lnd/ILndClient";
import { Lnd } from "../../shared/data/lnd/v0.12.1-beta/Types";
import { OutPoint, PrivateKey, Tx } from "@node-lightning/bitcoin";
import { Wallet } from "./Wallet";
import { prompt } from "enquirer";
import { createHtlcDescriptor as createHtlcDescriptor } from "./CreateHtlcDescriptor";
import { BlockMonitor } from "./BlockMonitor";

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class LoopService {
    public lightning: ILndClient;
    public bitcoind: BitcoindClient;

    async start() {
        // Constructs a LND client from the environment variables
        this.lightning = await ClientFactory.lndFromEnv();

        // Construct bitcoind client
        this.bitcoind = new BitcoindClient({
            host: "127.0.0.1",
            port: 18443,
            rpcuser: "polaruser",
            rpcpassword: "polarpass",
            zmqpubrawblock: "tcp://127.0.0.1:28334",
            zmqpubrawtx: "tcp://127.0.0.1:29335",
        });
    }

    public async generateInvoice(hash: Buffer, value: number) {
        const invoice = await this.lightning.addHoldInvoice({
            hash: hash,
            value: value.toString(),
            cltv_expiry: "80",
        });
        return invoice;
    }

    public async waitForInvoicePayment(hash: Buffer): Promise<Lnd.Invoice> {
        return new Promise(resolve => {
            this.lightning.subscribeSingleInvoice({ r_hash: hash }, invoice => {
                console.log(invoice.r_hash.toString("hex"), invoice.state);
                if (invoice.state === "ACCEPTED") {
                    console.log("invoice paid, you may proceed");
                    resolve(invoice);
                }
            });
        });
    }

    public async createHtlcTx(
        hash: Buffer,
        amount: Bitcoin.Value,
        theirAddress: string,
        ourKey: Bitcoin.PrivateKey,
        utxo: Bitcoin.OutPoint,
    ) {
        const utxoInfo = await this.bitcoind.getUtxo(utxo.txid.toString(), utxo.outputIndex);
        const utxoValue = Bitcoin.Value.fromBitcoin(utxoInfo.value);

        const ourPubKey = ourKey.toPubKey(true);

        const theirAddressDecoded = Bitcoin.Address.decodeBech32(theirAddress);

        const txBuilder = new Bitcoin.TxBuilder();
        txBuilder.addInput(utxo, Bitcoin.Sequence.rbf());

        // add the change output
        const fees = Bitcoin.Value.fromSats(244); // use a fixed fee for simplicity
        const changeOutput = utxoValue.clone();
        changeOutput.sub(amount);
        changeOutput.sub(fees);
        const changeScriptPubKey = Bitcoin.Script.p2wpkhLock(ourPubKey.toBuffer());
        txBuilder.addOutput(changeOutput, changeScriptPubKey);

        // add the amount output
        const htlcScriptPubKey = createHtlcDescriptor(
            hash,
            theirAddressDecoded.program,
            ourPubKey.hash160(),
        );

        txBuilder.addOutput(amount, Bitcoin.Script.p2wshLock(htlcScriptPubKey));
        txBuilder.locktime = Bitcoin.LockTime.zero();

        txBuilder.addWitness(
            0,
            txBuilder.signSegWitv0(
                0,
                Bitcoin.Script.p2pkhLock(ourPubKey.toBuffer()),
                ourKey.toBuffer(),
                utxoValue,
            ),
        );
        txBuilder.addWitness(0, ourPubKey.toBuffer());

        return txBuilder.toTx();
    }

    public async sendTx(tx: Tx): Promise<string> {
        return await this.bitcoind.sendRawTransaction(tx.toHex());
    }

    public async settleInvoice(preimage: Buffer): Promise<void> {
        await this.lightning.settleInvoice(preimage);
    }
}

async function run() {
    const service = new LoopService();
    await service.start();

    // PreReqs:
    // Hash
    // Private key of funds of funds

    // Bob creates hash and provides a pubkey where she wants funds
    // Alice generates an invoice for the hash and we spit this out
    // Bob pays invoices
    // Alice upon receipt of payment creates HTLC tx and pays it
    // Alice watches output to look for payment
    // Bob pays the transaction
    // Alice sees the HTLC payment and settles online

    // generate a private key for our wallet

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

    const monitor = new BlockMonitor(service.bitcoind);
    const wallet = new Wallet(monitor);
    wallet.addKey(ourPrivKey);

    console.log("performing sync");
    await monitor.sync();
    monitor.watch();

    // add  some funds to the private key
    console.log(`adding funds to ${ourAddress}`);
    service.bitcoind.sendToAddress(ourPrivKey.toPubKey(true).toP2wpkhAddress(), 1);

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

    // prompt for their address
    result = await prompt({
        type: "input",
        name: "address",
        message: "Enter their payment address",
    });
    const theirAddress = result.address;

    // create an invoice for the amount
    const invoice = await service.generateInvoice(hash, Number(satoshis.sats));
    console.log("they need to pay this invoice", invoice.payment_request);

    // wait for the invoice to be paid
    await service.waitForInvoicePayment(hash);
    console.log("invoice has been paid");

    // Get a utxo with available funds. This is a simplification but normally we would obtain one
    // or more UTXOs from the wallet that have enough value.
    const utxo = OutPoint.fromString(wallet.getUtxo());

    // Create the HTLC transaction
    const tx = await service.createHtlcTx(hash, satoshis, theirAddress, ourPrivKey, utxo);

    // Watch the outpoint
    wallet.utxos.add(tx.txId.toString() + ":1");

    // Broadcast the transaction
    const htlcTxId = await service.sendTx(tx);
    console.log("send utxo", htlcTxId);

    // wait for spend of HTLC
    const htlcOutpoint = new Bitcoin.OutPoint(htlcTxId, 1);
    monitor.add(async block => {
        for (const tx of block.tx) {
            for (const input of tx.vin) {
                // we have a match!
                if (
                    input.txid === htlcOutpoint.txid.toString(Bitcoin.HashByteOrder.RPC) &&
                    input.vout === htlcOutpoint.outputIndex
                ) {
                    // extract preimage
                    const preimage = Buffer.from(input.txinwitness[2], "hex");
                    console.log("received preimage", preimage.toString("hex"));

                    if (preimage.length) {
                        await service.settleInvoice(preimage);
                        console.log("complete");
                    }
                }
            }
        }
    });
}

run().catch(console.error);