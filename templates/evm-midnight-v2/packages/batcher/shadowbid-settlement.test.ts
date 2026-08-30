import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { BlockchainAdapter, DefaultBatcherInput } from "@effectstream/batcher-sdk";
import {
  canonicalJson,
  DurableReplayGuard,
  parseShadowBidEnvelope,
  SHADOWBID_ENVELOPE_VERSION,
  SHADOWBID_TARGET_V1,
  ShadowBidSettlementAdapter,
  type AuthoritativeSettlementReader,
  type ShadowBidEnvelopeV1,
} from "./shadowbid-settlement.ts";

const auction = {
  evmChainId: "31337", evmContract: "0x1111111111111111111111111111111111111111", auctionId: "7",
  midnightNetworkId: `0x${"22".repeat(32)}`, midnightContract: `0x${"33".repeat(32)}`, midnightDomain: `0x${"44".repeat(32)}`,
};
const payload = { winner: "0x5555555555555555555555555555555555555555", commitment: `0x${"66".repeat(32)}`, amount: "42", settlementDigest: `0x${"77".repeat(32)}`, nonce: "3" };
const paths: string[] = [];

function envelope(overrides: Partial<ShadowBidEnvelopeV1> = {}): ShadowBidEnvelopeV1 {
  return {
    version: SHADOWBID_ENVELOPE_VERSION, requestId: "request_identifier_0001", target: SHADOWBID_TARGET_V1,
    action: "publish_coordinator_result", timestamp: String(Date.now()), expiresAt: String(Date.now() + 60_000), auction, payload,
    ...overrides,
  };
}
function input(value = envelope(), target = SHADOWBID_TARGET_V1): DefaultBatcherInput {
  return { address: payload.winner, addressType: 0, signature: "outer-signature-verified-by-batcher", timestamp: String(Date.now()), target, input: canonicalJson(value) };
}
const inner: BlockchainAdapter<null> = {
  buildBatchData: () => null, submitBatch: async () => "0x", estimateBatchFee: () => 0n,
  waitForTransactionReceipt: async () => ({ hash: "0x", blockNumber: 1n, status: 1 }), getAccountAddress: () => "",
  getChainName: () => "midnight", isReady: () => true, getBlockNumber: async () => 1n,
};
function reader(result = payload): AuthoritativeSettlementReader {
  return { async getSettlementReadyState(requested) {
    if (requested.auctionId !== auction.auctionId) return null;
    return { auction, phase: "SETTLEMENT_READY", settlementDeadlineMs: Date.now() + 120_000, commitmentsClosed: true, recordedCommitments: [payload.commitment], approvedResult: result };
  } };
}
async function adapter(stateReader = reader()) {
  const directory = await mkdtemp(`${tmpdir()}/shadowbid-batcher-`); paths.push(directory);
  return new ShadowBidSettlementAdapter(inner, stateReader, new DurableReplayGuard(directory));
}
afterEach(async () => { await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe("ShadowBid settlement envelope", () => {
  test("accepts a request that matches an authoritative SETTLEMENT_READY result", async () => {
    const target = await adapter();
    expect(await target.validateInput(input())).toMatchObject({ valid: true });
  });

  test("fails closed when no authoritative reader has a result for the auction", async () => {
    const target = await adapter({ async getSettlementReadyState() { return null; } });
    expect(await target.validateInput(input())).toMatchObject({ valid: false });
  });

  test("rejects unknown fields, malformed JSON, wrong method, wrong target, and expiry", async () => {
    const target = await adapter();
    expect(() => parseShadowBidEnvelope("{" )).toThrow("not JSON");
    expect(await target.validateInput(input({ ...envelope(), action: "commit_bid_0" as any }))).toMatchObject({ valid: false });
    expect(await target.validateInput(input(envelope(), "midnight"))).toMatchObject({ valid: false, error: "ShadowBid requires explicit target=shadowbid" });
    const unknown = JSON.parse(canonicalJson(envelope())); unknown.salt = "secret";
    expect(await target.validateInput(input(unknown))).toMatchObject({ valid: false });
    expect(() => parseShadowBidEnvelope(canonicalJson({ ...envelope(), expiresAt: "1" }))).toThrow("expired");
  });

  test("rejects forged winner/result, wrong auction, unknown commitment, and premature state", async () => {
    const forged = await adapter();
    const forgedResult = await forged.validateInput(input({ ...envelope(), payload: { ...payload, winner: "0x9999999999999999999999999999999999999999" } }));
    expect(forgedResult).toMatchObject({ valid: false });
    const wrongAuction = await adapter();
    expect(await wrongAuction.validateInput(input({ ...envelope(), auction: { ...auction, auctionId: "8" } }))).toMatchObject({ valid: false });
    const wrongDomain = await adapter();
    expect(await wrongDomain.validateInput(input({ ...envelope(), auction: { ...auction, midnightDomain: `0x${"99".repeat(32)}` } }))).toMatchObject({ valid: false });
    const premature = await adapter({ async getSettlementReadyState() { return null; } });
    expect(await premature.validateInput(input())).toMatchObject({ valid: false });
    const unknownCommitment = await adapter(reader({ ...payload, commitment: `0x${"88".repeat(32)}` }));
    expect(await unknownCommitment.validateInput(input())).toMatchObject({ valid: false });
  });

  test("replay claims are idempotent for the same envelope and reject a conflicting nonce", async () => {
    const directory = await mkdtemp(`${tmpdir()}/shadowbid-batcher-`); paths.push(directory);
    const guard = new DurableReplayGuard(directory);
    const first = envelope();
    expect(await guard.claim(first)).toBe(true);
    const restarted = new DurableReplayGuard(directory);
    expect(await restarted.claim(first)).toBe(true);
    const changedId = envelope({ requestId: "request_identifier_0002" });
    expect(await restarted.claim(changedId)).toBe(false);
  });
});
