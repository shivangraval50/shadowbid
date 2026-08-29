/** Typed query bindings for sql/shadowbid.sql.
 *
 * Kept alongside the SQL so pgtyped can replace this file verbatim when its
 * existing generation command is run in an environment permitted to bind PGLite.
 */
import { PreparedQuery } from "@pgtyped/runtime";

type Json = Record<string, unknown>;
const prepared = <P, R>(statement: string) => {
  const params: any[] = [];
  const usedParamSet: Record<string, boolean> = {};
  for (const match of statement.matchAll(/:([a-z_]+)(!)?/g)) {
    const name = match[1]!;
    usedParamSet[name] = true;
    params.push({ name, required: match[2] === "!", transform: { type: "scalar" }, locs: [{ a: match.index!, b: match.index! + match[0].length }] });
  }
  return new PreparedQuery<P, R>({ usedParamSet, params, statement } as any);
};

export interface IInsertShadowBidSourceFactParams {
  source_key: string; protocol: "evm" | "midnight"; network_id: string; contract_address: string;
  transaction_id: string; event_index: number; auction_id: string; fact_kind: string;
  semantic_key: string | null; block_height: number; payload: Json;
}
export interface IInsertShadowBidSourceFactResult { source_key: string; }
export const insertShadowBidSourceFact = prepared<IInsertShadowBidSourceFactParams, IInsertShadowBidSourceFactResult>(`INSERT INTO shadowbid_source_facts (source_key, protocol, network_id, contract_address, transaction_id, event_index, auction_id, fact_kind, semantic_key, block_height, payload) VALUES (:source_key!, :protocol!, :network_id!, :contract_address!, :transaction_id!, :event_index!, :auction_id!, :fact_kind!, :semantic_key, :block_height!, :payload!) ON CONFLICT DO NOTHING RETURNING source_key`);

export interface IGetShadowBidFactsParams { auction_id: string; }
export interface IGetShadowBidFactsResult extends IInsertShadowBidSourceFactParams {}
export const getShadowBidFacts = prepared<IGetShadowBidFactsParams, IGetShadowBidFactsResult>(`SELECT source_key, protocol, network_id, contract_address, transaction_id, event_index, auction_id, fact_kind, semantic_key, block_height, payload FROM shadowbid_source_facts WHERE auction_id = :auction_id! ORDER BY source_key ASC`);

export interface IUpsertShadowBidAuctionParams {
  auction_id: string; evm_chain_id: string; evm_contract_address: string; midnight_network_id: string | null;
  midnight_contract_address: string | null; seller: string; nft_address: string; token_id: string;
  commit_deadline: string; settlement_deadline: string; reserve_price: string; midnight_domain: string;
  phase: string; commitment_count: number; midnight_commitment_count: number; settlement_commitment: string | null;
  winner: string | null; winning_amount: string | null; terminal_source_key: string | null;
  settlement_ready: boolean; updated_source_key: string;
}
export const upsertShadowBidAuction = prepared<IUpsertShadowBidAuctionParams, void>(`INSERT INTO shadowbid_auctions (auction_id, evm_chain_id, evm_contract_address, midnight_network_id, midnight_contract_address, seller, nft_address, token_id, commit_deadline, settlement_deadline, reserve_price, midnight_domain, phase, commitment_count, midnight_commitment_count, settlement_commitment, winner, winning_amount, terminal_source_key, settlement_ready, updated_source_key) VALUES (:auction_id!, :evm_chain_id!, :evm_contract_address!, :midnight_network_id, :midnight_contract_address, :seller!, :nft_address!, :token_id!, :commit_deadline!, :settlement_deadline!, :reserve_price!, :midnight_domain!, :phase!, :commitment_count!, :midnight_commitment_count!, :settlement_commitment, :winner, :winning_amount, :terminal_source_key, :settlement_ready!, :updated_source_key!) ON CONFLICT (auction_id) DO UPDATE SET evm_chain_id = EXCLUDED.evm_chain_id, evm_contract_address = EXCLUDED.evm_contract_address, midnight_network_id = EXCLUDED.midnight_network_id, midnight_contract_address = EXCLUDED.midnight_contract_address, seller = EXCLUDED.seller, nft_address = EXCLUDED.nft_address, token_id = EXCLUDED.token_id, commit_deadline = EXCLUDED.commit_deadline, settlement_deadline = EXCLUDED.settlement_deadline, reserve_price = EXCLUDED.reserve_price, midnight_domain = EXCLUDED.midnight_domain, phase = EXCLUDED.phase, commitment_count = EXCLUDED.commitment_count, midnight_commitment_count = EXCLUDED.midnight_commitment_count, settlement_commitment = EXCLUDED.settlement_commitment, winner = EXCLUDED.winner, winning_amount = EXCLUDED.winning_amount, terminal_source_key = EXCLUDED.terminal_source_key, settlement_ready = EXCLUDED.settlement_ready, updated_source_key = EXCLUDED.updated_source_key`);

export interface IUpsertShadowBidCommitmentParams { auction_id: string; commitment: string; source_key: string; protocol: "evm" | "midnight"; }
export const upsertShadowBidCommitment = prepared<IUpsertShadowBidCommitmentParams, void>(`INSERT INTO shadowbid_commitments (auction_id, commitment, source_key, protocol) VALUES (:auction_id!, :commitment!, :source_key!, :protocol!) ON CONFLICT DO NOTHING`);

export interface IGetShadowBidAuctionParams { auction_id: string; }
export interface IShadowBidAuctionResult extends IUpsertShadowBidAuctionParams {}
export const getShadowBidAuction = prepared<IGetShadowBidAuctionParams, IShadowBidAuctionResult>(`SELECT * FROM shadowbid_auctions WHERE auction_id = :auction_id!`);
export interface IListShadowBidAuctionsParams { limit: number; offset: number; }
export const listShadowBidAuctions = prepared<IListShadowBidAuctionsParams, IShadowBidAuctionResult>(`SELECT * FROM shadowbid_auctions ORDER BY settlement_deadline ASC, auction_id ASC LIMIT :limit! OFFSET :offset!`);
export interface IGetShadowBidCommitmentsParams { auction_id: string; }
export interface IGetShadowBidCommitmentsResult { auction_id: string; commitment: string; source_key: string; protocol: "evm" | "midnight"; }
export const getShadowBidCommitments = prepared<IGetShadowBidCommitmentsParams, IGetShadowBidCommitmentsResult>(`SELECT auction_id, commitment, source_key, protocol FROM shadowbid_commitments WHERE auction_id = :auction_id! ORDER BY commitment ASC, protocol ASC`);
export interface IShadowBidServiceStateResult { auction_count: number; commit_count: number; settlement_ready_count: number; settled_count: number; cancelled_count: number; }
export const shadowBidServiceState = prepared<void, IShadowBidServiceStateResult>(`SELECT COUNT(*)::int AS auction_count, COUNT(*) FILTER (WHERE phase = 'COMMIT')::int AS commit_count, COUNT(*) FILTER (WHERE phase = 'SETTLEMENT_READY')::int AS settlement_ready_count, COUNT(*) FILTER (WHERE phase = 'SETTLED')::int AS settled_count, COUNT(*) FILTER (WHERE phase = 'CANCELLED')::int AS cancelled_count FROM shadowbid_auctions`);
