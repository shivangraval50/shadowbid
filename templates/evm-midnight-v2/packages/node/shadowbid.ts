/** Public, dependency-free projection model.  It consumes immutable facts only. */
export type ShadowBidFactKind =
  | "evm.auction_created"
  | "evm.commitment_recorded"
  | "evm.auction_settled"
  | "evm.auction_cancelled"
  | "midnight.commitment_recorded";

export type ShadowBidFact = {
  source_key: string;
  protocol: "evm" | "midnight";
  network_id: string;
  contract_address: string;
  transaction_id: string;
  event_index: number;
  auction_id: string;
  fact_kind: ShadowBidFactKind;
  semantic_key: string | null;
  block_height: number;
  payload: Record<string, unknown>;
};

export type AuctionPhaseV1 = "COMMIT" | "SETTLEMENT_READY" | "SETTLED" | "CANCELLED";

export type AuctionViewV1 = {
  auction_id: string;
  evm_chain_id: string;
  evm_contract_address: string;
  midnight_network_id: string | null;
  midnight_contract_address: string | null;
  seller: string;
  nft_address: string;
  token_id: string;
  commit_deadline: string;
  settlement_deadline: string;
  reserve_price: string;
  midnight_domain: string;
  phase: AuctionPhaseV1;
  commitment_count: number;
  midnight_commitment_count: number;
  settlement_commitment: string | null;
  winner: string | null;
  winning_amount: string | null;
  terminal_source_key: string | null;
  settlement_ready: boolean;
  updated_source_key: string;
};

const text = (value: unknown): string => String(value ?? "");
const ordered = (facts: readonly ShadowBidFact[]) => [...facts].sort((a, b) =>
  a.source_key.localeCompare(b.source_key));

/**
 * Rebuilds an auction from source facts. Source-key sorting makes duplicate and
 * arrival-order replay converge; terminal EVM facts have explicit precedence.
 */
export function reduceAuctionFacts(facts: readonly ShadowBidFact[]): AuctionViewV1 | null {
  const all = ordered(facts);
  const created = all.find((fact) => fact.fact_kind === "evm.auction_created");
  if (!created) return null;

  const p = created.payload;
  const evmCommitments = new Set(
    all.filter((f) => f.fact_kind === "evm.commitment_recorded")
      .map((f) => text(f.payload.commitment))
      .filter(Boolean),
  );
  const midnightCommitments = new Set(
    all.filter((f) => f.fact_kind === "midnight.commitment_recorded")
      .map((f) => text(f.payload.commitment))
      .filter(Boolean),
  );
  const settled = all.find((fact) => fact.fact_kind === "evm.auction_settled");
  const cancelled = all.find((fact) => fact.fact_kind === "evm.auction_cancelled");
  const matchingCommitment = [...evmCommitments].some((commitment) => midnightCommitments.has(commitment));

  let phase: AuctionPhaseV1 = matchingCommitment ? "SETTLEMENT_READY" : "COMMIT";
  let terminal = null as ShadowBidFact | null;
  // A confirmed EVM settlement is authoritative over an inconsistent cancel
  // observation; contract invariants should prevent the conflict in practice.
  if (settled) {
    phase = "SETTLED";
    terminal = settled;
  } else if (cancelled) {
    phase = "CANCELLED";
    terminal = cancelled;
  }

  return {
    auction_id: created.auction_id,
    evm_chain_id: text(p.chainId),
    evm_contract_address: created.contract_address.toLowerCase(),
    midnight_network_id: p.midnightNetworkId ? text(p.midnightNetworkId) : null,
    midnight_contract_address: p.midnightContract ? text(p.midnightContract) : null,
    seller: text(p.seller).toLowerCase(),
    nft_address: text(p.nft).toLowerCase(),
    token_id: text(p.tokenId),
    commit_deadline: text(p.commitDeadline),
    settlement_deadline: text(p.settlementDeadline),
    reserve_price: text(p.reservePrice),
    midnight_domain: text(p.midnightDomain),
    phase,
    commitment_count: evmCommitments.size,
    midnight_commitment_count: midnightCommitments.size,
    settlement_commitment: settled ? text(settled.payload.commitment) : null,
    winner: settled ? text(settled.payload.winner).toLowerCase() : null,
    winning_amount: settled ? text(settled.payload.amount) : null,
    terminal_source_key: terminal?.source_key ?? null,
    settlement_ready: !terminal && matchingCommitment,
    updated_source_key: all.at(-1)!.source_key,
  };
}

export function sourceKey(protocol: "evm" | "midnight", networkId: string, contract: string, txId: string, index: number): string {
  // EVM hashes are hex case-insensitive; Midnight transaction identifiers are
  // opaque network values and must retain their exact configured spelling.
  const canonicalTxId = protocol === "evm" ? txId.toLowerCase() : txId;
  const canonicalContract = protocol === "evm" ? contract.toLowerCase() : contract;
  return `${protocol}:${networkId}:${canonicalContract}:${canonicalTxId}:${index}`;
}
