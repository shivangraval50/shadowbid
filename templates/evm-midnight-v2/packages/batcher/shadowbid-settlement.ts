import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type {
  BatchBuildingOptions,
  BatchBuildingResult,
  BlockchainAdapter,
  BlockchainHash,
  BlockchainTransactionReceipt,
  DefaultBatcherInput,
} from "@effectstream/batcher-sdk";

/** The only ShadowBid operation accepted by the public batcher endpoint. */
export const SHADOWBID_TARGET_V1 = "shadowbid";
export const SHADOWBID_ENVELOPE_VERSION = "shadowbid-batcher/v1";
const MAX_ENVELOPE_BYTES = 8 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_LIFETIME_MS = 15 * 60 * 1000;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const UINT = /^(0|[1-9][0-9]*)$/;
const REQUEST_ID = /^[A-Za-z0-9_-]{16,96}$/;

export type ShadowBidEnvelopeV1 = {
  version: typeof SHADOWBID_ENVELOPE_VERSION;
  requestId: string;
  target: typeof SHADOWBID_TARGET_V1;
  action: "publish_coordinator_result";
  timestamp: string;
  expiresAt: string;
  auction: {
    evmChainId: string;
    evmContract: string;
    auctionId: string;
    midnightNetworkId: string;
    midnightContract: string;
    midnightDomain: string;
  };
  payload: {
    winner: string;
    commitment: string;
    amount: string;
    settlementDigest: string;
    nonce: string;
  };
};

export type SettlementReadyState = {
  auction: ShadowBidEnvelopeV1["auction"];
  phase: "SETTLEMENT_READY";
  settlementDeadlineMs: number;
  commitmentsClosed: true;
  recordedCommitments: readonly string[];
  approvedResult: ShadowBidEnvelopeV1["payload"];
};

/**
 * This must query finalized EVM/Midnight contract state (and the coordinator's
 * result authority), not the EffectStream projection or a batcher receipt.
 */
export interface AuthoritativeSettlementReader {
  getSettlementReadyState(
    auction: ShadowBidEnvelopeV1["auction"],
  ): Promise<SettlementReadyState | null>;
}

type ReplayFile = { version: 1; keys: Record<string, { acceptedAt: number; requestHash: string }> };

/** A small append-independent registry; processed queue entries may disappear, replay keys never do. */
export class DurableReplayGuard {
  private readonly file: string;
  private chain = Promise.resolve();

  constructor(directory: string) {
    this.file = `${directory}/shadowbid-replays.json`;
  }

  async claim(envelope: ShadowBidEnvelopeV1): Promise<boolean> {
    const operation = async () => {
      const state = await this.read();
      const auctionKey = `${envelope.auction.evmChainId}:${envelope.auction.evmContract.toLowerCase()}:${envelope.auction.auctionId}`;
      const keys = [`request:${envelope.requestId}`, `nonce:${auctionKey}:${envelope.payload.nonce}`];
      if (keys.some((key) => state.keys[key])) return false;
      const requestHash = createHash("sha256").update(canonicalJson(envelope)).digest("hex");
      for (const key of keys) state.keys[key] = { acceptedAt: Date.now(), requestHash };
      await mkdir(this.file.slice(0, this.file.lastIndexOf("/")), { recursive: true });
      const tmp = `${this.file}.${randomUUID()}.tmp`;
      await writeFile(tmp, JSON.stringify(state), { mode: 0o600 });
      await rename(tmp, this.file);
      return true;
    };
    const result = this.chain.then(operation, operation);
    this.chain = result.then(() => undefined, () => undefined);
    return result;
  }

  private async read(): Promise<ReplayFile> {
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as ReplayFile;
      if (parsed.version !== 1 || !parsed.keys || typeof parsed.keys !== "object") throw new Error("invalid replay registry");
      return parsed;
    } catch (error: any) {
      if (error?.code === "ENOENT") return { version: 1, keys: {} };
      throw error;
    }
  }
}

export function parseShadowBidEnvelope(input: string, now = Date.now()): ShadowBidEnvelopeV1 {
  if (new TextEncoder().encode(input).byteLength > MAX_ENVELOPE_BYTES) throw new Error("envelope exceeds 8192 bytes");
  let value: unknown;
  try { value = JSON.parse(input); } catch { throw new Error("envelope is not JSON"); }
  if (!isRecord(value) || canonicalJson(value) !== input) throw new Error("envelope must be canonical JSON");
  assertKeys(value, ["action", "auction", "expiresAt", "payload", "requestId", "target", "timestamp", "version"], "envelope");
  if (value.version !== SHADOWBID_ENVELOPE_VERSION || value.target !== SHADOWBID_TARGET_V1 || value.action !== "publish_coordinator_result") throw new Error("unsupported ShadowBid envelope");
  if (typeof value.requestId !== "string" || !REQUEST_ID.test(value.requestId)) throw new Error("invalid requestId");
  assertDecimal(value.timestamp, "timestamp"); assertDecimal(value.expiresAt, "expiresAt");
  const timestamp = Number(value.timestamp); const expiresAt = Number(value.expiresAt);
  if (!Number.isSafeInteger(timestamp) || !Number.isSafeInteger(expiresAt) || timestamp > now + MAX_CLOCK_SKEW_MS || expiresAt <= now || expiresAt - timestamp > MAX_LIFETIME_MS) throw new Error("expired or invalid envelope time window");
  if (!isRecord(value.auction)) throw new Error("invalid auction");
  assertKeys(value.auction, ["auctionId", "evmChainId", "evmContract", "midnightContract", "midnightDomain", "midnightNetworkId"], "auction");
  for (const key of ["evmChainId", "auctionId"] as const) assertDecimal(value.auction[key], key);
  if (typeof value.auction.evmContract !== "string" || !ADDRESS.test(value.auction.evmContract)) throw new Error("invalid evmContract");
  for (const key of ["midnightNetworkId", "midnightContract", "midnightDomain"] as const) if (typeof value.auction[key] !== "string" || !BYTES32.test(value.auction[key])) throw new Error(`invalid ${key}`);
  if (!isRecord(value.payload)) throw new Error("invalid payload");
  assertKeys(value.payload, ["amount", "commitment", "nonce", "settlementDigest", "winner"], "payload");
  if (typeof value.payload.winner !== "string" || !ADDRESS.test(value.payload.winner)) throw new Error("invalid winner");
  for (const key of ["commitment", "settlementDigest"] as const) if (typeof value.payload[key] !== "string" || !BYTES32.test(value.payload[key])) throw new Error(`invalid ${key}`);
  for (const key of ["amount", "nonce"] as const) assertDecimal(value.payload[key], key);
  return value as ShadowBidEnvelopeV1;
}

/** Strict adapter layered over the real Midnight adapter and its batching lifecycle. */
export class ShadowBidSettlementAdapter<T> implements BlockchainAdapter<T> {
  constructor(
    private readonly inner: BlockchainAdapter<T>,
    private readonly stateReader: AuthoritativeSettlementReader,
    private readonly replayGuard: DurableReplayGuard,
  ) {}

  async validateInput(input: DefaultBatcherInput) {
    try {
      if (input.target !== SHADOWBID_TARGET_V1) throw new Error("ShadowBid requires explicit target=shadowbid");
      const envelope = parseShadowBidEnvelope(input.input);
      const state = await this.stateReader.getSettlementReadyState(envelope.auction);
      if (!state || state.phase !== "SETTLEMENT_READY" || !state.commitmentsClosed) throw new Error("auction is not authoritatively settlement-ready");
      if (Date.now() > state.settlementDeadlineMs || envelope.expiresAt > String(state.settlementDeadlineMs)) throw new Error("auction or request has expired");
      if (!sameAuction(state.auction, envelope.auction)) throw new Error("wrong auction domain");
      if (!state.recordedCommitments.map((v) => v.toLowerCase()).includes(envelope.payload.commitment.toLowerCase())) throw new Error("unknown winning commitment");
      if (!sameResult(state.approvedResult, envelope.payload)) throw new Error("winner/result does not match authoritative settlement result");
      if (!await this.replayGuard.claim(envelope)) throw new Error("duplicate request ID or settlement nonce");
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : "invalid ShadowBid request" };
    }
  }

  buildBatchData(inputs: DefaultBatcherInput[], options?: BatchBuildingOptions): BatchBuildingResult<T> | null {
    // The generated Midnight adapter only understands {circuit,args}; secrets
    // are absent because this endpoint never accepts commit/open operations.
    const converted = inputs.map((input) => ({ ...input, input: toMidnightCall(parseShadowBidEnvelope(input.input)) }));
    const result = this.inner.buildBatchData(converted, options);
    return result && { ...result, selectedInputs: inputs.filter((input) => result.selectedInputs.some((selected: DefaultBatcherInput) => selected.timestamp === input.timestamp && selected.address === input.address && selected.input === toMidnightCall(parseShadowBidEnvelope(input.input)))) };
  }
  submitBatch(data: T, fee: string | bigint): Promise<BlockchainHash> { return this.inner.submitBatch(data, fee); }
  estimateBatchFee(data: T): Promise<string | bigint> | string | bigint { return this.inner.estimateBatchFee(data); }
  waitForTransactionReceipt(hash: BlockchainHash, timeout?: number): Promise<BlockchainTransactionReceipt> { return this.inner.waitForTransactionReceipt(hash, timeout); }
  getAccountAddress(): string { return this.inner.getAccountAddress(); }
  getChainName(): string { return this.inner.getChainName(); }
  isReady(): boolean { return this.inner.isReady(); }
  getBlockNumber(): Promise<bigint> { return this.inner.getBlockNumber(); }
  getSyncProtocolName?(): string { return this.inner.getSyncProtocolName?.(); }
  getRateLimitKeyStrategy() { return "ip-and-address" as const; }
}

function toMidnightCall(e: ShadowBidEnvelopeV1): string {
  return canonicalJson({ circuit: "publish_coordinator_result", args: [e.payload.winner, e.payload.commitment, e.payload.amount, e.payload.settlementDigest, e.payload.nonce] });
}
function sameAuction(a: ShadowBidEnvelopeV1["auction"], b: ShadowBidEnvelopeV1["auction"]): boolean { return canonicalJson(normalize(a)) === canonicalJson(normalize(b)); }
function sameResult(a: ShadowBidEnvelopeV1["payload"], b: ShadowBidEnvelopeV1["payload"]): boolean { return canonicalJson(normalize(a)) === canonicalJson(normalize(b)); }
function normalize<T>(value: T): T { return JSON.parse(canonicalJson(value).replace(/0x[0-9a-fA-F]+/g, (v) => v.toLowerCase())); }
function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function assertKeys(value: Record<string, any>, expected: string[], name: string): void { if (Object.keys(value).sort().join(",") !== expected.sort().join(",")) throw new Error(`unknown or missing ${name} field`); }
function assertDecimal(value: unknown, name: string): asserts value is string { if (typeof value !== "string" || !UINT.test(value)) throw new Error(`invalid ${name}`); }
export function canonicalJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`; if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`; return JSON.stringify(value); }
