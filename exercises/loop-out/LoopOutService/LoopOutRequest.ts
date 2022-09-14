import * as Bitcoin from "@node-lightning/bitcoin";
import { LoopOutRequestState } from "./LoopOutRequestState";

// should state machine have deps
export class LoopOutRequest {
    public paymentRequest: string;
    public feeSats: number;
    public finalCltvExpiryDelta: number;
    public htlcTxId: string;
    public ourKey: Bitcoin.PrivateKey;

    constructor(
        readonly theirAddress: string,
        readonly hash: string,
        readonly loopOutSats: number,
        public state = LoopOutRequestState.Pending,
    ) {}
}
