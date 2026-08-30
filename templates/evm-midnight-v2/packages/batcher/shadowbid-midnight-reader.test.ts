import { describe, expect, test } from "bun:test";
import {
  LiveMidnightAuctionStateReader,
  type ContractStateSource,
  type MidnightReaderFailure,
} from "./shadowbid-midnight-reader.ts";

function recorder() {
  const failures: MidnightReaderFailure[] = [];
  return { failures, record: (f: MidnightReaderFailure) => failures.push(f) };
}

describe("LiveMidnightAuctionStateReader — real network behavior against unreachable/nonexistent targets", () => {
  // These two tests use a genuinely real indexerPublicDataProvider (no injected
  // fake) pointed at addresses that are actually unreachable or actually lack
  // a contract, per the requirement not to use mocks as evidence live
  // integration works. They exercise the real GraphQL client and its real
  // error classification (IndexerError subclasses), not a stand-in for it.

  test("indexer unavailable: connecting to a port nothing listens on fails closed", async () => {
    const { failures, record } = recorder();
    const reader = new LiveMidnightAuctionStateReader(
      { indexerQueryUrl: "http://127.0.0.1:59999/api/v4/graphql", indexerSubscriptionUrl: "ws://127.0.0.1:59999/api/v4/graphql/ws" },
      record,
    );
    const result = await reader.getAuctionLedgerState("a".repeat(64));
    expect(result).toBeNull();
    expect(failures).toHaveLength(1);
    expect(failures[0]!.kind).toBe("indexer-unavailable");
  }, 20_000); // Apollo/graphql-ws retries with backoff before surfacing the connection failure; a real client is genuinely slower to fail than bun:test's 5s default.

  test("invalid contract address format fails closed without any network call", async () => {
    const { failures, record } = recorder();
    const reader = new LiveMidnightAuctionStateReader(
      { indexerQueryUrl: "http://127.0.0.1:59999/api/v4/graphql", indexerSubscriptionUrl: "ws://127.0.0.1:59999/api/v4/graphql/ws" },
      record,
    );
    for (const badAddress of ["0x" + "a".repeat(64), "not-hex", "a".repeat(63), "a".repeat(65)]) {
      const result = await reader.getAuctionLedgerState(badAddress);
      expect(result).toBeNull();
    }
    expect(failures.every((f) => f.kind === "invalid-contract-address")).toBe(true);
    expect(failures).toHaveLength(4);
  });
});

describe("LiveMidnightAuctionStateReader — decode-failure paths (injected ContractStateSource)", () => {
  // These tests substitute only the network-fetch step (queryContractState)
  // with a minimal stand-in returning real-shaped data (or deliberately
  // malformed data), then let the *real* generated ShadowBidContract.ledger()
  // decoder and the real toHexLedgerState adapter run unmodified — this is
  // dependency injection at the I/O boundary for a case a live indexer here
  // cannot deterministically reproduce (a contract that both exists and is
  // malformed), not a mock standing in for the decode logic under test.

  test("missing contract: queryContractState resolving null fails closed", async () => {
    const { failures, record } = recorder();
    const source: ContractStateSource = {
      queryContractState: async () => null,
      dispose: async () => {},
    };
    const reader = new LiveMidnightAuctionStateReader(
      { indexerQueryUrl: "unused", indexerSubscriptionUrl: "unused" },
      record,
      source,
    );
    const result = await reader.getAuctionLedgerState("b".repeat(64));
    expect(result).toBeNull();
    expect(failures).toEqual([{ kind: "missing-contract", contractAddress: "b".repeat(64) }]);
  });

  test("malformed state: a contractState.data ShadowBidContract.ledger() cannot decode fails closed", async () => {
    const { failures, record } = recorder();
    const source: ContractStateSource = {
      // A value structurally incompatible with the generated ledger()'s
      // expected StateValue/ChargedState shape — this is what a
      // non-ShadowBid contract deployed at the queried address, or a
      // corrupted state row, produces.
      queryContractState: async () => ({ data: { not: "a real chargedState" } }) as any,
      dispose: async () => {},
    };
    const reader = new LiveMidnightAuctionStateReader(
      { indexerQueryUrl: "unused", indexerSubscriptionUrl: "unused" },
      record,
      source,
    );
    const result = await reader.getAuctionLedgerState("c".repeat(64));
    expect(result).toBeNull();
    expect(failures).toHaveLength(1);
    expect(failures[0]!.kind).toBe("malformed-state");
  });

  // "missing-auction" (a real, decodable ChargedState where initialized=false,
  // i.e. a deployed-but-never-registered ShadowBid contract) is not tested
  // here: constructing a genuine ChargedState/StateValue requires the same
  // wasm-backed onchain-runtime constructor context a real deployment uses,
  // which is not something to fake with a stand-in without misrepresenting
  // what was tested. That path is exercised for real in the orchestrated
  // `bun run test` run (packages/tests/run-tests.ts), which deploys
  // contract-shadowbid fresh via @effectstream/midnight-contracts/deploy and
  // reads its ledger before any `register_auction` call — see
  // docs/CLAUDE_SETTLEMENT_REPORT.md for that run's recorded results. The
  // `if (!hexState.initialized) return this.fail({kind: "missing-auction", ...})`
  // check itself is a two-line, directly-readable guard in shadowbid-midnight-reader.ts.
});
