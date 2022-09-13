import * as Bitcoind from "@node-lightning/bitcoind";
import { wait } from "./Wait";

export type BlockConnectedHandler = (block: Bitcoind.Block) => Promise<void>;

export class BlockMonitor {
    public bestBlockHash: string;
    public connectedHandlers: Set<BlockConnectedHandler> = new Set();

    constructor(readonly bitcoind: Bitcoind.BitcoindClient) {}

    public addConnectedHandler(handler: BlockConnectedHandler) {
        this.connectedHandlers.add(handler);
    }

    public async sync() {
        this.bestBlockHash = await this.bitcoind.getBlockHash(1);

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const block = await this.bitcoind.getBlock(this.bestBlockHash);

            for (const handler of this.connectedHandlers) {
                await handler(block);
            }

            if (!block.nextblockhash) {
                break;
            } else {
                this.bestBlockHash = block.nextblockhash;
            }
        }
    }

    public async watch() {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const currentBlock = await this.bitcoind.getBlock(this.bestBlockHash);
            if (currentBlock.nextblockhash && currentBlock.nextblockhash !== this.bestBlockHash) {
                // get the next block
                const nextBlock = await this.bitcoind.getBlock(currentBlock.nextblockhash);

                // adjust the next hash
                this.bestBlockHash = nextBlock.hash;

                // fire a handler for attachment
                for (const connectedHandler of this.connectedHandlers) {
                    await connectedHandler(nextBlock);
                }
            } else {
                await wait(5000);
            }
        }
    }
}
