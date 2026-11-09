# Decisions

Append-only. Numbered. Dated. Everything else references the number.

- D-001 (2026-11-08) lanes is a vendor-neutral CLI, zero runtime deps, Node 20+, TypeScript, MIT.
- D-002 (2026-11-08) No messaging, orchestration or transcript import. Scope is roles, lanes, ledger, enforcement.
- D-003 (2026-11-08) Generated files are never hand-edited; everything regenerates from roles.yml, board.jsonl and frontmatter.
- D-004 (2026-11-08) Sister project `pocket`: local BYOK token router with keychain storage, 429 failover to the user's own free-tier keys, local dashboard. Spec in docs/POCKET-BUILD.md. Weaker fallback models accepted; stopping is not.
- D-005 (2026-11-08) roles.yml may carry a `provider_policy` block that pocket reads; lanes itself never calls a model.
- D-006 (2026-11-08) npm names: `@zerwone/lanes` and `@zerwone/pocket` (owner holds the @zerwone scope). Unscoped `lanes` and `pocket` are taken by unrelated packages; never document `npx lanes` or `npx pocket`. CLI command names stay `lanes` and `pocket`.
- D-007 (2026-11-08) Free-tier limits verified 2026-11-08 in docs/FREE-TIERS.md; pocket's providers.json adopts them. Mistral free tier off by default (requests may train their models).
- D-008 (2026-11-08) README footers credit "Built by Mohamad Aljadaan at ZerwOne". The origin project is described only as a private side project; it is never named in public material. Supersedes the no-ZerwOne line in LANES-BUILD for attribution only.
- D-009 (2026-11-08) Renamed lanes → **staked** (lanes.sh and agent-lanes already target coding agents). Package `@zerwone/staked`, command `staked`, repo `zerwone/staked`. "lane" stays as the concept. Old generated files, hooks and LANES_AGENT keep working.
