import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./shadowbid.compact", import.meta.url), "utf8");

describe("ShadowBid Compact privacy boundary", () => {
  test("uses the pinned persistent commitment and binds the full domain", () => {
    expect(source).toContain("persistentCommit<Bid>");
    for (const field of ["version", "chain", "evm", "auction", "network", "midnight", "bidder", "amount"]) {
      expect(source).toContain(`${field}:`);
    }
  });

  test("never discloses salt or a losing opening", () => {
    expect(source).not.toMatch(/disclose\(salt\)/);
    expect(source).not.toMatch(/disclose\(amount\).*open_and_consume/);
    expect(source).toContain("persistentHash<Nullifier>");
  });

  test("exposes private-bid lifecycle paths but no unauthenticated result publication", () => {
    for (const circuit of [
      "register_auction",
      "commit_bid_0",
      "commit_bid_1",
      "close_commitments",
      "open_and_consume_0",
      "open_and_consume_1",
    ]) {
      expect(source).toContain(`export circuit ${circuit}`);
    }
    expect(source).not.toContain("publish_coordinator_result");
    expect(source).not.toContain("winning_amount");
  });

  test("supports the deterministic three-bidder flow required by the protocol", () => {
    // This is intentionally an executable capability assertion: a two-slot
    // ledger cannot safely claim support for three private bidders.
    expect(source).toContain("commitment_2");
    expect(source).toContain("commit_bid_2");
  });
});
