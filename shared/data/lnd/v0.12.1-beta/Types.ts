/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-namespace */
export namespace Lnd {
    export type uint64 = string;
    export type int64 = string;
    export type uint32 = number;
    export type int32 = number;
    export type bytes = Buffer;
    export type double = number;

    export interface Info {
        uris: string[];
        chains: Chain[];
        features: FeatureMap;
        identity_pubkey: string;
        alias: string;
        num_pending_channels: number;
        num_active_channels: number;
        num_peers: number;
        block_height: number;
        block_hash: string;
        synced_to_chain: boolean;
        testnet: boolean;
        best_header_timestamp: string;
        version: string;
        num_inactive_channels: number;
        color: number;
        synced_to_graph: boolean;
        commit_hash: string;
    }

    export interface Chain {
        chain: string;
        network: string;
    }

    export interface Graph {
        // Exercise: define the `nodes` and `edges` properties in this interface.
        // These arrays of LightningNode and ChannelEdge objects.
        replace_me_with_actual_properties: any;
    }

    export interface LightningNode {
        last_update: number;
        pub_key: string;
        alias: string;
        addresses: NodeAddress[];
        color: string;
        features: FeatureMap;
    }

    export interface FeatureMap {
        [key: string]: Feature;
    }

    export interface Feature {
        name: string;
        is_required: boolean;
        is_known: boolean;
    }

    export interface NodeAddress {
        network: string;
        addr: string;
    }

    export interface ChannelEdge {
        channel_id: string;
        chan_point: string;
        last_update: string;
        node1_pub: string;
        node2_pub: string;
        capacity: string;
        node1_policy: RoutingPolicy;
        node2_policy: RoutingPolicy;
    }

    export interface RoutingPolicy {
        time_lock_delta: number;
        min_htlc: string;
        fee_base_msat: string;
        fee_rate_milli_msat: string;
        disabled: boolean;
        max_htlc_msat: string;
        last_update: number;
    }

    export interface GraphUpdate {
        result: {
            node_updates: NodeUpdate[];
            channel_updates: ChannelEdgeUpdate[];
            closed_chans: ClosedChannelUpdate[];
        };
    }

    export interface NodeUpdate {
        identity_key: string;
        global_features: number;
        alias: string;
        color: string;
        node_addresses: NodeAddress[];
        features: FeatureMap;
    }

    export interface ChannelEdgeUpdate {
        chan_id: string;
        chan_point: ChannelPoint;
        capacity: string;
        routing_policy: RoutingPolicy;
        advertising_node: string;
        connecting_node: string;
    }

    export interface ChannelPoint {
        funding_txid_bytes: string;
        funding_txid_str: string;
        output_index: number;
    }

    export interface ClosedChannelUpdate {
        chan_id: string;
        capacity: string;
        closed_height: number;
        chan_point: ChannelPoint;
    }

    export interface AddInvoiceInput {
        preimage?: Buffer;
        memo?: string;
        amt?: number;
        amt_msat?: number;
        description_hash?: string;
        fallback_addr?: string;
        expiry?: number;
        private?: boolean;
    }

    export interface AddInvoiceResult {
        r_hash: Buffer;
        payment_request: string;
        add_index: number;
        payment_addr: Buffer;
    }

    export interface AddHoldInvoiceInput {
        memo?: string;
        hash: Buffer;
        value?: int64;
        value_msat?: int64;
        description_hash?: Buffer;
        expiry?: int64;
        fallback_addr?: string;
        cltv_expiry?: int64;
        private?: boolean;
    }

    export interface AddHoldInvoiceResult {
        payment_request: string;
        add_index: uint64;
        payment_addr: Buffer;
    }

    export interface Invoice {
        memo: string;
        r_preimage: Buffer;
        r_hash: Buffer;
        value: int64;
        value_msat: int64;
        settled: boolean;
        creation_date: int64;
        settle_date: int64;
        payment_request: string;
        description_hash: Buffer;
        expiry: int64;
        fallback_addr: string;
        cltv_expiry: uint64;
        route_hints: RouteHint[];
        private: boolean;
        add_index: uint64;
        settle_index: uint64;
        amt_paid: int64;
        amt_paid_sat: int64;
        amt_paid_msat: int64;
        state: InvoiceState;
        htlcs: InvoiceHtlc[];
        features: FeaturesEntry[];
        is_keysend: boolean;
        payment_addr: Buffer;
        is_amp?: boolean;
        amp_invoice_state?: AmpInvoiceStateEntry[];
    }

    export interface RouteHint {
        hop_hints: HopHint[];
    }

    export interface HopHint {
        node_id: string;
        chan_id: uint64;
        fee_base_msat: uint32;
        fee_proportional_millionths: uint32;
        cltv_expiry_delta: uint32;
    }

    export enum InvoiceState {
        Open = "OPEN",
        Settled = "SETTLED",
        Canceled = "CANCELED",
        Accepted = "ACCEPTED",
    }

    export interface InvoiceHtlc {
        chan_id: uint64;
        htlc_index: uint64;
        amt_msat: uint64;
        accept_height: int32;
        accept_time: int64;
        resolve_time: int64;
        expiry_height: int64;
        state: InvoiceHtlcState;
        custom_records: any[];
        mpp_total_amt_msat: uint64;
        amp: Amp;
    }

    export interface Amp {
        root_share: Buffer;
        set_id: Buffer;
        child_index: number;
        hash: Buffer;
        preimage: Buffer;
    }

    export enum InvoiceHtlcState {
        Accepted = "ACCEPTED",
        Settled = "SETTLED",
        Canceled = "CANCELED",
    }

    export interface FeaturesEntry {
        key: uint32;
        value: Feature;
    }

    export interface Feature {
        name: string;
        is_required: boolean;
        is_known: boolean;
    }

    export interface AmpInvoiceStateEntry {
        key: string;
        value: AmpInvoiceState;
    }

    export interface AmpInvoiceState {
        state: InvoiceHtlcState;
        settle_index: uint64;
        settle_time: int64;
        amp_paid_msat: int64;
    }

    export interface ListInvoicesRequest {
        pending_only: boolean;
        index_offset: uint64;
        num_max_invoices: uint64;
        reversed: boolean;
    }

    export interface ListInvoiceResponse {
        invoices: Invoice[];
        last_index_offset: uint64;
        first_index_offset: uint64;
    }

    export interface SubscribeInvoicesOptions {
        add_index: number;
        settle_index: number;
    }

    export interface SignMessageResponse {
        signature: string;
    }

    export interface VerifyMessageResponse {
        valid: boolean;
        pubkey: string;
    }

    export interface SendPaymentRequest {
        dest: bytes;
        amt: uint64;
        amt_msat: uint64;
        payment_hash: bytes;
        final_cltv_delta: int32;
        payment_addr: bytes;
        payment_request: string;
        timeout_seconds: int32;
        fee_limit_sat: int64;
        fee_limit_msat: int64;
        outgoing_chan_id: uint64;
        outgoing_chan_ids: uint64[];
        last_hop_pubkey: bytes;
        cltv_limit: int32;
        route_hints: RouteHint[];
        dest_custom_records: any;
        allow_self_payment: boolean;
        dest_features: number[];
        max_parts: uint32;
        no_inflight_updates: boolean;
        max_shard_size_msat: uint64;
        amp: boolean;
        time_pref: double;
    }

    export interface Payment {
        payment_hash: string;
        value: int64;
        creation_date: int64;
        fee: int64;
        payment_preimage: string;
        value_sat: int64;
        value_msat: int64;
        payment_request: string;
        status: PaymentStatus;
        fee_sat: int64;
        fee_msat: int64;
        creation_time_ns: int64;
        htlcs: HtlcAttempt[];
        payment_index: uint64;
        failure_reason: PaymentFailureReason;
    }

    export interface PaymentStatus {
        state: PaymentState;
        preimage: bytes;
        htlcs: HtlcAttempt[];
    }

    export enum PaymentState {
        IN_FLIGHT = 0,
        SUCCEEDED = 1,
        FAILED_TIMEOUT = 2,
        FAILED_NO_ROUTE = 3,
        FAILED_ERROR = 4,
        FAILED_INCORRECT_PAYMENT_DETAILS = 5,
        FAILED_INSUFFICIENT_BALANCE = 6,
    }

    export enum PaymentFailureReason {
        FAILURE_REASON_NONE = 0,
        FAILURE_REASON_TIMEOUT = 1,
        FAILURE_REASON_NO_ROUTE = 2,
        FAILURE_REASON_ERROR = 3,
        FAILURE_REASON_INCORRECT_PAYMENT_DETAILS = 4,
        FAILURE_REASON_INSUFFICIENT_BALANCE = 5,
    }

    export interface HtlcAttempt {
        attempt_id: uint64;
        status: HtlcStatus;
        route: Route;
        attempt_time_ns: int64;
        resolve_time_ns: int64;
        failure: Failure;
        preimage: bytes;
    }

    export enum HtlcStatus {
        IN_FLIGHT = 0,
        SUCCEEDED = 1,
        FAILED = 2,
    }

    export interface Failure {
        code: number;
        channel_update: ChannelUpdate;
        htlc_msat: uint64;
        onion_sha_256: bytes;
        cltv_expiry: uint32;
        flags: uint32;
        failure_source_index: uint32;
        height: uint32;
    }

    export interface ChannelUpdate {
        signature: bytes;
        chain_hash: bytes;
        chain_id: uint64;
        timestamp: uint32;
        message_flags: uint32;
        channel_flags: uint32;
        time_lock_delta: uint32;
        htlc_minimum_msat: uint64;
        base_fee: uint32;
        fee_rate: uint32;
        htlc_maximum_msat: uint64;
        extra_opaque_data: bytes;
    }

    export interface Route {
        total_time_lock: uint32;
        total_fees: int64;
        total_amt: int64;
        hops: Hop[];
        total_fees_msat: int64;
        total_amt_msat: int64;
    }

    export interface Hop {
        chan_id: uint64;
        chan_capacity: int64;
        amt_to_forward: int64;
        fee: int64;
        expiry: uint32;
        amt_to_forward_msat: int64;
        fee_msat: int64;
        pub_key: string;
        tlv_payload: boolean;
        mpp_record: MppRecord;
        custom_records: any;
        metadata: bytes;
    }

    export interface BuildRouteRequest {
        amt_msat: int64;
        final_cltv_delta: int32;
        outgoing_chan_id: uint64;
        hop_pubkeys: bytes[];
        payment_addr: bytes;
    }

    export interface BuildRouteResponse {
        route: Route;
    }

    export interface MppRecord {
        payment_addr: bytes;
        total_amt_msat: int64;
    }

    export interface ListChannelsRequest {
        active_only: boolean;
        inactive_only: boolean;
        public_only: boolean;
        private_only: boolean;
        peer: bytes;
    }

    export interface ListChannelsResponse {
        channels: Channel[];
    }

    export interface Channel {
        active: boolean;
        remote_pubkey: string;
        channel_point: string;
        chan_id: uint64;
        capacity: int64;
        local_balance: int64;
        remote_balance: int64;
        commit_fee: int64;
        commit_weight: int64;
        fee_per_kw: int64;
        unsettled_balance: int64;
        total_satoshis_sent: int64;
        total_satoshis_received: int64;
        num_updates: uint64;
        pending_htlcs: Htlc;
        csv_delay: uint32;
        private: boolean;
        initiator: boolean;
        chan_status_flags: string;
        local_chan_reserve_set: int64;
        remote_chan_reserve_set: int64;
        static_remote_key: boolean;
        commitment_type: any;
        lifetime: int64;
        uptime: int64;
        close_address: string;
        push_amount_sat: uint64;
        thaw_height: uint32;
        local_constraints: ChannelConstraints;
        remote_constraints: ChannelConstraints;
        alias_scids: uint64[];
        zero_conf: boolean;
        zero_conf_confirmed_scid: uint64;
    }

    export interface Htlc {
        incoming: boolean;
        amount: int64;
        hash_lock: bytes;
        expiration_height: uint32;
        htlc_index: uint64;
        forwarding_channel: uint64;
        forwarding_htlc_index: uint64;
    }

    export interface ChannelConstraints {
        csv_delay: uint32;
        chan_reserve_sat: uint64;
        dust_limit_sat: uint64;
        max_pending_amt_msat: uint64;
        min_htlc_msat: uint64;
        max_accepted_htlcs: uint32;
    }

    export interface SubscribeSingleInvoiceRequest {
        r_hash: bytes;
    }
}
