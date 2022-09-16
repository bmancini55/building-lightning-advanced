import { ILogger } from "@node-lightning/logger";
import * as Bitcoin from "@node-lightning/bitcoin";
import { RequestState } from "./RequestState";

// should state machine have deps
export class Request {
    protected _state: RequestState;
    public logger: ILogger;
    public paymentRequest: string;
    public feeSats: Bitcoin.Value;
    public onChainCltvExpiryDelta: number;
    public htlcOutpoint: Bitcoin.OutPoint;
    public htlcRefundKey: Bitcoin.PrivateKey;

    public get htlcClaimPubKeyHash(): Buffer {
        const result = Bitcoin.Address.decodeBech32(this.htlcClaimAddress);
        return result.program;
    }

    public get htlcRefundAddress(): string {
        return this.htlcRefundKey.toPubKey(true).toP2wpkhAddress();
    }

    public get hashHex(): string {
        return this.hash.toString("hex");
    }

    public get state(): RequestState {
        return this._state;
    }

    public set state(val: RequestState) {
        this._state = val;
        this.logger.info("state=" + RequestState[val]);
    }

    constructor(
        logger: ILogger,
        readonly htlcClaimAddress: string,
        readonly hash: Buffer,
        readonly loopOutSats: Bitcoin.Value,
    ) {
        this.logger = logger.sub(Request.name, this.hash.toString("hex").substring(16));
        this.state = RequestState.Pending;
    }
}
