-- ShadowBid facts are append-only observations.  They are an index, never a
-- settlement authority: contract state remains the source of truth.
CREATE TABLE shadowbid_source_facts (
  source_key TEXT PRIMARY KEY,
  protocol TEXT NOT NULL CHECK (protocol IN ('evm', 'midnight')),
  network_id TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  event_index INTEGER NOT NULL CHECK (event_index >= 0),
  auction_id TEXT NOT NULL,
  fact_kind TEXT NOT NULL,
  semantic_key TEXT,
  block_height BIGINT NOT NULL CHECK (block_height >= 0),
  payload JSONB NOT NULL
);

CREATE UNIQUE INDEX shadowbid_source_facts_canonical_source_key
  ON shadowbid_source_facts(protocol, network_id, contract_address, transaction_id, event_index);
CREATE UNIQUE INDEX shadowbid_source_facts_semantic_key
  ON shadowbid_source_facts(semantic_key) WHERE semantic_key IS NOT NULL;
CREATE INDEX shadowbid_source_facts_auction_order
  ON shadowbid_source_facts(auction_id, source_key);

-- This row is a deterministic materialization of source facts. It deliberately
-- has no salt, private opening, or losing amount columns.
CREATE TABLE shadowbid_auctions (
  auction_id TEXT PRIMARY KEY,
  evm_chain_id TEXT NOT NULL,
  evm_contract_address TEXT NOT NULL,
  midnight_network_id TEXT,
  midnight_contract_address TEXT,
  seller TEXT NOT NULL,
  nft_address TEXT NOT NULL,
  token_id TEXT NOT NULL,
  commit_deadline BIGINT NOT NULL,
  settlement_deadline BIGINT NOT NULL,
  reserve_price TEXT NOT NULL,
  midnight_domain TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('COMMIT', 'COMMITMENT_CORRELATED', 'SETTLED', 'CANCELLED')),
  commitment_count INTEGER NOT NULL DEFAULT 0,
  midnight_commitment_count INTEGER NOT NULL DEFAULT 0,
  settlement_commitment TEXT,
  winner TEXT,
  winning_amount TEXT,
  terminal_source_key TEXT,
  commitment_correlated BOOLEAN NOT NULL DEFAULT FALSE,
  updated_source_key TEXT NOT NULL
);

CREATE TABLE shadowbid_commitments (
  auction_id TEXT NOT NULL REFERENCES shadowbid_auctions(auction_id) ON DELETE CASCADE,
  commitment TEXT NOT NULL,
  source_key TEXT NOT NULL REFERENCES shadowbid_source_facts(source_key) ON DELETE RESTRICT,
  protocol TEXT NOT NULL CHECK (protocol IN ('evm', 'midnight')),
  PRIMARY KEY (auction_id, commitment, protocol),
  UNIQUE (source_key)
);
