import * as Bitcoin from "@node-lightning/bitcoin";
import { RequestState } from "./RequestState";

// should state machine have deps
export class Request {
    public paymentRequest: string;
    public feeSats: Bitcoin.Value;
    public finalCltvExpiryDelta: number;
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

    constructor(
        readonly htlcClaimAddress: string,
        readonly hash: Buffer,
        readonly loopOutSats: Bitcoin.Value,
        public state = RequestState.Pending,
    ) {}
}
