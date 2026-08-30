import type { Address, Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import {
  addressToBytes32,
  SETTLEMENT_AUTHORIZATION_TYPES,
  type CoordinatorResult,
  type Eip712Domain,
  type MidnightAuctionStateReader,
  type SignedCoordinatorEnvelope,
} from "./shadowbid-coordinator.ts";

/**
 * TRUSTED, NOT PROOF-BACKED: this module signs whatever winner/amount the
 * caller (a human operator or an authenticated upstream system) explicitly
 * supplies in `CoordinatorDecision`. It never inspects private bid data,
 * never compares bid amounts, and never decides a winner on its own — it only
 * refuses to sign a decision that fails to match live, finalized Midnight
 * ledger state or violates the fields already required by
 * `ShadowBidAuction.settle` (see docs/DECISIONS.md, SOL_FINAL_REVIEW.md
 * finding 3). Compromise or dishonesty in whatever produced `CoordinatorDecision`
 * still defeats auction correctness; this module cannot detect that.
 */
export type CoordinatorDecision = {
  auctionId: string;
  winner: Address;
  amount: bigint;
  commitment: Hex;
  midnightContractAddress: string;
  midnightContract: Hex;
  midnightNetwork: Hex;
  evmChainId: bigint;
  evmAuctionContract: Address;
  resultVersion: bigint;
  /** Unix seconds. Must be in the future and within `maxExpirySeconds` of now. */
  expiry: bigint;
  nonce: bigint;
};

export type CoordinatorValidationFailure =
  | { kind: "invalid-decision"; reason: string }
  | { kind: "midnight-state-unavailable" }
  | { kind: "auction-not-registered" }
  | { kind: "commitments-not-closed" }
  | { kind: "unknown-commitment" }
  | { kind: "domain-mismatch"; reason: string }
  | { kind: "deadline-not-elapsed" }
  | { kind: "settlement-window-expired" }
  | { kind: "expiry-not-in-future" }
  | { kind: "expiry-too-far-in-future"; maxExpirySeconds: number };

export type CoordinatorValidationResult =
  | { valid: true }
  | { valid: false; failure: CoordinatorValidationFailure };

const MAX_REASONABLE_EXPIRY_SECONDS = 24 * 60 * 60;

/**
 * Validates a `CoordinatorDecision` against live Midnight ledger state and
 * internal consistency (deadlines, expiry, non-zero amount/winner) — every
 * check this function runs is required to pass *before* `signCoordinatorDecision`
 * is called. This is the "verify before signing" step; it never signs anything.
 */
export async function validateCoordinatorDecision(
  decision: CoordinatorDecision,
  ledgerReader: MidnightAuctionStateReader,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<CoordinatorValidationResult> {
  if (decision.winner === "0x0000000000000000000000000000000000000000") {
    return { valid: false, failure: { kind: "invalid-decision", reason: "winner is the zero address" } };
  }
  if (decision.amount <= 0n) {
    return { valid: false, failure: { kind: "invalid-decision", reason: "amount must be positive" } };
  }
  if (decision.expiry <= BigInt(nowSeconds)) {
    return { valid: false, failure: { kind: "expiry-not-in-future" } };
  }
  if (decision.expiry - BigInt(nowSeconds) > BigInt(MAX_REASONABLE_EXPIRY_SECONDS)) {
    return { valid: false, failure: { kind: "expiry-too-far-in-future", maxExpirySeconds: MAX_REASONABLE_EXPIRY_SECONDS } };
  }

  const ledger = await ledgerReader.getAuctionLedgerState(decision.midnightContractAddress);
  if (!ledger) return { valid: false, failure: { kind: "midnight-state-unavailable" } };
  if (!ledger.initialized) return { valid: false, failure: { kind: "auction-not-registered" } };
  if (!ledger.commitments_closed) return { valid: false, failure: { kind: "commitments-not-closed" } };

  if (
    ledger.midnight_contract.toLowerCase() !== decision.midnightContract.toLowerCase() ||
    ledger.midnight_network.toLowerCase() !== decision.midnightNetwork.toLowerCase() ||
    ledger.evm_chain_id !== decision.evmChainId ||
    ledger.evm_auction.toLowerCase() !== addressToBytes32(decision.evmAuctionContract).toLowerCase()
  ) {
    return { valid: false, failure: { kind: "domain-mismatch", reason: "decision domain fields do not match the registered Midnight auction" } };
  }

  const recorded = [ledger.committed_0 && ledger.commitment_0, ledger.committed_1 && ledger.commitment_1, ledger.committed_2 && ledger.commitment_2]
    .filter((value): value is Hex => typeof value === "string");
  if (!recorded.some((commitment) => commitment.toLowerCase() === decision.commitment.toLowerCase())) {
    return { valid: false, failure: { kind: "unknown-commitment" } };
  }

  if (BigInt(nowSeconds) <= ledger.commit_deadline) {
    return { valid: false, failure: { kind: "deadline-not-elapsed" } };
  }
  if (BigInt(nowSeconds) > ledger.settlement_deadline) {
    return { valid: false, failure: { kind: "settlement-window-expired" } };
  }

  return { valid: true };
}

/**
 * Signs a `CoordinatorDecision` that has already passed
 * `validateCoordinatorDecision`. Does not re-validate — callers must run
 * validation first and refuse to call this on a `{valid: false}` result.
 * The signature produced is the exact EIP-712 signature
 * `ShadowBidAuction.settle` verifies (same domain/types as shadowbid-coordinator.ts).
 */
export async function signCoordinatorDecision(
  decision: CoordinatorDecision,
  domain: Eip712Domain,
  account: PrivateKeyAccount,
): Promise<SignedCoordinatorEnvelope> {
  const result: CoordinatorResult = {
    auctionId: BigInt(decision.auctionId),
    winner: decision.winner,
    amount: decision.amount,
    commitment: decision.commitment,
    midnightContract: decision.midnightContract,
    midnightNetwork: decision.midnightNetwork,
    resultVersion: decision.resultVersion,
    expiry: decision.expiry,
    nonce: decision.nonce,
  };
  const signature = await account.signTypedData({
    domain,
    types: SETTLEMENT_AUTHORIZATION_TYPES,
    primaryType: "SettlementAuthorization",
    message: result,
  });
  return { result, signature, midnightContractAddress: decision.midnightContractAddress };
}
