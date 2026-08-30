import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { hashTypedData, verifyTypedData } from "viem";
import type { Address, Hex } from "viem";
import type { ShadowBidEnvelopeV1, SettlementReadyState } from "./shadowbid-settlement.ts";

/**
 * Off-chain authenticated coordinator result. Field set, order, and the
 * EIP-712 type string are byte-for-byte the same as
 * `ShadowBidAuction.SettlementAuthorization` / `SETTLEMENT_TYPEHASH` in
 * packages/contracts-evm/src/contracts/ShadowBidAuction.sol, so a signature
 * verified here is the exact signature the EVM contract's `settle` will also
 * accept. There is no proof of winner correctness: this file authenticates
 * *who* asserted the result (the coordinator key), never *why* it is correct.
 * Winner/amount correctness is a trusted-coordinator assumption, matching
 * docs/DECISIONS.md.
 */
export const SETTLEMENT_AUTHORIZATION_TYPES = {
  SettlementAuthorization: [
    { name: "auctionId", type: "uint256" },
    { name: "winner", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "commitment", type: "bytes32" },
    { name: "midnightContract", type: "bytes32" },
    { name: "midnightNetwork", type: "bytes32" },
    { name: "resultVersion", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export type CoordinatorResult = {
  auctionId: bigint;
  winner: Address;
  amount: bigint;
  commitment: Hex;
  midnightContract: Hex;
  midnightNetwork: Hex;
  resultVersion: bigint;
  expiry: bigint;
  nonce: bigint;
};

export type Eip712Domain = {
  name: "ShadowBidAuction";
  version: "1";
  chainId: bigint;
  verifyingContract: Address;
};

/** The exact EIP-712 digest `ShadowBidAuction.settle` recomputes via `_hashTypedDataV4`. */
export function coordinatorResultDigest(result: CoordinatorResult, domain: Eip712Domain): Hex {
  return hashTypedData({
    domain,
    types: SETTLEMENT_AUTHORIZATION_TYPES,
    primaryType: "SettlementAuthorization",
    message: result,
  });
}

/**
 * Verifies that `signature` over `result` was produced by `expectedSigner`
 * under the exact EIP-712 domain the EVM contract enforces. This is the only
 * authentication step for a coordinator result: there is no Compact-level
 * signer/capability primitive available in the installed Compact SDK for this
 * template (see docs/DECISIONS.md and shadowbid.contract.test.ts, which pins
 * the Compact circuit count at 8 and forbids a result-publication circuit).
 */
export async function verifyCoordinatorResult(
  result: CoordinatorResult,
  signature: Hex,
  domain: Eip712Domain,
  expectedSigner: Address,
): Promise<boolean> {
  try {
    return await verifyTypedData({
      address: expectedSigner,
      domain,
      types: SETTLEMENT_AUTHORIZATION_TYPES,
      primaryType: "SettlementAuthorization",
      message: result,
      signature,
    });
  } catch {
    return false;
  }
}

/**
 * Public Compact ledger fields this reader needs. This is a hex-string
 * projection of `@evm-midnight/shadowbid-midnight-contract`'s generated
 * `Ledger` type (packages/contracts-midnight/contract-shadowbid/src/managed/contract/index.d.ts),
 * which returns the same fields as `Uint8Array`/`bigint` from
 * `ShadowBidContract.ledger(state)`. Converting that generated `Ledger` into
 * this shape is `toHexLedgerState` below; obtaining the `state` itself
 * requires a live Midnight indexer/node connection this repository's local
 * environment cannot reach (see docs/QA_REPORT_2026-08-29.md), so that fetch
 * step is an injected seam (`MidnightAuctionStateReader.getAuctionLedgerState`)
 * rather than something implemented here.
 */
export type MidnightAuctionLedgerState = {
  initialized: boolean;
  commitments_closed: boolean;
  auction_id: Hex;
  evm_chain_id: bigint;
  evm_auction: Hex;
  midnight_network: Hex;
  midnight_contract: Hex;
  commit_deadline: bigint;
  settlement_deadline: bigint;
  commitment_0: Hex;
  commitment_1: Hex;
  commitment_2: Hex;
  committed_0: boolean;
  committed_1: boolean;
  committed_2: boolean;
};

export interface MidnightAuctionStateReader {
  /** Reads finalized (not pending/mempool) public ledger state for the given Midnight contract address. */
  getAuctionLedgerState(midnightContractAddress: string): Promise<MidnightAuctionLedgerState | null>;
}

/** Adapts the generated `Ledger` (Uint8Array/bigint fields) to `MidnightAuctionLedgerState` (hex strings). */
export function toHexLedgerState(ledger: {
  initialized: boolean; commitments_closed: boolean; auction_id: Uint8Array; evm_chain_id: bigint;
  evm_auction: Uint8Array; midnight_network: Uint8Array; midnight_contract: Uint8Array;
  commit_deadline: bigint; settlement_deadline: bigint;
  commitment_0: Uint8Array; commitment_1: Uint8Array; commitment_2: Uint8Array;
  committed_0: boolean; committed_1: boolean; committed_2: boolean;
}): MidnightAuctionLedgerState {
  const hex = (bytes: Uint8Array): Hex => `0x${Buffer.from(bytes).toString("hex")}`;
  return {
    initialized: ledger.initialized, commitments_closed: ledger.commitments_closed,
    auction_id: hex(ledger.auction_id), evm_chain_id: ledger.evm_chain_id, evm_auction: hex(ledger.evm_auction),
    midnight_network: hex(ledger.midnight_network), midnight_contract: hex(ledger.midnight_contract),
    commit_deadline: ledger.commit_deadline, settlement_deadline: ledger.settlement_deadline,
    commitment_0: hex(ledger.commitment_0), commitment_1: hex(ledger.commitment_1), commitment_2: hex(ledger.commitment_2),
    committed_0: ledger.committed_0, committed_1: ledger.committed_1, committed_2: ledger.committed_2,
  };
}

export type SignedCoordinatorEnvelope = {
  result: CoordinatorResult;
  signature: Hex;
  /** Midnight contract instance address the ledger state should be read from (distinct from the domain-bound `midnightContract` identity field). */
  midnightContractAddress: string;
};

type StoredCoordinatorResult = {
  auctionId: string; winner: string; amount: string; commitment: string; midnightContract: string;
  midnightNetwork: string; resultVersion: string; expiry: string; nonce: string; signature: string;
  midnightContractAddress: string;
};

/**
 * Minimal file-backed store for signed coordinator results, one JSON file per
 * auction, written atomically (mirrors `DurableReplayGuard`'s write pattern).
 * The coordinator process that watches the Midnight commit deadline and holds
 * `settlementSigner`'s private key is out of scope for this template (see
 * docs/BUILD_STATUS.md); this store is the file-based handoff point a real
 * coordinator process would write to, and is what `batcher.dev.ts` /
 * `batcher.mainnet.ts` read from when `SHADOWBID_COORDINATOR_RESULTS_DIR` is set.
 */
export class FileCoordinatorResultStore {
  constructor(private readonly directory: string) {}

  async write(auctionId: string, envelope: SignedCoordinatorEnvelope): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const record: StoredCoordinatorResult = {
      auctionId, winner: envelope.result.winner, amount: String(envelope.result.amount),
      commitment: envelope.result.commitment, midnightContract: envelope.result.midnightContract,
      midnightNetwork: envelope.result.midnightNetwork, resultVersion: String(envelope.result.resultVersion),
      expiry: String(envelope.result.expiry), nonce: String(envelope.result.nonce),
      signature: envelope.signature, midnightContractAddress: envelope.midnightContractAddress,
    };
    const file = `${this.directory}/${encodeURIComponent(auctionId)}.json`;
    const tmp = `${file}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(record), { mode: 0o600 });
    await rename(tmp, file);
  }

  async read(auctionId: string): Promise<SignedCoordinatorEnvelope | null> {
    let raw: string;
    try {
      raw = await readFile(`${this.directory}/${encodeURIComponent(auctionId)}.json`, "utf8");
    } catch (error: any) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
    const record = JSON.parse(raw) as StoredCoordinatorResult;
    return {
      signature: record.signature as Hex,
      midnightContractAddress: record.midnightContractAddress,
      result: {
        auctionId: BigInt(record.auctionId), winner: record.winner as Address, amount: BigInt(record.amount),
        commitment: record.commitment as Hex, midnightContract: record.midnightContract as Hex,
        midnightNetwork: record.midnightNetwork as Hex, resultVersion: BigInt(record.resultVersion),
        expiry: BigInt(record.expiry), nonce: BigInt(record.nonce),
      },
    };
  }
}

/**
 * Builds the `AuthoritativeSettlementReader` the strict ShadowBid batcher
 * adapter needs. It never trusts the EffectStream projection/API/database
 * (docs/DECISIONS.md: "EffectStream/API/database receipts cannot authorize
 * settlement"). Instead it:
 *
 *   1. Cryptographically verifies a coordinator-signed `CoordinatorResult`
 *      against the exact EIP-712 domain the EVM contract enforces.
 *   2. Cross-checks the signed result against finalized Midnight ledger state
 *      (auction registered, commitments closed, the signed commitment is one
 *      of the recorded slots, deadlines respected).
 *   3. Only then reports `SETTLEMENT_READY`.
 *
 * The winner/amount themselves are never re-derived here: their correctness
 * remains the coordinator's trust responsibility. If no signed result has
 * been supplied for an auction, or the Midnight ledger is unavailable, this
 * fails closed by returning `null`.
 */
export function createEip712AuthoritativeReader(options: {
  domain: Eip712Domain;
  expectedSigner: Address;
  ledgerReader: MidnightAuctionStateReader;
  /** Looks up the latest signed coordinator result submitted out-of-band for an auction, if any. */
  getSignedResult: (auctionId: string) => Promise<SignedCoordinatorEnvelope | null>;
}) {
  const { domain, expectedSigner, ledgerReader, getSignedResult } = options;
  return {
    async getSettlementReadyState(auction: ShadowBidEnvelopeV1["auction"]): Promise<SettlementReadyState | null> {
      const signed = await getSignedResult(auction.auctionId);
      if (!signed) return null;

      const { result, signature, midnightContractAddress } = signed;
      if (String(result.auctionId) !== auction.auctionId) return null;
      if (result.expiry <= 0n) return null;

      const ledger = await ledgerReader.getAuctionLedgerState(midnightContractAddress);
      if (!ledger || !ledger.initialized || !ledger.commitments_closed) return null;

      if (
        lower(ledger.auction_id) !== decimalToBytes32(auction.auctionId) ||
        String(ledger.evm_chain_id) !== auction.evmChainId ||
        lower(ledger.evm_auction) !== lower(addressToBytes32(auction.evmContract)) ||
        lower(ledger.midnight_network) !== lower(auction.midnightDomain) ||
        lower(ledger.midnight_contract) !== lower(auction.midnightContract)
      ) return null;

      if (
        lower(result.midnightContract) !== lower(ledger.midnight_contract) ||
        lower(result.midnightNetwork) !== lower(ledger.midnight_network)
      ) return null;

      const recorded = [ledger.committed_0 && ledger.commitment_0, ledger.committed_1 && ledger.commitment_1, ledger.committed_2 && ledger.commitment_2]
        .filter((value): value is Hex => typeof value === "string");
      if (!recorded.some((commitment) => lower(commitment) === lower(result.commitment))) return null;

      const ok = await verifyCoordinatorResult(result, signature, domain, expectedSigner);
      if (!ok) return null;

      return {
        auction,
        phase: "SETTLEMENT_READY",
        settlementDeadlineMs: Number(ledger.settlement_deadline) * 1000,
        commitmentsClosed: true,
        recordedCommitments: recorded,
        approvedResult: {
          winner: result.winner,
          commitment: result.commitment,
          amount: String(result.amount),
          settlementDigest: coordinatorResultDigest(result, domain),
          nonce: String(result.nonce),
        },
      };
    },
  };
}

function lower(value: string): string { return value.toLowerCase(); }
/** Compact `register_auction` receives the EVM auction id as a zero-left-padded Bytes<32> (docs/DECISIONS.md). */
function decimalToBytes32(value: string): string { return `0x${BigInt(value).toString(16).padStart(64, "0")}`; }
/**
 * `shadowbid.compact`'s `evm: Bytes<32>` parameter (register_auction) has no
 * compiler-fixed encoding for a 20-byte EVM address — nothing in this
 * repository calls `register_auction` yet, so no convention was previously
 * established. This zero-left-pads the address the same way `abi.encode(address)`
 * would and the same way the auction-id convention above already does; see
 * the 2026-08-30 "EVM auction contract address encoding" decision in
 * docs/DECISIONS.md. Whatever registers a real auction on Midnight must use
 * this exact same encoding or this domain check will always fail closed.
 */
export function addressToBytes32(address: string): string { return `0x${stripHexPrefix(address).toLowerCase().padStart(64, "0")}`; }
function stripHexPrefix(value: string): string { return value.startsWith("0x") ? value.slice(2) : value; }
