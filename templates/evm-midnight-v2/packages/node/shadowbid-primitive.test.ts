import { expect, test } from "bun:test";
import { ShadowBidAuctionPrimitive, ShadowBidMidnightPrimitive, shadowBidAuctionAbi } from "./shadowbid-primitive.ts";

const evmTx = (payload: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  output: { payload },
  syncProtocol: { transactionHash: "0xABC", blockNumber: 12, logIndex: 4, ...extra },
});

test("EVM primitive emits a canonical fact and preserves public event fields", () => {
  const primitive = new ShadowBidAuctionPrimitive({
    instanceName: "auction", contractAddress: "0xAbC", chainId: 31337,
    eventKind: "evm.auction_created", stateMachinePrefix: undefined,
  });
  const result = primitive.getPayload(12 as any, evmTx({ auctionId: 1n, reservePrice: 8n }) as any).next().value;
  expect(result.data[0].accountingPayload).toEqual({
    protocol: "evm", networkId: "31337", contractAddress: "0xabc",
    transactionId: "0xABC", eventIndex: 4, blockHeight: 12,
    factKind: "evm.auction_created", payload: { auctionId: "1", reservePrice: "8", chainId: "31337" },
  });
  expect(result.data[0].stateMachinePayload).toBeNull();
});

test("Midnight primitive forwards only a public commitment record", () => {
  const primitive = new ShadowBidMidnightPrimitive({
    instanceName: "midnight-invalid", contractAddress: "midnight-contract", networkId: "undeployed",
    stateMachinePrefix: undefined,
  });
  const result = primitive.getPayload(12 as any, evmTx({ auction_id: 7n, commitment: "0xcommit" }) as any).next().value;
  expect(result.data[0].accountingPayload).toMatchObject({
    protocol: "midnight", networkId: "undeployed", contractAddress: "midnight-contract",
    factKind: "midnight.commitment_recorded",
    payload: { auctionId: "7", commitment: "0xcommit" },
  });
});

test("Midnight primitive ignores malformed or non-public payloads", () => {
  const primitive = new ShadowBidMidnightPrimitive({
    instanceName: "midnight", contractAddress: "midnight-contract", networkId: "undeployed",
  });
  for (const payload of [{ auctionId: "7" }, { commitment: "0xcommit" }, { auctionId: "7", commitment: 13 }]) {
    const result = primitive.getPayload(12 as any, evmTx(payload) as any).next().value;
    expect(result.data).toEqual([]);
  }
});

test("EVM ABI exposes no private bid opening fields", () => {
  const serialized = JSON.stringify(shadowBidAuctionAbi);
  expect(serialized).not.toMatch(/salt|opening|losingAmount/i);
});
