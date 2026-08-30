# Privacy model

The private value is the bid opening: amount plus salt. A commitment is computed over a domain-bound `Bid` record containing bidder and auction identity, so an opening cannot be moved to another auction/domain without failing verification.

Public disclosures are commitment hashes, lifecycle flags, and nullifiers. Result publication is currently disabled. The database schema intentionally has no salt, opening, losing amount, or private bid columns. The API returns public commitments only.

This is not a claim that all metadata is private. Addresses, timing, counts, commitment hashes, and transaction identity are public. The EVM contract trusts a coordinator signer and does not verify Midnight proofs. The current circuit has three slots, and the frontend does not submit bids.
