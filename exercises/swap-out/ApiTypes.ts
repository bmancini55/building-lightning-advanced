// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Api {
    export type SwapOutRequest = {
        htlcClaimAddress: string;
        hash: string;
        swapOutSats: number;
    };

    export type SwapOutResponse = {
        htlcRefundAddress: string;
        paymentRequest: string;
    };
}
