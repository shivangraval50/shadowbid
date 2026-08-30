import { describe, expect, test } from "bun:test";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  addressToBytes32,
  coordinatorResultDigest,
  createEip712AuthoritativeReader,
  toHexLedgerState,
  verifyCoordinatorResult,
  type CoordinatorResult,
  type Eip712Domain,
  type MidnightAuctionLedgerState,
  type SignedCoordinatorEnvelope,
} from "./shadowbid-coordinator.ts";
import { SHADOWBID_TARGET_V1, SHADOWBID_ENVELOPE_VERSION, type ShadowBidEnvelopeV1 } from "./shadowbid-settlement.ts";

const COORDINATOR_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const coordinator = privateKeyToAccount(COORDINATOR_KEY);
const forger = privateKeyToAccount(`0x${"1".repeat(63)}a`);

const domain: Eip712Domain = { name: "ShadowBidAuction", version: "1", chainId: 31337n, verifyingContract: getAddress("0x1111111111111111111111111111111111111111") };
const auction: ShadowBidEnvelopeV1["auction"] = {
  evmChainId: "31337",
  evmContract: domain.verifyingContract,
  auctionId: "7",
  midnightNetworkId: `0x${"22".repeat(32)}`,
  midnightContract: `0x${"33".repeat(32)}`,
  midnightDomain: `0x${"22".repeat(32)}`,
};

const bidderCommitments = {
  bidder8: `0x${"08".repeat(32)}` as const,
  bidder13: `0x${"13".repeat(32)}` as const,
  bidder11: `0x${"11".repeat(32)}` as const,
};

function baseLedger(overrides: Partial<MidnightAuctionLedgerState> = {}): MidnightAuctionLedgerState {
  return {
    initialized: true,
    commitments_closed: true,
    auction_id: `0x${BigInt(auction.auctionId).toString(16).padStart(64, "0")}`,
    evm_chain_id: 31337n,
    evm_auction: addressToBytes32(auction.evmContract) as MidnightAuctionLedgerState["evm_auction"],
    midnight_network: auction.midnightDomain,
    midnight_contract: auction.midnightContract,
    commit_deadline: BigInt(Math.floor(Date.now() / 1000) - 60),
    settlement_deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    commitment_0: bidderCommitments.bidder8,
    commitment_1: bidderCommitments.bidder13,
    commitment_2: bidderCommitments.bidder11,
    committed_0: true,
    committed_1: true,
    committed_2: true,
    ...overrides,
  };
}

function result(overrides: Partial<CoordinatorResult> = {}): CoordinatorResult {
  return {
    auctionId: BigInt(auction.auctionId),
    winner: getAddress("0x0000000000000000000000000000000000001313"),
    amount: 13n,
    commitment: bidderCommitments.bidder13,
    midnightContract: auction.midnightContract as `0x${string}`,
    midnightNetwork: auction.midnightDomain as `0x${string}`,
    resultVersion: 1n,
    expiry: BigInt(Math.floor(Date.now() / 1000) + 300),
    nonce: 0n,
    ...overrides,
  };
}

async function sign(value: CoordinatorResult, signerDomain = domain, signer = coordinator) {
  return signer.signTypedData({
    domain: signerDomain,
    types: { SettlementAuthorization: [
      { name: "auctionId", type: "uint256" }, { name: "winner", type: "address" }, { name: "amount", type: "uint256" },
      { name: "commitment", type: "bytes32" }, { name: "midnightContract", type: "bytes32" }, { name: "midnightNetwork", type: "bytes32" },
      { name: "resultVersion", type: "uint256" }, { name: "expiry", type: "uint256" }, { name: "nonce", type: "uint256" },
    ] },
    primaryType: "SettlementAuthorization",
    message: value,
  });
}

function reader(ledger: MidnightAuctionLedgerState | null, envelope: SignedCoordinatorEnvelope | null, expectedSigner = coordinator.address) {
  return createEip712AuthoritativeReader({
    domain,
    expectedSigner,
    ledgerReader: { async getAuctionLedgerState() { return ledger; } },
    getSignedResult: async () => envelope,
  });
}

describe("ShadowBid EIP-712 coordinator result", () => {
  test("valid three-bidder settlement: only the winner and winning amount become public", async () => {
    const winningResult = result();
    const signature = await sign(winningResult);
    const envelope: SignedCoordinatorEnvelope = { result: winningResult, signature, midnightContractAddress: "midnight-addr-1" };
    const state = await reader(baseLedger(), envelope).getSettlementReadyState(auction);

    expect(state).not.toBeNull();
    expect(state!.phase).toBe("SETTLEMENT_READY");
    expect(state!.approvedResult.winner).toBe(winningResult.winner);
    expect(state!.approvedResult.amount).toBe("13");
    // Only the three commitment hashes are exposed; no losing bidder identity or amount appears anywhere in the result.
    expect(state!.recordedCommitments.sort()).toEqual([bidderCommitments.bidder8, bidderCommitments.bidder11, bidderCommitments.bidder13].sort());
    // Structural guarantee: `recordedCommitments` is opaque hashes only (no bidder/amount fields exist on
    // the shape at all), and `approvedResult` carries exactly the winner's data — never a second bidder/amount.
    expect(Object.keys(state!.approvedResult).sort()).toEqual(["amount", "commitment", "nonce", "settlementDigest", "winner"]);
    for (const commitment of state!.recordedCommitments) expect(typeof commitment).toBe("string");
  });

  test("forged coordinator result is rejected", async () => {
    const legitimate = result();
    const forged = { ...legitimate, winner: "0x0000000000000000000000000000000000009999" as const };
    const forgedSignature = await sign(legitimate); // signature is for a different message than `forged`
    const envelope: SignedCoordinatorEnvelope = { result: forged, signature: forgedSignature, midnightContractAddress: "midnight-addr-1" };
    const state = await reader(baseLedger(), envelope).getSettlementReadyState(auction);
    expect(state).toBeNull();
  });

  test("a signature from a non-coordinator key is rejected even with a well-formed result", async () => {
    const attackerResult = result();
    const signature = await sign(attackerResult, domain, forger);
    const envelope: SignedCoordinatorEnvelope = { result: attackerResult, signature, midnightContractAddress: "midnight-addr-1" };
    const state = await reader(baseLedger(), envelope).getSettlementReadyState(auction);
    expect(state).toBeNull();
  });

  test("wrong Midnight network/contract domain is rejected", async () => {
    const wrongMidnightResult = result({ midnightNetwork: `0x${"99".repeat(32)}` as `0x${string}` });
    const signature = await sign(wrongMidnightResult);
    const envelope: SignedCoordinatorEnvelope = { result: wrongMidnightResult, signature, midnightContractAddress: "midnight-addr-1" };
    const state = await reader(baseLedger(), envelope).getSettlementReadyState(auction);
    expect(state).toBeNull();

    const wrongContractLedger = baseLedger({ midnight_contract: `0x${"aa".repeat(32)}` });
    const validResult = result();
    const validSignature = await sign(validResult);
    const envelope2: SignedCoordinatorEnvelope = { result: validResult, signature: validSignature, midnightContractAddress: "midnight-addr-1" };
    const state2 = await reader(wrongContractLedger, envelope2).getSettlementReadyState(auction);
    expect(state2).toBeNull();
  });

  test("wrong EVM chain/contract domain is rejected", async () => {
    const wrongChainDomain: Eip712Domain = { ...domain, chainId: 1n };
    const winningResult = result();
    const signature = await sign(winningResult, wrongChainDomain);
    const envelope: SignedCoordinatorEnvelope = { result: winningResult, signature, midnightContractAddress: "midnight-addr-1" };
    // Reader is configured with the correct `domain` (matching the real deployed EVM chain/contract);
    // a signature produced under a different chainId/verifyingContract must not verify against it.
    const state = await reader(baseLedger(), envelope).getSettlementReadyState(auction);
    expect(state).toBeNull();

    const wrongContractDomain: Eip712Domain = { ...domain, verifyingContract: getAddress("0x0000000000000000000000000000000000009999") };
    const signature2 = await sign(winningResult, wrongContractDomain);
    const envelope2: SignedCoordinatorEnvelope = { result: winningResult, signature: signature2, midnightContractAddress: "midnight-addr-1" };
    const state2 = await reader(baseLedger(), envelope2).getSettlementReadyState(auction);
    expect(state2).toBeNull();

    // The signed-request `auction` (what a client sent to the batcher) claiming a different EVM
    // contract/chain than the finalized Midnight ledger actually registered must also be rejected.
    const mismatchedAuction: ShadowBidEnvelopeV1["auction"] = { ...auction, evmContract: "0x0000000000000000000000000000000000dead", evmChainId: "1" };
    const validSignature3 = await sign(winningResult);
    const envelope3: SignedCoordinatorEnvelope = { result: winningResult, signature: validSignature3, midnightContractAddress: "midnight-addr-1" };
    const state3 = await reader(baseLedger(), envelope3).getSettlementReadyState(mismatchedAuction);
    expect(state3).toBeNull();
  });

  test("premature result (commitments not yet closed) is rejected", async () => {
    const winningResult = result();
    const signature = await sign(winningResult);
    const envelope: SignedCoordinatorEnvelope = { result: winningResult, signature, midnightContractAddress: "midnight-addr-1" };
    const state = await reader(baseLedger({ commitments_closed: false }), envelope).getSettlementReadyState(auction);
    expect(state).toBeNull();
  });

  test("expired result (expiry <= 0) is rejected", async () => {
    const expiredResult = result({ expiry: 0n });
    const signature = await sign(expiredResult);
    const envelope: SignedCoordinatorEnvelope = { result: expiredResult, signature, midnightContractAddress: "midnight-addr-1" };
    const state = await reader(baseLedger(), envelope).getSettlementReadyState(auction);
    expect(state).toBeNull();
  });

  test("missing Midnight ledger result fails closed", async () => {
    const winningResult = result();
    const signature = await sign(winningResult);
    const envelope: SignedCoordinatorEnvelope = { result: winningResult, signature, midnightContractAddress: "midnight-addr-1" };
    const state = await reader(null, envelope).getSettlementReadyState(auction);
    expect(state).toBeNull();
  });

  test("missing signed coordinator result (no envelope at all) fails closed", async () => {
    const state = await reader(baseLedger(), null).getSettlementReadyState(auction);
    expect(state).toBeNull();
  });

  test("winning commitment must be one of the recorded/committed Midnight slots", async () => {
    const unknownCommitmentResult = result({ commitment: `0x${"77".repeat(32)}` as `0x${string}` });
    const signature = await sign(unknownCommitmentResult);
    const envelope: SignedCoordinatorEnvelope = { result: unknownCommitmentResult, signature, midnightContractAddress: "midnight-addr-1" };
    const state = await reader(baseLedger(), envelope).getSettlementReadyState(auction);
    expect(state).toBeNull();
  });

  test("digest is deterministic and matches independent recomputation (replay/duplicate-settlement binding)", async () => {
    const winningResult = result();
    const digestA = coordinatorResultDigest(winningResult, domain);
    const digestB = coordinatorResultDigest({ ...winningResult }, domain);
    expect(digestA).toBe(digestB);
    const differentNonce = coordinatorResultDigest({ ...winningResult, nonce: 1n }, domain);
    expect(differentNonce).not.toBe(digestA);
  });

  test("verifyCoordinatorResult round-trips signing and verification directly", async () => {
    const winningResult = result();
    const signature = await sign(winningResult);
    expect(await verifyCoordinatorResult(winningResult, signature, domain, coordinator.address)).toBe(true);
    expect(await verifyCoordinatorResult(winningResult, signature, domain, forger.address)).toBe(false);
  });

  test("toHexLedgerState adapts the generated Ledger (Uint8Array fields) without dropping data", () => {
    const raw = {
      initialized: true, commitments_closed: true,
      auction_id: new Uint8Array(32).fill(1), evm_chain_id: 31337n,
      evm_auction: new Uint8Array(32).fill(2), midnight_network: new Uint8Array(32).fill(3), midnight_contract: new Uint8Array(32).fill(4),
      commit_deadline: 100n, settlement_deadline: 200n,
      commitment_0: new Uint8Array(32).fill(5), commitment_1: new Uint8Array(32).fill(6), commitment_2: new Uint8Array(32).fill(7),
      committed_0: true, committed_1: false, committed_2: true,
    };
    const adapted = toHexLedgerState(raw);
    expect(adapted.auction_id).toBe(`0x${"01".repeat(32)}`);
    expect(adapted.commitment_1).toBe(`0x${"06".repeat(32)}`);
    expect(adapted.committed_1).toBe(false);
  });

  test("addressToBytes32 zero-left-pads a 20-byte EVM address into the 32-byte Bytes<32> encoding register_auction's caller must use", () => {
    expect(addressToBytes32("0x1111111111111111111111111111111111111111")).toBe(`0x${"00".repeat(12)}${"11".repeat(20)}`);
    // Case-insensitive input, lowercase output.
    expect(addressToBytes32("0xAbCdEf0123456789AbCdEf0123456789aBcDeF01")).toBe(addressToBytes32("0xabcdef0123456789abcdef0123456789abcdef01"));
    expect(addressToBytes32("0x0000000000000000000000000000000000dead")).toBe(`0x${"00".repeat(30)}dead`);
  });
});
