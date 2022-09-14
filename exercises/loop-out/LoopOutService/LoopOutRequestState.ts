export enum LoopOutRequestState {
    Pending,
    AwaitingIncomingHtlcAccepted,
    AwaitingOutgoingHtlcSettlement,
    Complete,
}
