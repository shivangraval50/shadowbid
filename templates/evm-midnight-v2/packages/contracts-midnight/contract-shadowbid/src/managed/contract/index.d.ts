import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  register_auction(context: __compactRuntime.CircuitContext<PS>,
                   id_0: Uint8Array,
                   version_0: bigint,
                   chain_0: bigint,
                   evm_0: Uint8Array,
                   network_0: Uint8Array,
                   midnight_0: Uint8Array,
                   commit_by_0: bigint,
                   settle_by_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  commit_bid_0(context: __compactRuntime.CircuitContext<PS>,
               bidder_0: Uint8Array,
               amount_0: bigint,
               salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  commit_bid_1(context: __compactRuntime.CircuitContext<PS>,
               bidder_0: Uint8Array,
               amount_0: bigint,
               salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  commit_bid_2(context: __compactRuntime.CircuitContext<PS>,
               bidder_0: Uint8Array,
               amount_0: bigint,
               salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  close_commitments(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  open_and_consume_0(context: __compactRuntime.CircuitContext<PS>,
                     bidder_0: Uint8Array,
                     amount_0: bigint,
                     salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  open_and_consume_1(context: __compactRuntime.CircuitContext<PS>,
                     bidder_0: Uint8Array,
                     amount_0: bigint,
                     salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  open_and_consume_2(context: __compactRuntime.CircuitContext<PS>,
                     bidder_0: Uint8Array,
                     amount_0: bigint,
                     salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publish_coordinator_result(context: __compactRuntime.CircuitContext<PS>,
                             winner__0: Uint8Array,
                             commitment_0: Uint8Array,
                             amount_0: bigint,
                             digest_0: Uint8Array,
                             nonce_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type ProvableCircuits<PS> = {
  register_auction(context: __compactRuntime.CircuitContext<PS>,
                   id_0: Uint8Array,
                   version_0: bigint,
                   chain_0: bigint,
                   evm_0: Uint8Array,
                   network_0: Uint8Array,
                   midnight_0: Uint8Array,
                   commit_by_0: bigint,
                   settle_by_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  commit_bid_0(context: __compactRuntime.CircuitContext<PS>,
               bidder_0: Uint8Array,
               amount_0: bigint,
               salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  commit_bid_1(context: __compactRuntime.CircuitContext<PS>,
               bidder_0: Uint8Array,
               amount_0: bigint,
               salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  commit_bid_2(context: __compactRuntime.CircuitContext<PS>,
               bidder_0: Uint8Array,
               amount_0: bigint,
               salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  close_commitments(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  open_and_consume_0(context: __compactRuntime.CircuitContext<PS>,
                     bidder_0: Uint8Array,
                     amount_0: bigint,
                     salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  open_and_consume_1(context: __compactRuntime.CircuitContext<PS>,
                     bidder_0: Uint8Array,
                     amount_0: bigint,
                     salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  open_and_consume_2(context: __compactRuntime.CircuitContext<PS>,
                     bidder_0: Uint8Array,
                     amount_0: bigint,
                     salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publish_coordinator_result(context: __compactRuntime.CircuitContext<PS>,
                             winner__0: Uint8Array,
                             commitment_0: Uint8Array,
                             amount_0: bigint,
                             digest_0: Uint8Array,
                             nonce_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  register_auction(context: __compactRuntime.CircuitContext<PS>,
                   id_0: Uint8Array,
                   version_0: bigint,
                   chain_0: bigint,
                   evm_0: Uint8Array,
                   network_0: Uint8Array,
                   midnight_0: Uint8Array,
                   commit_by_0: bigint,
                   settle_by_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
  commit_bid_0(context: __compactRuntime.CircuitContext<PS>,
               bidder_0: Uint8Array,
               amount_0: bigint,
               salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  commit_bid_1(context: __compactRuntime.CircuitContext<PS>,
               bidder_0: Uint8Array,
               amount_0: bigint,
               salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  commit_bid_2(context: __compactRuntime.CircuitContext<PS>,
               bidder_0: Uint8Array,
               amount_0: bigint,
               salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  close_commitments(context: __compactRuntime.CircuitContext<PS>): Promise<__compactRuntime.CircuitResults<PS, []>>;
  open_and_consume_0(context: __compactRuntime.CircuitContext<PS>,
                     bidder_0: Uint8Array,
                     amount_0: bigint,
                     salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  open_and_consume_1(context: __compactRuntime.CircuitContext<PS>,
                     bidder_0: Uint8Array,
                     amount_0: bigint,
                     salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  open_and_consume_2(context: __compactRuntime.CircuitContext<PS>,
                     bidder_0: Uint8Array,
                     amount_0: bigint,
                     salt_0: Uint8Array): Promise<__compactRuntime.CircuitResults<PS, []>>;
  publish_coordinator_result(context: __compactRuntime.CircuitContext<PS>,
                             winner__0: Uint8Array,
                             commitment_0: Uint8Array,
                             amount_0: bigint,
                             digest_0: Uint8Array,
                             nonce_0: bigint): Promise<__compactRuntime.CircuitResults<PS, []>>;
}

export type Ledger = {
  readonly initialized: boolean;
  readonly commitments_closed: boolean;
  readonly settled: boolean;
  readonly auction_id: Uint8Array;
  readonly protocol_version: bigint;
  readonly evm_chain_id: bigint;
  readonly evm_auction: Uint8Array;
  readonly midnight_network: Uint8Array;
  readonly midnight_contract: Uint8Array;
  readonly commit_deadline: bigint;
  readonly settlement_deadline: bigint;
  readonly commitment_count: bigint;
  readonly commitment_0: Uint8Array;
  readonly commitment_1: Uint8Array;
  readonly commitment_2: Uint8Array;
  readonly committed_0: boolean;
  readonly committed_1: boolean;
  readonly committed_2: boolean;
  readonly nullifier_0: Uint8Array;
  readonly nullifier_1: Uint8Array;
  readonly nullifier_2: Uint8Array;
  readonly consumed_0: boolean;
  readonly consumed_1: boolean;
  readonly consumed_2: boolean;
  readonly winner: Uint8Array;
  readonly winning_commitment: Uint8Array;
  readonly winning_amount: bigint;
  readonly settlement_digest: Uint8Array;
  readonly settlement_nonce: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): Promise<__compactRuntime.ConstructorResult<PS>>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
export declare const expectedVk: Record<string, string>;
