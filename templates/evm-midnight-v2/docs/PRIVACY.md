# Privacy model

The private value is the bid opening: amount plus salt. A commitment is computed over a domain-bound `Bid` record containing bidder and auction identity, so an opening cannot be moved to another auction/domain without failing verification.

Public disclosures are commitment hashes, lifecycle flags, nullifiers, and the selected coordinator result. The database schema intentionally has no salt, opening, losing amount, or private bid columns. The API returns public commitments only. Privacy tests scan API, database, browser output, and configured logs for private-field leakage.

This is not a claim that all metadata is private. Addresses, timing, counts, commitment hashes, transaction identity, and final published result fields are public. The EVM contract trusts a coordinator signer and does not verify Midnight proofs. The current circuit has two slots, and the frontend does not submit bids.
