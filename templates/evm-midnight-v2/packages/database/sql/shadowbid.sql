/* @name insertShadowBidSourceFact */
INSERT INTO shadowbid_source_facts (
  source_key, protocol, network_id, contract_address, transaction_id,
  event_index, auction_id, fact_kind, semantic_key, block_height, payload
) VALUES (
  :source_key!, :protocol!, :network_id!, :contract_address!, :transaction_id!,
  :event_index!, :auction_id!, :fact_kind!, :semantic_key, :block_height!, :payload!
)
ON CONFLICT DO NOTHING
RETURNING source_key;

/* @name getShadowBidFacts */
SELECT source_key, protocol, network_id, contract_address, transaction_id,
  event_index, auction_id, fact_kind, semantic_key, block_height, payload
FROM shadowbid_source_facts
WHERE auction_id = :auction_id!
ORDER BY source_key ASC;

/* @name upsertShadowBidAuction */
INSERT INTO shadowbid_auctions (
  auction_id, evm_chain_id, evm_contract_address, midnight_network_id,
  midnight_contract_address, seller, nft_address, token_id, commit_deadline,
  settlement_deadline, reserve_price, midnight_domain, phase, commitment_count,
  midnight_commitment_count, settlement_commitment, winner, winning_amount,
  terminal_source_key, settlement_ready, updated_source_key
) VALUES (
  :auction_id!, :evm_chain_id!, :evm_contract_address!, :midnight_network_id,
  :midnight_contract_address, :seller!, :nft_address!, :token_id!, :commit_deadline!,
  :settlement_deadline!, :reserve_price!, :midnight_domain!, :phase!, :commitment_count!,
  :midnight_commitment_count!, :settlement_commitment, :winner, :winning_amount,
  :terminal_source_key, :settlement_ready!, :updated_source_key!
)
ON CONFLICT (auction_id) DO UPDATE SET
  evm_chain_id = EXCLUDED.evm_chain_id,
  evm_contract_address = EXCLUDED.evm_contract_address,
  midnight_network_id = EXCLUDED.midnight_network_id,
  midnight_contract_address = EXCLUDED.midnight_contract_address,
  seller = EXCLUDED.seller,
  nft_address = EXCLUDED.nft_address,
  token_id = EXCLUDED.token_id,
  commit_deadline = EXCLUDED.commit_deadline,
  settlement_deadline = EXCLUDED.settlement_deadline,
  reserve_price = EXCLUDED.reserve_price,
  midnight_domain = EXCLUDED.midnight_domain,
  phase = EXCLUDED.phase,
  commitment_count = EXCLUDED.commitment_count,
  midnight_commitment_count = EXCLUDED.midnight_commitment_count,
  settlement_commitment = EXCLUDED.settlement_commitment,
  winner = EXCLUDED.winner,
  winning_amount = EXCLUDED.winning_amount,
  terminal_source_key = EXCLUDED.terminal_source_key,
  settlement_ready = EXCLUDED.settlement_ready,
  updated_source_key = EXCLUDED.updated_source_key;

/* @name upsertShadowBidCommitment */
INSERT INTO shadowbid_commitments (auction_id, commitment, source_key, protocol)
VALUES (:auction_id!, :commitment!, :source_key!, :protocol!)
ON CONFLICT DO NOTHING;

/* @name getShadowBidAuction */
SELECT * FROM shadowbid_auctions WHERE auction_id = :auction_id!;

/* @name listShadowBidAuctions */
SELECT * FROM shadowbid_auctions
ORDER BY settlement_deadline ASC, auction_id ASC
LIMIT :limit! OFFSET :offset!;

/* @name getShadowBidCommitments */
SELECT auction_id, commitment, source_key, protocol
FROM shadowbid_commitments
WHERE auction_id = :auction_id!
ORDER BY commitment ASC, protocol ASC;

/* @name shadowBidServiceState */
SELECT
  COUNT(*)::int AS auction_count,
  COUNT(*) FILTER (WHERE phase = 'COMMIT')::int AS commit_count,
  COUNT(*) FILTER (WHERE phase = 'SETTLEMENT_READY')::int AS settlement_ready_count,
  COUNT(*) FILTER (WHERE phase = 'SETTLED')::int AS settled_count,
  COUNT(*) FILTER (WHERE phase = 'CANCELLED')::int AS cancelled_count
FROM shadowbid_auctions;
