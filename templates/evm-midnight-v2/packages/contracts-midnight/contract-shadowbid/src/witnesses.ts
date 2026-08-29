export type ShadowBidPrivateState = { bids: Record<string, { bidder: Uint8Array; amount: bigint; salt: Uint8Array }> };
// All secret arguments are private circuit inputs; this source declares no Compact witnesses.
export const witnesses = {};
