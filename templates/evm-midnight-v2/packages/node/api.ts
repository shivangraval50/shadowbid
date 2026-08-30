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
  reserve_price: Type.String(), midnight_domain: Type.String(), phase: Type.Union([Type.Literal("COMMIT"), Type.Literal("COMMITMENT_CORRELATED"), Type.Literal("SETTLED"), Type.Literal("CANCELLED")]),
  commitment_count: Type.Number(), midnight_commitment_count: Type.Number(), settlement_commitment: Type.Union([Type.String(), Type.Null()]),
  winner: Type.Union([Type.String(), Type.Null()]), winning_amount: Type.Union([Type.String(), Type.Null()]), terminal_source_key: Type.Union([Type.String(), Type.Null()]),
  commitment_correlated: Type.Boolean(), updated_source_key: Type.String(),
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
    return state ?? { auction_count: 0, commit_count: 0, commitment_correlated_count: 0, settled_count: 0, cancelled_count: 0 };
  });

  /**
   * Judge-demo workflow status, derived strictly from the public EffectStream
   * projection. It reports only what the indexed public state can actually
   * justify — it never reports a stage complete on the basis of a local
   * script's intent, and it never exposes a bid opening, salt, losing amount,
   * or losing bidder identity (none of those exist in this projection at all).
   *
   * Stage inference rules, and why each is sound:
   * - `mint`/`auction`: an indexed `AuctionCreated` fact implies the ERC-721 was
   *   already escrowed, because `createAuction` performs `safeTransferFrom`
   *   before emitting that event.
   * - `commit`: counted from public commitment *hashes* only.
   * - `close`/`prove`: the Compact `commitments_closed`/`consumed_*` flags are
   *   deliberately NOT part of the public projection, so they cannot be read
   *   here. They are reported complete only once settlement succeeded, which is
   *   sound: `ShadowBidAuction.settle` requires a coordinator EIP-712
   *   authorization, and the coordinator signs only after
   *   `validateCoordinatorDecision` confirms a closed, consumed, domain-matching
   *   Midnight ledger. Before settlement they report `unavailable`, not a guess.
   * - `settle`/`owner`: taken from the terminal settled fact and its public winner.
   */
  server.get("/api/shadowbid/demo-status", async () => {
    const auctions = await runPreparedQuery(
      listShadowBidAuctions.run({ limit: 100, offset: 0 }, dbConn),
      "/api/shadowbid/demo-status",
    );
    if (auctions.length === 0) {
      return {
        available: false,
        mode: "UNAVAILABLE" as const,
        message: "No ShadowBid auction has been indexed yet. Start the local stack and run the three-bidder flow to populate this view.",
        stages: { mint: "ready", auction: "ready", commit: "ready", close: "ready", prove: "ready", settle: "ready", owner: "ready" },
        final_owner: null,
      };
    }
    // Most advanced auction wins: settled first, then correlated, then most commitments.
    const rank = (a: typeof auctions[number]) =>
      (a.phase === "SETTLED" ? 3000 : a.commitment_correlated ? 2000 : 1000) +
      a.midnight_commitment_count + a.commitment_count;
    const featured = [...auctions].sort((x, y) => rank(y) - rank(x))[0]!;

    const settled = featured.phase === "SETTLED";
    // Public commitment evidence is whichever side actually indexed the hashes.
    // `CommitmentRecorded` on EVM and `midnight.commitment_recorded` on Midnight
    // carry the *same* commitment hash, so the larger count is the number of
    // distinct public commitments genuinely observable — never a sum, which
    // would double-count a hash seen on both chains. Reporting only the Midnight
    // side previously made a settled auction render as `commit: "ready"` with a
    // count of 0, which was internally inconsistent and understated real
    // evidence, because this template's Midnight commitment primitive does not
    // currently emit facts for this ledger shape (EVM-side hashes still do).
    const publicCommitments = Math.max(featured.commitment_count, featured.midnight_commitment_count);
    const commitStage = publicCommitments >= 3 ? "complete" : publicCommitments > 0 ? "live" : "ready";
    const lifecycleStage = settled ? "complete" : "unavailable";

    return {
      available: true,
      mode: settled ? ("LIVE" as const) : ("EVIDENCE" as const),
      message: settled
        ? `Auction ${featured.auction_id} settled. The winner and winning amount are public by protocol design; losing bids were never published.`
        : `Auction ${featured.auction_id} is in ${featured.phase}. Midnight close/open-consume flags are private to the coordinator's authoritative reader and are not asserted here until settlement proves they held.`,
      stages: {
        mint: "complete",
        auction: "complete",
        commit: commitStage,
        close: lifecycleStage,
        prove: lifecycleStage,
        settle: settled ? "complete" : "ready",
        owner: featured.winner ? "complete" : "ready",
      },
      auction_id: featured.auction_id,
      phase: featured.phase,
      public_commitment_count: publicCommitments,
      evm_commitment_count: featured.commitment_count,
      midnight_commitment_count: featured.midnight_commitment_count,
      winning_amount: featured.winning_amount,
      final_owner: featured.winner,
    };
  });
};
