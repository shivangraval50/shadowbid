import { Stm } from "@effectstream/sm";
import { grammar } from "./grammar.ts";
import type { BaseStfInput } from "@effectstream/sm";
import {
  getEvmMidnightByTokenId,
  insertEvmMidnight,
  insertEvmMidnightProperty,
  getShadowBidFacts,
  insertShadowBidSourceFact,
  upsertShadowBidAuction,
  upsertShadowBidCommitment,
} from "@evm-midnight/database";
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import { contractAddressesEvmMain } from "@evm-midnight/contracts-evm";
import { reduceAuctionFacts, sourceKey, type ShadowBidFact, type ShadowBidFactKind } from "./shadowbid.ts";

const stm = new Stm<typeof grammar, {}>(grammar);

const decodeField = (x: string | { [key: string]: number }): string => {
  if (typeof x === 'string') {
    // Hex-encoded string: each pair of hex chars is one ASCII byte
    return x.replace(/../g, m => String.fromCharCode(parseInt(m, 16)))
      .replace(/\0/g, '')
      .trim();
  }
  // Legacy byte-index object
  return Array(Object.keys(x).length)
    .fill(0)
    .map((_, i) => x[i])
    .map(c => String.fromCharCode(c))
    .join('')
    .replace(/\0/g, '')
    .trim();
};

stm.addStateTransition(
  "shadowBidEvm",
  function* (data) {
    yield* ingestShadowBidFact(data.parsedInput.fact);
  },
);

stm.addStateTransition(
  "shadowBidMidnight",
  function* (data) {
    yield* ingestShadowBidFact(data.parsedInput.fact);
  },
);

function* ingestShadowBidFact(raw: any): any {
  if (!raw || (raw.protocol !== "evm" && raw.protocol !== "midnight")) return;
  const payload = raw.payload && typeof raw.payload === "object" ? raw.payload : {};
  const auctionId = String(payload.auctionId ?? raw.auctionId ?? "");
  const eventIndex = Number(raw.eventIndex);
  const factKind = raw.factKind as ShadowBidFactKind;
  if (!auctionId || !Number.isSafeInteger(eventIndex) || eventIndex < 0 || !validFactKind(raw.protocol, factKind)) return;
  // Midnight observations are commitments/nullifiers only. In particular, an
  // amount or salt is never accepted into the public source-fact payload.
  if (raw.protocol === "midnight" && ("amount" in payload || "salt" in payload)) return;

  const networkId = String(raw.networkId ?? "");
  const contractAddress = raw.protocol === "evm"
    ? String(raw.contractAddress ?? "").toLowerCase()
    : String(raw.contractAddress ?? "");
  const transactionId = String(raw.transactionId ?? "");
  const blockHeight = Number(raw.blockHeight);
  if (!networkId || !contractAddress || !transactionId || !Number.isSafeInteger(blockHeight) || blockHeight < 0) return;
  const key = sourceKey(raw.protocol, networkId, contractAddress, transactionId, eventIndex);
  const fact: ShadowBidFact = {
    source_key: key, protocol: raw.protocol, network_id: networkId,
    contract_address: contractAddress, transaction_id: transactionId,
    event_index: eventIndex, auction_id: auctionId, fact_kind: factKind,
    semantic_key: semanticKey(factKind, auctionId, payload), block_height: blockHeight, payload,
  };
  const inserted = yield* World.resolve(insertShadowBidSourceFact, fact);
  if (!inserted.length) return;
  const facts = yield* World.resolve(getShadowBidFacts, { auction_id: auctionId });
  const view = reduceAuctionFacts(facts as ShadowBidFact[]);
  if (!view) return;
  yield* World.resolve(upsertShadowBidAuction, view);
  for (const commitmentFact of facts as ShadowBidFact[]) {
    if (commitmentFact.fact_kind !== "evm.commitment_recorded" && commitmentFact.fact_kind !== "midnight.commitment_recorded") continue;
    const commitment = String(commitmentFact.payload.commitment ?? "");
    if (commitment) yield* World.resolve(upsertShadowBidCommitment, {
      auction_id: auctionId, commitment, source_key: commitmentFact.source_key, protocol: commitmentFact.protocol,
    });
  }
}

function validFactKind(protocol: string, kind: ShadowBidFactKind): boolean {
  return protocol === "evm"
    ? kind.startsWith("evm.")
    : kind === "midnight.commitment_recorded";
}

function semanticKey(kind: ShadowBidFactKind, auctionId: string, payload: Record<string, unknown>): string | null {
  if (kind === "evm.auction_created") return `auction:${auctionId}:created`;
  if (kind === "evm.commitment_recorded" || kind === "midnight.commitment_recorded") {
    const commitment = String(payload.commitment ?? "");
    return commitment ? `auction:${auctionId}:${kind}:${commitment}` : null;
  }
  return null;
}

stm.addStateTransition(
  "midnightContractState",
  function* (data) {
    console.log("[STM:midnight] raw parsedInput:", JSON.stringify(data.parsedInput, null, 2));

    const payload: {
      round: string;
      contract_address: string | { [key: string]: number };
      token_id: string | { [key: string]: number };
      property_name: string | { [key: string]: number };
      value: string | { [key: string]: number };
    } = data.parsedInput.payload;

    console.log("[STM:midnight] payload keys:", Object.keys(payload));
    console.log("[STM:midnight] payload:", JSON.stringify(payload, null, 2));

    const contract_address = decodeField(payload.contract_address);
    const token_id = decodeField(payload.token_id);
    const property_name = decodeField(payload.property_name);
    const value = decodeField(payload.value);

    console.log("[STM:midnight] decoded:", { contract_address, token_id, property_name, value });

    if (!token_id) {
      console.log("[STM:midnight] empty token_id, skipping");
      return;
    }

    try {
      const [evmMidnight] = yield* World.resolve(getEvmMidnightByTokenId, {
        contract_address,
        token_id,
      });

      if (!evmMidnight) {
        yield* World.resolve(insertEvmMidnight, {
          contract_address,
          token_id,
          owner: "",
          block_height: data.blockHeight,
        });
      }

      yield* World.resolve(insertEvmMidnightProperty, {
        contract_address,
        token_id,
        property_name,
        value,
        block_height: data.blockHeight,
      });
    } catch (error) {
      console.error("[TRANSFER-ASSETS] Database not ready.", error);
      return;
    }
  },
);

stm.addStateTransition(
  "transfer-assets",
  function* (data) {
    const { to, tokenId }: any = data.parsedInput;
    const contract_address =
      contractAddressesEvmMain().chain31337["Erc721DevModule#Erc721Dev"];
    yield* World.resolve(insertEvmMidnight, {
      contract_address,
      token_id: tokenId,
      owner: to,
      block_height: data.blockHeight,
    });
  },
);

export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
