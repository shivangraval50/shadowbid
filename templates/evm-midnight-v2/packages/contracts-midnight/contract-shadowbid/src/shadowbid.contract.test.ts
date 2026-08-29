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
});
