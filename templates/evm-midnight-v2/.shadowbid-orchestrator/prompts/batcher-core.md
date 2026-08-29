# Mission

Implement the missing ShadowBid batcher settlement coordination after EVM, Midnight, and EffectStream cores are merged. Read AGENTS.md, concise status docs, docs/ARCHITECTURE_REVIEW.md, and actual merged interfaces first.

# Ownership

Own packages/batcher and focused batcher tests. Make only tiny shared-interface corrections when essential and report them. Do not edit frontend or broad docs. Do not commit.

# Required outcome

Add a versioned strict ShadowBid request envelope and validation path using real batcher APIs. Require explicit target/domain, correct auction and winner/result binding, authoritative settlement-ready state, deadline/expiry and size checks, authentication supported by the stack, and durable request ID/nonce replay rejection across restart. Reject forged winner, wrong auction/domain, premature/not-ready, duplicate, unknown-field/malformed, and wrong-method requests. Keep contract enforcement authoritative and do not imply a generic batcher receipt proves settlement validity. Keep private bid values/salts out of HTTP logs/storage.

# Acceptance

Add focused positive and adversarial tests, run them, and report exact integration/trust boundaries and results.
