import { type Static, Type } from "@sinclair/typebox";
import { runPreparedQuery } from "@effectstream/db";
import {
  evmMidnightTableExists, getEvmMidnight, getShadowBidAuction,
  getShadowBidCommitments, listShadowBidAuctions, shadowBidServiceState,
} from "@evm-midnight/database";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";

const ResponseSchema = Type.Array(Type.Object({
  token_id: Type.String(),
  owner: Type.Union([Type.Null(), Type.String()]),
  block_height: Type.Number(),
  property_name: Type.String(),
  value: Type.String(),
  property_block_height: Type.Number(),
}));
const AuctionSchema = Type.Object({
  auction_id: Type.String(), evm_chain_id: Type.String(), evm_contract_address: Type.String(),
  midnight_network_id: Type.Union([Type.String(), Type.Null()]), midnight_contract_address: Type.Union([Type.String(), Type.Null()]),
  seller: Type.String(), nft_address: Type.String(), token_id: Type.String(), commit_deadline: Type.String(), settlement_deadline: Type.String(),
  reserve_price: Type.String(), midnight_domain: Type.String(), phase: Type.Union([Type.Literal("COMMIT"), Type.Literal("SETTLEMENT_READY"), Type.Literal("SETTLED"), Type.Literal("CANCELLED")]),
  commitment_count: Type.Number(), midnight_commitment_count: Type.Number(), settlement_commitment: Type.Union([Type.String(), Type.Null()]),
  winner: Type.Union([Type.String(), Type.Null()]), winning_amount: Type.Union([Type.String(), Type.Null()]), terminal_source_key: Type.Union([Type.String(), Type.Null()]),
  settlement_ready: Type.Boolean(), updated_source_key: Type.String(),
});
export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  server.get<{
    Reply: Static<typeof ResponseSchema>;
  }>("/api/erc721", async (_request, reply) => {
    const [tableExists] = await runPreparedQuery(evmMidnightTableExists.run(undefined, dbConn), "evmMidnightTableExists");
    if (!tableExists?.exists) {
      reply.send([]);
      return;
    }

    const result = await runPreparedQuery(
      getEvmMidnight.run(undefined, dbConn),
      "/api/erc721",
    );

    reply.send(result);
  });

  server.get<{ Reply: Static<typeof AuctionSchema>[] }>("/api/auctions", async (_request, reply) => {
    const result = await runPreparedQuery(listShadowBidAuctions.run({ limit: 100, offset: 0 }, dbConn), "/api/auctions");
    reply.send(result as Static<typeof AuctionSchema>[]);
  });

  server.get<{ Params: { auctionId: string } }>("/api/auctions/:auctionId", async (request, reply) => {
    const [auction] = await runPreparedQuery(getShadowBidAuction.run({ auction_id: request.params.auctionId }, dbConn), "/api/auctions/:auctionId");
    if (!auction) return reply.code(404).send({ error: "auction_not_found" });
    const commitments = await runPreparedQuery(getShadowBidCommitments.run({ auction_id: auction.auction_id }, dbConn), "/api/auctions/:auctionId/commitments");
    // Commitments are public hashes; this endpoint intentionally never returns bid openings or salts.
    return { auction, commitments };
  });

  server.get("/api/shadowbid/service-state", async () => {
    const [state] = await runPreparedQuery(shadowBidServiceState.run(undefined, dbConn), "/api/shadowbid/service-state");
    return state ?? { auction_count: 0, commit_count: 0, settlement_ready_count: 0, settled_count: 0, cancelled_count: 0 };
  });
};
