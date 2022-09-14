import * as Bitcoin from "@node-lightning/bitcoin";
import { RequestState } from "./RequestState";

// should state machine have deps
export class Request {
    public paymentRequest: string;
    public feeSats: Bitcoin.Value;
    public finalCltvExpiryDelta: number;
    public htlcOutpoint: Bitcoin.OutPoint;
    public ourKey: Bitcoin.PrivateKey;

    public get theirPubKeyHash(): Buffer {
        const result = Bitcoin.Address.decodeBech32(this.theirAddress);
        return result.program;
    }

    public get hashHex(): string {
        return this.hash.toString("hex");
    }

    constructor(
        readonly theirAddress: string,
        readonly hash: Buffer,
        readonly loopOutSats: Bitcoin.Value,
        public state = RequestState.Pending,
    ) {}
}
