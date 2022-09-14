export enum RequestState {
    Pending,
    AwaitingIncomingHtlcAccepted,
    AwaitingOutgoingHtlcSettlement,
    Complete,
}
