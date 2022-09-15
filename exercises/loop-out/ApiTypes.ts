// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Api {
    export type LoopOutRequest = {
        htlcClaimAddress: string;
        hash: string;
        loopOutSats: number;
    };

    export type LoopOutResponse = {
        htlcRefundAddress: string;
        paymentRequest: string;
    };
}
