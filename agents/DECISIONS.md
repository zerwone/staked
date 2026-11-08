# Decisions

Append-only. Numbered. Dated. Everything else references the number.

- D-001 (2026-11-08) lanes is a vendor-neutral CLI, zero runtime deps, Node 20+, TypeScript, MIT.
- D-002 (2026-11-08) No messaging, orchestration or transcript import. Scope is roles, lanes, ledger, enforcement.
- D-003 (2026-11-08) Generated files are never hand-edited; everything regenerates from roles.yml, board.jsonl and frontmatter.
- D-004 (2026-11-08) Sister project `pocket`: local BYOK token router with keychain storage, 429 failover to the user's own free-tier keys, local dashboard. Spec in docs/POCKET-BUILD.md. Weaker fallback models accepted; stopping is not.
- D-005 (2026-11-08) roles.yml may carry a `provider_policy` block that pocket reads; lanes itself never calls a model.
