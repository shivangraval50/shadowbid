import { Primitive } from "@effectstream/sm";
import { AddressType } from "@effectstream/utils";
import { generateRawStmInput } from "@effectstream/concise";
import { Type } from "@sinclair/typebox";
import type { ConfigSyncProtocolType, FlattenSyncProtocolIOFor } from "@effectstream/config";
import type { EffectstreamBlockNumber } from "@effectstream/utils";
import type { StateUpdateStream } from "@effectstream/coroutine";

export const shadowBidEvmGrammar = [
  ["fact", Type.Any()],
] as const;

export const shadowBidAuctionAbi = [
  { type: "event", name: "AuctionCreated", anonymous: false, inputs: [
    { indexed: true, name: "auctionId", type: "uint256" }, { indexed: true, name: "seller", type: "address" }, { indexed: true, name: "nft", type: "address" },
    { indexed: false, name: "tokenId", type: "uint256" }, { indexed: false, name: "commitDeadline", type: "uint64" }, { indexed: false, name: "settlementDeadline", type: "uint64" }, { indexed: false, name: "reservePrice", type: "uint128" }, { indexed: false, name: "midnightDomain", type: "bytes32" },
  ] },
  { type: "event", name: "CommitmentRecorded", anonymous: false, inputs: [
    { indexed: true, name: "auctionId", type: "uint256" }, { indexed: true, name: "commitment", type: "bytes32" },
  ] },
  { type: "event", name: "AuctionSettled", anonymous: false, inputs: [
    { indexed: true, name: "auctionId", type: "uint256" }, { indexed: true, name: "winner", type: "address" }, { indexed: false, name: "amount", type: "uint256" }, { indexed: true, name: "commitment", type: "bytes32" }, { indexed: false, name: "settlementDigest", type: "bytes32" },
  ] },
  { type: "event", name: "AuctionCancelled", anonymous: false, inputs: [
    { indexed: true, name: "auctionId", type: "uint256" }, { indexed: true, name: "caller", type: "address" }, { indexed: false, name: "timedOut", type: "bool" },
  ] },
] as const;

type EventKind = "evm.auction_created" | "evm.commitment_recorded" | "evm.auction_settled" | "evm.auction_cancelled";

export class ShadowBidAuctionPrimitive extends Primitive<any, typeof shadowBidEvmGrammar> {
  readonly internalTypeName = "EVM:ShadowBidAuction" as any;
  readonly grammar = shadowBidEvmGrammar;
  readonly contractAddress: string;
  readonly abi: any;
  readonly eventKind: EventKind;
  readonly chainId: string;

  constructor(config: any) {
    super(config);
    this.contractAddress = config.contractAddress;
    this.abi = config.abi;
    this.eventKind = config.eventKind;
    this.chainId = String(config.chainId);
  }

  *getPayload(_height: EffectstreamBlockNumber, tx: FlattenSyncProtocolIOFor<ConfigSyncProtocolType.EVM_RPC_PARALLEL>): StateUpdateStream<any> {
    const index = tx.syncProtocol.logIndex ?? tx.syncProtocol.transactionIndex ?? 0;
    const payload = JSON.parse(JSON.stringify(tx.output.payload, (_key, value) => typeof value === "bigint" ? value.toString() : value));
    const fact = {
      protocol: "evm",
      networkId: this.chainId,
      contractAddress: this.contractAddress.toLowerCase(),
      transactionId: tx.syncProtocol.transactionHash,
      eventIndex: index,
      blockHeight: tx.syncProtocol.blockNumber,
      factKind: this.eventKind,
      payload: { ...payload, chainId: this.chainId },
    };
    return {
      isBatched: false,
      data: [{
        fromAddressAndType: { type: AddressType.NONE, address: "0x0" },
        accountingPayload: fact,
        stateMachinePayload: this.stateMachinePrefix ? generateRawStmInput(this.grammar, this.stateMachinePrefix, { fact }) : null,
      }],
    };
  }

  getConfig(): any {
    return { name: this.instanceName, type: this.internalTypeName, startBlockHeight: this.startBlockHeight, contractAddress: this.contractAddress, abi: this.abi, stateMachinePrefix: this.stateMachinePrefix, eventKind: this.eventKind, chainId: this.chainId };
  }
}

/**
 * The Midnight indexer supplies a transaction identity on the configured
 * parallel primitive. Only its public commitment record is forwarded; unknown
 * ledger shapes are ignored rather than guessed or decoded as private data.
 */
export class ShadowBidMidnightPrimitive extends Primitive<any, typeof shadowBidEvmGrammar> {
  readonly internalTypeName = "Midnight:ShadowBidPublic" as any;
  readonly grammar = shadowBidEvmGrammar;
  readonly contractAddress: string;
  readonly networkId: string;
  readonly contract: any;

  constructor(config: any) {
    super(config);
    this.contractAddress = config.contractAddress;
    this.networkId = config.networkId;
    this.contract = config.contract;
  }

  *getPayload(_height: EffectstreamBlockNumber, tx: FlattenSyncProtocolIOFor<ConfigSyncProtocolType.MIDNIGHT_PARALLEL>): StateUpdateStream<any> {
    const payload = JSON.parse(JSON.stringify(tx.output.payload, (_key, value) => typeof value === "bigint" ? value.toString() : value));
    const auctionId = payload.auctionId ?? payload.auction_id;
    const commitment = payload.commitment;
    if (auctionId == null || typeof commitment !== "string" || !commitment) return { isBatched: false, data: [] };
    const index = tx.syncProtocol.logIndex ?? tx.syncProtocol.transactionIndex ?? 0;
    const fact = {
      protocol: "midnight", networkId: this.networkId, contractAddress: this.contractAddress,
      transactionId: tx.syncProtocol.transactionHash, eventIndex: index, blockHeight: tx.syncProtocol.blockNumber,
      factKind: "midnight.commitment_recorded", payload: { auctionId: String(auctionId), commitment },
    };
    return { isBatched: false, data: [{
      fromAddressAndType: { type: AddressType.NONE, address: "0x0" }, accountingPayload: fact,
      stateMachinePayload: this.stateMachinePrefix ? generateRawStmInput(this.grammar, this.stateMachinePrefix, { fact }) : null,
    }] };
  }

  getConfig(): any {
    return { name: this.instanceName, type: this.internalTypeName, startBlockHeight: this.startBlockHeight, contractAddress: this.contractAddress, stateMachinePrefix: this.stateMachinePrefix, networkId: this.networkId, contract: this.contract };
  }
}
