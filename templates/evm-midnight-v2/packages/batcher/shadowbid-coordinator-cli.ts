#!/usr/bin/env bun
/**
 * TRUSTED-COORDINATOR CLI — NOT PROOF-BACKED.
 *
 * This process signs an EIP-712 `CoordinatorResult` for exactly the auction
 * winner/amount/commitment an operator explicitly supplies in a decision
 * file. It never inspects private Compact bid data, never compares bid
 * amounts, and never decides a winner itself — see
 * shadowbid-coordinator-core.ts's module doc and docs/DECISIONS.md. Running
 * this CLI on a false decision produces a validly-signed but incorrect
 * result; nothing downstream can detect that (SOL_FINAL_REVIEW.md finding 3).
 *
 * Usage:
 *   SHADOWBID_COORDINATOR_PRIVATE_KEY=0x... \
 *   bun run packages/batcher/shadowbid-coordinator-cli.ts path/to/decision.json
 *
 * `decision.json` (all fields required, no defaults, no guessing):
 * {
 *   "auctionId": "7",
 *   "winner": "0x...",                  // EVM address, the settle() caller
 *   "amount": "13000000000000000000",   // wei, decimal string
 *   "commitment": "0x...",              // 32-byte hex, must be a closed Midnight commitment
 *   "midnightContractAddress": "...",   // deployed Midnight contract address (bare hex, no 0x)
 *   "midnightContract": "0x...",        // 32-byte domain identity, must match the ledger
 *   "midnightNetwork": "0x...",         // 32-byte domain identity, must match the ledger
 *   "evmChainId": "31337",
 *   "evmAuctionContract": "0x...",      // deployed ShadowBidAuction address
 *   "resultVersion": "1",
 *   "expiry": "1234567890",             // unix seconds, must be in the future
 *   "nonce": "0"                        // must equal ShadowBidAuction.nextSettlementNonce(auctionId)
 * }
 *
 * Required environment variables:
 *   SHADOWBID_COORDINATOR_PRIVATE_KEY   EOA private key for the deployed contract's settlementSigner.
 *                                       Never has a default and is never logged. Not read from any
 *                                       file this process writes or that is committed to the repo.
 *   SHADOWBID_COORDINATOR_RESULTS_DIR   Directory FileCoordinatorResultStore writes to; the batcher
 *                                       reads the same directory (SHADOWBID_COORDINATOR_RESULTS_DIR
 *                                       on the batcher side must point at the same path).
 *
 * Optional (default to the same values `buildAuthoritativeSettlementReader` uses):
 *   MIDNIGHT_INDEXER_HTTP, MIDNIGHT_INDEXER_WS   Midnight indexer endpoints (see @effectstream/midnight-contracts/midnight-env).
 */
import { readFile } from "node:fs/promises";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import {
  signCoordinatorDecision,
  validateCoordinatorDecision,
  type CoordinatorDecision,
} from "./shadowbid-coordinator-core.ts";
import { FileCoordinatorResultStore, type Eip712Domain } from "./shadowbid-coordinator.ts";
import { LiveMidnightAuctionStateReader } from "./shadowbid-midnight-reader.ts";

type DecisionFile = {
  auctionId: string; winner: string; amount: string; commitment: string;
  midnightContractAddress: string; midnightContract: string; midnightNetwork: string;
  evmChainId: string; evmAuctionContract: string; resultVersion: string; expiry: string; nonce: string;
};

const REQUIRED_DECISION_FIELDS: (keyof DecisionFile)[] = [
  "auctionId", "winner", "amount", "commitment", "midnightContractAddress", "midnightContract",
  "midnightNetwork", "evmChainId", "evmAuctionContract", "resultVersion", "expiry", "nonce",
];

function parseDecisionFile(raw: string): CoordinatorDecision {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("decision file is not valid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("decision file must be a JSON object");
  }
  const record = value as Record<string, unknown>;
  for (const field of REQUIRED_DECISION_FIELDS) {
    if (typeof record[field] !== "string" || record[field] === "") {
      throw new Error(`decision file is missing required string field "${field}"`);
    }
  }
  const decision = record as unknown as DecisionFile;
  return {
    auctionId: decision.auctionId,
    winner: decision.winner as Address,
    amount: BigInt(decision.amount),
    commitment: decision.commitment as Hex,
    midnightContractAddress: decision.midnightContractAddress,
    midnightContract: decision.midnightContract as Hex,
    midnightNetwork: decision.midnightNetwork as Hex,
    evmChainId: BigInt(decision.evmChainId),
    evmAuctionContract: decision.evmAuctionContract as Address,
    resultVersion: BigInt(decision.resultVersion),
    expiry: BigInt(decision.expiry),
    nonce: BigInt(decision.nonce),
  };
}

async function main(): Promise<void> {
  const decisionPath = process.argv[2];
  if (!decisionPath) {
    console.error("Usage: bun run shadowbid-coordinator-cli.ts <decision.json>");
    process.exitCode = 1;
    return;
  }

  const privateKey = process.env.SHADOWBID_COORDINATOR_PRIVATE_KEY;
  if (!privateKey) {
    console.error("SHADOWBID_COORDINATOR_PRIVATE_KEY is required and was not set. Refusing to run without an explicit signer key.");
    process.exitCode = 1;
    return;
  }
  const resultsDir = process.env.SHADOWBID_COORDINATOR_RESULTS_DIR;
  if (!resultsDir) {
    console.error("SHADOWBID_COORDINATOR_RESULTS_DIR is required and was not set.");
    process.exitCode = 1;
    return;
  }

  const decision = parseDecisionFile(await readFile(decisionPath, "utf8"));

  const ledgerReader = new LiveMidnightAuctionStateReader({
    indexerQueryUrl: process.env.MIDNIGHT_INDEXER_HTTP ?? midnightNetworkConfig.indexer,
    indexerSubscriptionUrl: process.env.MIDNIGHT_INDEXER_WS ?? midnightNetworkConfig.indexerWS,
  }, (failure) => console.error("[shadowbid-coordinator] Midnight ledger read failed:", failure));

  const validation = await validateCoordinatorDecision(decision, ledgerReader);
  if (!validation.valid) {
    console.error("[shadowbid-coordinator] Refusing to sign — decision failed validation:", validation.failure);
    process.exitCode = 1;
    return;
  }

  const domain: Eip712Domain = {
    name: "ShadowBidAuction",
    version: "1",
    chainId: decision.evmChainId,
    verifyingContract: decision.evmAuctionContract,
  };
  const account = privateKeyToAccount(privateKey as Hex);
  const envelope = await signCoordinatorDecision(decision, domain, account);

  const store = new FileCoordinatorResultStore(resultsDir);
  await store.write(decision.auctionId, envelope);

  console.log(
    `[shadowbid-coordinator] Signed and stored result for auction ${decision.auctionId}: ` +
    `winner=${decision.winner} amount=${decision.amount} signer=${account.address}. ` +
    `This is a TRUSTED coordinator attestation, not a proof of winner correctness.`,
  );
}

main().catch((error) => {
  console.error("[shadowbid-coordinator] fatal error:", error);
  process.exitCode = 1;
});
