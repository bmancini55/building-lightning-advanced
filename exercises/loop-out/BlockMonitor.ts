import * as Bitcoind from "@node-lightning/bitcoind";
import { wait } from "../../shared/Wait";

export type BlockConnectedHandler = (block: Bitcoind.Block) => Promise<void>;

/**
 * Abstraction that connects to some block source and alerts handlers
 * when blocks are connected. This is a simplified implementation, a
 * proper system would need to account for block reorganizations.
 */
export class BlockMonitor {
    protected _watching: boolean;
    public bestBlockHash: string;
    public connectedHandlers: Set<BlockConnectedHandler> = new Set();

    constructor(readonly bitcoind: Bitcoind.BitcoindClient) {}

    public addConnectedHandler(handler: BlockConnectedHandler) {
        this.connectedHandlers.add(handler);
    }

    /**
     * Starts the monitor by performing a sync and start watching
     * for new blocks.
     */
    public async start() {
        await this.sync();
        this.watch();
    }

    /**
     * Stop watching for new blocks
     */
    public async stop() {
        this._watching = false;
    }

    /**
     * Synchronize the monitor to the current tip of the best blockchain.
     * The handler will be called for each block.
     */
    protected async sync() {
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

    /**
     * Watches for new block connections. The handler will be called each
     * time a new block is connected.
     */
    protected async watch() {
        // eslint-disable-next-line no-constant-condition
        this._watching = true;
        while (this._watching) {
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
                await wait(1000);
            }
        }
    }
}
