/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-namespace */
export namespace Lnd {
    export type uint64 = string;
    export type int64 = string;
    export type uint32 = number;
    export type int32 = number;

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
}
