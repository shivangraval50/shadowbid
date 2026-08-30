import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  signCoordinatorDecision,
  validateCoordinatorDecision,
  type CoordinatorDecision,
} from "./shadowbid-coordinator-core.ts";
import {
  addressToBytes32,
  createEip712AuthoritativeReader,
  FileCoordinatorResultStore,
  type Eip712Domain,
  type MidnightAuctionLedgerState,
  type MidnightAuctionStateReader,
} from "./shadowbid-coordinator.ts";
import type { ShadowBidEnvelopeV1 } from "./shadowbid-settlement.ts";

const COORDINATOR_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const coordinator = privateKeyToAccount(COORDINATOR_KEY);
const forger = privateKeyToAccount(`0x${"1".repeat(63)}a`);

const domain: Eip712Domain = { name: "ShadowBidAuction", version: "1", chainId: 31337n, verifyingContract: getAddress("0x1111111111111111111111111111111111111111") };
const midnightContractAddress = "e".repeat(64);
const commitments = { bidder8: `0x${"08".repeat(32)}` as const, bidder13: `0x${"13".repeat(32)}` as const, bidder11: `0x${"11".repeat(32)}` as const };

function baseLedger(overrides: Partial<MidnightAuctionLedgerState> = {}, nowSeconds = Math.floor(Date.now() / 1000)): MidnightAuctionLedgerState {
  return {
    initialized: true,
    commitments_closed: true,
    auction_id: `0x${(7).toString(16).padStart(64, "0")}`,
    evm_chain_id: 31337n,
    evm_auction: addressToBytes32(domain.verifyingContract),
    midnight_network: `0x${"22".repeat(32)}`,
    midnight_contract: `0x${"33".repeat(32)}`,
    commit_deadline: BigInt(nowSeconds - 60),
    settlement_deadline: BigInt(nowSeconds + 3600),
    commitment_0: commitments.bidder8, commitment_1: commitments.bidder13, commitment_2: commitments.bidder11,
    committed_0: true, committed_1: true, committed_2: true,
    consumed_0: true, consumed_1: true, consumed_2: true,
    ...overrides,
  } as MidnightAuctionLedgerState;
}

function decision(overrides: Partial<CoordinatorDecision> = {}, nowSeconds = Math.floor(Date.now() / 1000)): CoordinatorDecision {
  return {
    auctionId: "7",
    winner: getAddress("0x0000000000000000000000000000000000001313"),
    amount: 13n,
    commitment: commitments.bidder13,
    midnightContractAddress,
    midnightContract: `0x${"33".repeat(32)}`,
    midnightNetwork: `0x${"22".repeat(32)}`,
    evmChainId: 31337n,
    evmAuctionContract: domain.verifyingContract,
    resultVersion: 1n,
    expiry: BigInt(nowSeconds + 300),
    nonce: 0n,
    ...overrides,
  };
}

function readerFor(ledger: MidnightAuctionLedgerState | null): MidnightAuctionStateReader {
  return { async getAuctionLedgerState() { return ledger; } };
}

describe("validateCoordinatorDecision", () => {
  test("accepts a decision matching a closed, deadline-elapsed, live-registered auction", async () => {
    const now = Math.floor(Date.now() / 1000);
    const result = await validateCoordinatorDecision(decision({}, now), readerFor(baseLedger({}, now)), now);
    expect(result).toEqual({ valid: true });
  });

  test("rejects the zero address as winner and non-positive amounts", async () => {
    const now = Math.floor(Date.now() / 1000);
    const zeroWinner = await validateCoordinatorDecision(
      decision({ winner: "0x0000000000000000000000000000000000000000" }, now), readerFor(baseLedger({}, now)), now,
    );
    expect(zeroWinner).toMatchObject({ valid: false, failure: { kind: "invalid-decision" } });
    const zeroAmount = await validateCoordinatorDecision(decision({ amount: 0n }, now), readerFor(baseLedger({}, now)), now);
    expect(zeroAmount).toMatchObject({ valid: false, failure: { kind: "invalid-decision" } });
  });

  test("rejects an expiry that is not in the future, and one unreasonably far in the future", async () => {
    const now = Math.floor(Date.now() / 1000);
    const notFuture = await validateCoordinatorDecision(decision({ expiry: BigInt(now) }, now), readerFor(baseLedger({}, now)), now);
    expect(notFuture).toMatchObject({ valid: false, failure: { kind: "expiry-not-in-future" } });
    const tooFar = await validateCoordinatorDecision(decision({ expiry: BigInt(now + 999_999) }, now), readerFor(baseLedger({}, now)), now);
    expect(tooFar).toMatchObject({ valid: false, failure: { kind: "expiry-too-far-in-future" } });
  });

  test("fails closed when the Midnight ledger is unavailable", async () => {
    const now = Math.floor(Date.now() / 1000);
    const result = await validateCoordinatorDecision(decision({}, now), readerFor(null), now);
    expect(result).toEqual({ valid: false, failure: { kind: "midnight-state-unavailable" } });
  });

  test("rejects an unregistered auction and one whose commitments are not yet closed", async () => {
    const now = Math.floor(Date.now() / 1000);
    const unregistered = await validateCoordinatorDecision(decision({}, now), readerFor(baseLedger({ initialized: false }, now)), now);
    expect(unregistered).toEqual({ valid: false, failure: { kind: "auction-not-registered" } });
    const notClosed = await validateCoordinatorDecision(decision({}, now), readerFor(baseLedger({ commitments_closed: false }, now)), now);
    expect(notClosed).toEqual({ valid: false, failure: { kind: "commitments-not-closed" } });
  });

  test("rejects a domain mismatch on Midnight contract, Midnight network, EVM chain id, or EVM auction contract", async () => {
    const now = Math.floor(Date.now() / 1000);
    for (const overrides of [
      { midnight_contract: `0x${"99".repeat(32)}` },
      { midnight_network: `0x${"99".repeat(32)}` },
      { evm_chain_id: 1n },
      { evm_auction: `0x${"9".repeat(64)}` },
    ]) {
      const result = await validateCoordinatorDecision(decision({}, now), readerFor(baseLedger(overrides as any, now)), now);
      expect(result).toMatchObject({ valid: false, failure: { kind: "domain-mismatch" } });
    }
  });

  test("rejects a commitment that is not one of the closed/committed Midnight slots", async () => {
    const now = Math.floor(Date.now() / 1000);
    const result = await validateCoordinatorDecision(
      decision({ commitment: `0x${"77".repeat(32)}` }, now), readerFor(baseLedger({}, now)), now,
    );
    expect(result).toEqual({ valid: false, failure: { kind: "unknown-commitment" } });
  });

  test("rejects premature settlement (commit deadline not yet elapsed) and expired settlement (past settlement deadline)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const premature = await validateCoordinatorDecision(
      decision({}, now), readerFor(baseLedger({ commit_deadline: BigInt(now + 100) }, now)), now,
    );
    expect(premature).toEqual({ valid: false, failure: { kind: "deadline-not-elapsed" } });
    const expired = await validateCoordinatorDecision(
      decision({}, now), readerFor(baseLedger({ settlement_deadline: BigInt(now - 1) }, now)), now,
    );
    expect(expired).toEqual({ valid: false, failure: { kind: "settlement-window-expired" } });
  });
});

describe("signCoordinatorDecision", () => {
  test("produces a signature verifiable against the coordinator's address under the exact domain", async () => {
    const now = Math.floor(Date.now() / 1000);
    const envelope = await signCoordinatorDecision(decision({}, now), domain, coordinator);
    expect(envelope.result.winner).toBe(decision({}, now).winner);
    expect(envelope.midnightContractAddress).toBe(midnightContractAddress);
    const { verifyCoordinatorResult } = await import("./shadowbid-coordinator.ts");
    expect(await verifyCoordinatorResult(envelope.result, envelope.signature, domain, coordinator.address)).toBe(true);
    expect(await verifyCoordinatorResult(envelope.result, envelope.signature, domain, forger.address)).toBe(false);
  });
});

describe("end-to-end: validate -> sign -> FileCoordinatorResultStore -> createEip712AuthoritativeReader", () => {
  const paths: string[] = [];
  afterEach(async () => { await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

  test("a validated, coordinator-signed decision reaches SETTLEMENT_READY through the real file handoff", async () => {
    const now = Math.floor(Date.now() / 1000);
    const ledger = baseLedger({}, now);
    const theDecision = decision({}, now);

    const validation = await validateCoordinatorDecision(theDecision, readerFor(ledger), now);
    expect(validation).toEqual({ valid: true });

    const envelope = await signCoordinatorDecision(theDecision, domain, coordinator);

    const directory = await mkdtemp(`${tmpdir()}/shadowbid-coordinator-e2e-`);
    paths.push(directory);
    const store = new FileCoordinatorResultStore(directory);
    await store.write(theDecision.auctionId, envelope);

    const auction: ShadowBidEnvelopeV1["auction"] = {
      evmChainId: "31337", evmContract: domain.verifyingContract, auctionId: "7",
      midnightNetworkId: ledger.midnight_network, midnightContract: ledger.midnight_contract, midnightDomain: ledger.midnight_network,
    };
    const reader = createEip712AuthoritativeReader({
      domain, expectedSigner: coordinator.address, ledgerReader: readerFor(ledger),
      getSignedResult: (auctionId) => store.read(auctionId),
    });
    const state = await reader.getSettlementReadyState(auction);
    expect(state).not.toBeNull();
    expect(state!.phase).toBe("SETTLEMENT_READY");
    expect(state!.approvedResult.winner).toBe(theDecision.winner);
    expect(state!.approvedResult.amount).toBe("13");
  });

  test("a decision signed by the wrong key never reaches SETTLEMENT_READY, even after passing off-chain validation", async () => {
    const now = Math.floor(Date.now() / 1000);
    const ledger = baseLedger({}, now);
    const theDecision = decision({}, now);
    expect(await validateCoordinatorDecision(theDecision, readerFor(ledger), now)).toEqual({ valid: true });

    const forgedEnvelope = await signCoordinatorDecision(theDecision, domain, forger);
    const directory = await mkdtemp(`${tmpdir()}/shadowbid-coordinator-e2e-`);
    paths.push(directory);
    const store = new FileCoordinatorResultStore(directory);
    await store.write(theDecision.auctionId, forgedEnvelope);

    const auction: ShadowBidEnvelopeV1["auction"] = {
      evmChainId: "31337", evmContract: domain.verifyingContract, auctionId: "7",
      midnightNetworkId: ledger.midnight_network, midnightContract: ledger.midnight_contract, midnightDomain: ledger.midnight_network,
    };
    const reader = createEip712AuthoritativeReader({
      domain, expectedSigner: coordinator.address, ledgerReader: readerFor(ledger),
      getSignedResult: (auctionId) => store.read(auctionId),
    });
    expect(await reader.getSettlementReadyState(auction)).toBeNull();
  });
});
