import { expect, test } from "bun:test";
import { reduceAuctionFacts, sourceKey, type ShadowBidFact } from "./shadowbid.ts";

const created = (source_key = "evm:31337:0xauction:0x01:0"): ShadowBidFact => ({
  source_key, protocol: "evm", network_id: "31337", contract_address: "0xauction", transaction_id: "0x01", event_index: 0,
  auction_id: "1", fact_kind: "evm.auction_created", semantic_key: "auction:1:created", block_height: 10,
  payload: { auctionId: "1", chainId: "31337", seller: "0xseller", nft: "0xnft", tokenId: "7", commitDeadline: "100", settlementDeadline: "200", reservePrice: "5", midnightDomain: "0xdomain" },
});
const evmCommit = (key = "evm:31337:0xauction:0x02:0", commitment = "0xcommit"): ShadowBidFact => ({
  source_key: key, protocol: "evm", network_id: "31337", contract_address: "0xauction", transaction_id: key.split(":")[3]!, event_index: 0,
  auction_id: "1", fact_kind: "evm.commitment_recorded", semantic_key: `auction:1:evm.commitment_recorded:${commitment}`, block_height: 11, payload: { auctionId: "1", commitment },
});
const midnightCommit = (key = "midnight:local:mid:tx:0", commitment = "0xcommit"): ShadowBidFact => ({
  source_key: key, protocol: "midnight", network_id: "local", contract_address: "mid", transaction_id: "tx", event_index: 0,
  auction_id: "1", fact_kind: "midnight.commitment_recorded", semantic_key: `auction:1:midnight.commitment_recorded:${commitment}`, block_height: 12, payload: { auctionId: "1", commitment },
});
const settled = (): ShadowBidFact => ({
  source_key: "evm:31337:0xauction:0x03:0", protocol: "evm", network_id: "31337", contract_address: "0xauction", transaction_id: "0x03", event_index: 0,
  auction_id: "1", fact_kind: "evm.auction_settled", semantic_key: null, block_height: 13, payload: { auctionId: "1", winner: "0xwinner", amount: "13", commitment: "0xcommit" },
});
const cancelled = (): ShadowBidFact => ({
  source_key: "evm:31337:0xauction:0x04:0", protocol: "evm", network_id: "31337", contract_address: "0xauction", transaction_id: "0x04", event_index: 0,
  auction_id: "1", fact_kind: "evm.auction_cancelled", semantic_key: null, block_height: 14, payload: { auctionId: "1" },
});

test("EVM and Midnight commitment facts make an auction settlement-ready", () => {
  const view = reduceAuctionFacts([created(), evmCommit(), midnightCommit()]);
  expect(view?.phase).toBe("SETTLEMENT_READY");
  expect(view?.settlement_ready).toBe(true);
  expect(view?.commitment_count).toBe(1);
  expect(view?.midnight_commitment_count).toBe(1);
});

test("duplicates and reordered facts converge byte-for-byte", () => {
  const facts = [created(), evmCommit(), midnightCommit(), settled()];
  expect(JSON.stringify(reduceAuctionFacts(facts))).toBe(JSON.stringify(reduceAuctionFacts([...facts].reverse().concat(evmCommit()))));
});

test("a terminal EVM settlement dominates a conflicting cancellation", () => {
  const view = reduceAuctionFacts([created(), cancelled(), settled()]);
  expect(view?.phase).toBe("SETTLED");
  expect(view?.winner).toBe("0xwinner");
  expect(view?.winning_amount).toBe("13");
});

test("invalid lifecycle facts cannot create a projection", () => {
  expect(reduceAuctionFacts([evmCommit(), midnightCommit()])).toBeNull();
});

test("source key is canonical and address-case independent", () => {
  expect(sourceKey("evm", "31337", "0xABc", "0xTx", 2)).toBe("evm:31337:0xabc:0xtx:2");
  expect(sourceKey("midnight", "local", "MID", "TxCase", 2)).toBe("midnight:local:MID:TxCase:2");
});
