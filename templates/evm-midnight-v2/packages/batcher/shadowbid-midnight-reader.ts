import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import * as ShadowBidContract from "@evm-midnight/shadowbid-midnight-contract/contract";
import { toHexLedgerState, type MidnightAuctionLedgerState, type MidnightAuctionStateReader } from "./shadowbid-coordinator.ts";

/**
 * Discriminated failure reasons for a live Midnight ledger read. Every
 * `getAuctionLedgerState` call still resolves the `MidnightAuctionStateReader`
 * contract (`MidnightAuctionLedgerState | null`) so the authoritative-reader
 * pipeline in shadowbid-coordinator.ts needs no changes and stays fail-closed
 * on every one of these; the optional `recordFailure` callback below observes
 * which one just happened, for logging/diagnostics only — it is never
 * consulted to decide settlement.
 *
 * There is no `wrong-domain` case here: `midnight_network`/`midnight_contract`
 * are opaque `Bytes<32>` domain separators the caller of `register_auction`
 * chooses (shadowbid.compact:15, docs/DECISIONS.md's analogous auction-id
 * note) — this template defines no canonical encoding of a network *name*
 * into those bytes, so this reader cannot independently decide a fetched
 * contract "belongs to the wrong network" from the ledger alone. That
 * byte-exact domain comparison is already performed, correctly, by
 * `createEip712AuthoritativeReader` in shadowbid-coordinator.ts against the
 * signed request's own `auction.midnightDomain`/`auction.midnightContract`;
 * duplicating it here would be either redundant or, if done by guessing an
 * encoding, actively wrong.
 */
export type MidnightReaderFailure =
  | { kind: "indexer-unavailable"; cause: unknown }
  | { kind: "invalid-contract-address"; contractAddress: string }
  | { kind: "missing-contract"; contractAddress: string }
  | { kind: "missing-auction"; contractAddress: string }
  | { kind: "malformed-state"; contractAddress: string; cause: unknown };

export class MidnightReaderError extends Error {
  constructor(readonly failure: MidnightReaderFailure) {
    super(MidnightReaderError.describe(failure));
  }
  private static describe(failure: MidnightReaderFailure): string {
    switch (failure.kind) {
      case "indexer-unavailable": return "Midnight indexer is unavailable";
      case "invalid-contract-address": return `"${failure.contractAddress}" is not a valid Midnight contract address`;
      case "missing-contract": return `no contract deployed at ${failure.contractAddress}`;
      case "missing-auction": return `contract at ${failure.contractAddress} has no registered auction (initialized=false)`;
      case "malformed-state": return `contract state at ${failure.contractAddress} could not be decoded as a ShadowBid ledger`;
    }
  }
}

export type LiveMidnightAuctionStateReaderOptions = {
  /** e.g. `midnightNetworkConfig.indexer` (GraphQL HTTP endpoint). */
  indexerQueryUrl: string;
  /** e.g. `midnightNetworkConfig.indexerWS` (GraphQL WS endpoint the client requires even for query-only use). */
  indexerSubscriptionUrl: string;
};

/**
 * Real `MidnightAuctionStateReader` backed by the installed
 * `@midnight-ntwrk/midnight-js-indexer-public-data-provider` GraphQL client
 * and the generated `ShadowBidContract.ledger()` decoder
 * (packages/contracts-midnight/contract-shadowbid/src/managed/contract/index.js,
 * exported at `@evm-midnight/shadowbid-midnight-contract/contract` — the
 * same generated binding `packages/node/config.dev.ts` already imports).
 *
 * Reuses the reference pattern from `packages/frontend/client/src/increment.ts`'s
 * `getCounterLedgerState`: `queryContractState(address).data` fed directly into
 * the generated ledger decoder. No wallet, private-state provider, or proof
 * provider is constructed — reading public ledger state needs none of them.
 *
 * Only ever reads the contract's *public* ledger fields (see `Ledger` in
 * managed/contract/index.d.ts: `initialized`, `commitments_closed`,
 * `auction_id`, `evm_chain_id`, `evm_auction`, `midnight_network`,
 * `midnight_contract`, `commit_deadline`, `settlement_deadline`,
 * `commitment_0/1/2`, `committed_0/1/2`, `nullifier_0/1/2`, `consumed_0/1/2`).
 * There is no private witness, salt, bid amount, or bidder identity in this
 * type for it to expose even by accident — the Compact contract's `disclose()`
 * boundary already enforces that (see shadowbid.compact, unchanged).
 *
 * Fails closed (`null`) on every `MidnightReaderFailure` case. Construct with
 * a `recordFailure` callback to observe *why* for logging without weakening that.
 */
/** The subset of `IndexerPublicDataProvider` this reader actually calls. */
export interface ContractStateSource {
  queryContractState: ReturnType<typeof indexerPublicDataProvider>["queryContractState"];
  dispose: ReturnType<typeof indexerPublicDataProvider>["dispose"];
}

export class LiveMidnightAuctionStateReader implements MidnightAuctionStateReader {
  private readonly provider: ContractStateSource;
  private readonly recordFailure?: (failure: MidnightReaderFailure) => void;

  /**
   * `provider` defaults to a real `indexerPublicDataProvider` built from
   * `options`; tests may substitute a minimal `ContractStateSource` to
   * exercise decode-failure handling without a live indexer connection, but
   * production code must never pass this argument.
   */
  constructor(
    options: LiveMidnightAuctionStateReaderOptions,
    recordFailure?: (failure: MidnightReaderFailure) => void,
    provider: ContractStateSource = indexerPublicDataProvider({
      queryURL: options.indexerQueryUrl,
      subscriptionURL: options.indexerSubscriptionUrl,
    }),
  ) {
    this.provider = provider;
    this.recordFailure = recordFailure;
  }

  /** Releases the underlying GraphQL WebSocket connection. Call on shutdown. */
  async dispose(): Promise<void> {
    await this.provider.dispose();
  }

  async getAuctionLedgerState(midnightContractAddress: string): Promise<MidnightAuctionLedgerState | null> {
    // Midnight contract addresses are bare (unprefixed) 32-byte hex, unlike
    // EVM's 0x-prefixed 20-byte addresses — confirmed against
    // assertIsContractAddress's runtime implementation in
    // @midnight-ntwrk/midnight-js-utils, which explicitly rejects a "0x" prefix.
    if (!/^[0-9a-fA-F]{64}$/.test(midnightContractAddress)) {
      return this.fail({ kind: "invalid-contract-address", contractAddress: midnightContractAddress });
    }

    let contractState;
    try {
      contractState = await this.provider.queryContractState(midnightContractAddress as never);
    } catch (cause) {
      // Any failure to reach or parse a response from the indexer means the
      // same thing operationally: fail closed. This deliberately does not
      // narrow to `instanceof IndexerError` — a genuinely unreachable
      // endpoint (connection refused, DNS failure, TLS failure) surfaces as
      // a plain TypeError from the underlying fetch/WebSocket client before
      // ever reaching the GraphQL/IndexerError layer; narrowing here let such
      // a TypeError propagate uncaught out of this method instead of failing
      // closed, defeating the entire point of this catch.
      return this.fail({ kind: "indexer-unavailable", cause });
    }
    if (contractState == null) {
      return this.fail({ kind: "missing-contract", contractAddress: midnightContractAddress });
    }

    let hexState: MidnightAuctionLedgerState;
    try {
      // `ledger()` returns lazy getters (see managed/contract/index.js); a
      // malformed/foreign contract's state can throw only once a field is
      // actually read, not at this call. Reading every field up front turns
      // that into one caught, typed failure instead of a crash deep in the
      // caller's later domain-comparison logic.
      const l = ShadowBidContract.ledger(contractState.data);
      hexState = toHexLedgerState({
        initialized: l.initialized, commitments_closed: l.commitments_closed,
        auction_id: l.auction_id, evm_chain_id: l.evm_chain_id, evm_auction: l.evm_auction,
        midnight_network: l.midnight_network, midnight_contract: l.midnight_contract,
        commit_deadline: l.commit_deadline, settlement_deadline: l.settlement_deadline,
        commitment_0: l.commitment_0, commitment_1: l.commitment_1, commitment_2: l.commitment_2,
        committed_0: l.committed_0, committed_1: l.committed_1, committed_2: l.committed_2,
      });
    } catch (cause) {
      return this.fail({ kind: "malformed-state", contractAddress: midnightContractAddress, cause });
    }

    if (!hexState.initialized) {
      return this.fail({ kind: "missing-auction", contractAddress: midnightContractAddress });
    }

    return hexState;
  }

  private fail(failure: MidnightReaderFailure): null {
    this.recordFailure?.(failure);
    return null;
  }
}
