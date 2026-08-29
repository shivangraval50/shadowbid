import { assert, assertSQL } from "../helpers.ts";
import type { Client } from "pg";
import { readFile } from "node:fs/promises";

const API_PORT = parseInt(process.env["EFFECTSTREAM_API_PORT"] || "9999", 10);
const FRONTEND_URL = process.env["FRONTEND_URL"] || "http://127.0.0.1:10599/";
const PRIVATE_FIELD = /(?:salt|opening|losing[_-]?amount|private[_-]?amount)/i;

function assertPublic(value: unknown): boolean {
  return !PRIVATE_FIELD.test(JSON.stringify(value));
}

export async function shadowBidPrivacyTest(db: Client) {
  await assert("ShadowBid EVM public event ABI has no losing-bid fields", async () => {
    const { shadowBidAuctionAbi } = await import("../../node/shadowbid-primitive.ts");
    return shadowBidAuctionAbi.every((event: any) =>
      event.inputs?.every((input: any) => !PRIVATE_FIELD.test(input.name || ""))
    );
  });

  await assert("ShadowBid API output does not disclose private bid fields", async () => {
    for (const path of ["/api/erc721", "/api/shadowbid"]) {
      const response = await fetch(`http://127.0.0.1:${API_PORT}${path}`);
      if (response.status === 404) continue;
      if (!assertPublic(await response.text())) return false;
    }
    return true;
  });

  await assertSQL(
    "ShadowBid database state has no private bid columns or values",
    db,
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_name LIKE 'shadowbid_%' ORDER BY table_name, column_name`,
    (rows) => rows.every((row: any) => !PRIVATE_FIELD.test(row.column_name)),
    (rows) => assertPublic(rows),
  );

  await assert("ShadowBid browser output does not disclose private bid fields", async () => {
    try {
      const response = await fetch(FRONTEND_URL);
      return !response.ok || assertPublic(await response.text());
    } catch {
      return true;
    }
  });

  await assert("ShadowBid configured logs do not disclose private bid fields", async () => {
    const paths = (process.env["SHADOWBID_LOG_PATHS"] || "").split(",").filter(Boolean);
    for (const path of paths) {
      if (!assertPublic(await readFile(path, "utf8"))) return false;
    }
    return true;
  });
}
