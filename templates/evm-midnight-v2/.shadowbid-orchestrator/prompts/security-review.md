# Mission

Perform one concentrated, read-only Sol-class security/privacy/cross-chain review of merged ShadowBid. Read the architecture summary, relevant diffs, contract and Compact code, state machine, batcher, test matrix, and privacy/security docs. Avoid broad repository rediscovery.

Return findings grouped CRITICAL, HIGH, MEDIUM, LOW with exact file/line evidence and concrete remediation. Review forged winner, wrong auction, double settlement, replay, authorization, frontend authority, timing edges, Solidity issues, deterministic-state/event ordering, witness misuse, DB/log/event/API/browser leakage, incorrect ZK claims, and trust assumptions. Explicitly assess whether losing bids are unnecessarily disclosed and whether settlement eligibility can be forged.

Do not edit files or implement fixes. If no finding exists at a severity, say so. Distinguish proven implementation facts from assumptions.
