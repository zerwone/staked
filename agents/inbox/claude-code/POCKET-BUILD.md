---
task: POCKET-BUILD
owner: claude-code
status: open
allowed_paths: ["docs/POCKET-BUILD.md", "agents/roles.yml", "README.md"]
done_when: "pocket npm test passes; attached Claude Code session survives a forced 429 with the degraded banner; dash shows the event; doctor clean; detach leaves agent configs byte-identical"
---
# POCKET-BUILD — build `pocket`, the local BYOK token router for coding agents

Owner spec. Agent: claude-code. Date: 2026-11-08. Status: open.
Flags on: none required. New repo; touches nothing in `lanes` except `docs/` and `roles.yml` (provider_policy, see §7).

## Goal
`pocket` keeps coding agents alive when their paid model runs out of quota by failing over to the user's own free-tier keys. Bring-your-own-key, keys in the OS keychain, one daemon on localhost, one local dashboard, one command to attach each agent. Degraded is fine; stopped is not.

Pitch: *your agent never stops for lack of tokens. your keys, your machine, your quota, all providers in one pocket.*

## Non-goals
- No shared or pooled keys. Every key belongs to the user running the daemon. Nothing is uploaded anywhere.
- No hosted service, no accounts, no telemetry.
- No support for Gemini CLI or Antigravity OAuth (provider ToS bans proxying; accounts get banned).
- Not a model quality equaliser. Fallback keeps the session running on a weaker model and says so.

## Allowed write paths
- New folder `a new `pocket` repo` (repo `zerwone/pocket`). Initialise git there.
- In `lanes`: `docs/POCKET-BUILD.md` (this file), `agents/roles.yml` (`provider_policy` key only), `README.md` (one link line).

## Hard constraints
- Node 20+, TypeScript. Runtime deps allowed only for: keychain access, SSE/streaming, TOML parse. Nothing else.
- Binds to `127.0.0.1` only. Refuse to start if asked to bind elsewhere without `--i-know-this-is-exposed`.
- Keys never touch disk in plaintext. OS keychain (Windows Credential Manager, macOS Keychain, libsecret). If no keychain is available, refuse to store and say why.
- Every outbound request carries only the user's own key for that provider. No key is ever reused across providers or users.
- MIT. No project, client or company names in code, readme or examples.
- `npm test` green is the only evidence of done. Nobody approves their own work.

## Architecture
```
agent (Claude Code / Codex / Cursor)
   │  ANTHROPIC_BASE_URL / model_providers.base_url / custom OpenAI URL
   ▼
pocket daemon  127.0.0.1:3460
   ├── /anthropic/v1/messages      Anthropic-compatible in
   ├── /openai/v1/chat/completions OpenAI-compatible in
   ├── translator                  Anthropic ⇄ OpenAI (tools, streaming, system, images)
   ├── router                      policy + quota meter + 429 failover
   ├── quota meter                 per provider: req/min, req/day, tokens/day, live 429 feedback
   ├── keystore                    OS keychain
   └── /dash                       local dashboard (static html + SSE)
```

### Providers (v0.1)
| id | base | format | free limits to seed the meter (re-verify at build time) |
| --- | --- | --- | --- |
| groq | api.groq.com/openai/v1 | openai | 30 rpm, 1,000 rpd |
| cerebras | api.cerebras.ai/v1 | openai | 30 rpm, ~1M tok/day |
| nvidia | integrate.api.nvidia.com/v1 | openai | ~40 rpm, ~1,000 rpd |
| openrouter | openrouter.ai/api/v1 | openai | 20 rpm, 50 rpd free (1,000 with $10 top-up); use `:free` model variants |
| mistral | api.mistral.ai/v1 | openai | ~1B tok/month on experiment tier (user must opt in on Mistral's side) |
| anthropic | api.anthropic.com | anthropic | paid; user sets a daily $ cap |
| openai | api.openai.com/v1 | openai | paid; user sets a daily $ cap |
| custom | user-supplied | either | user-supplied limits |

Limits live in `providers.json`, editable, with a `verified_on` date. The meter trusts live 429s over the seed numbers.

### Model mapping
Agents ask for `claude-opus-*`, `claude-sonnet-*`, `gpt-*`. Each provider entry maps those tiers to its own model ids (`tier.strong`, `tier.mid`, `tier.fast`). Unmapped names fall back to `tier.mid`. The response header `x-pocket-provider: groq` and `x-pocket-model: llama-3.3-70b` always tells the client what actually ran.

### Routing policy (`pocket.yml`)
```yaml
order:                 # tried top to bottom until one has headroom
  - anthropic          # paid, until daily_cap_usd
  - groq
  - cerebras
  - nvidia
  - openrouter
  - mistral
caps:
  anthropic: { daily_cap_usd: 10 }
  openai:    { daily_cap_usd: 0 }     # 0 = never use
failover:
  on: [429, 5xx, timeout, connection]
  retry_same_provider: 1
  cooldown_seconds: 60               # after a 429, skip that provider this long
degraded_banner: true                # inject one line into the first assistant turn after a fallover: "[pocket] running on groq/llama-3.3-70b, anthropic quota exhausted"
```

## Commands (build in this order, one commit each: `pocket: <cmd>`)
1. `pocket daemon start|stop|status|logs` — single process, pid file in the user config dir, `/healthz` lists providers and whether each has a key (never the key).
2. `pocket keys add <provider>` / `keys list` / `keys rm` — prompts for the key with echo off, stores in keychain, verifies with one cheap request, records `verified_on`.
3. `pocket route` — the translator + router + meter. Streaming must work end to end (SSE both directions). Tool calls must round-trip Anthropic ⇄ OpenAI. Failover mid-stream before first token is allowed; after first token, finish on the same provider.
4. `pocket attach claude` — writes a `claude-pocket` launcher (`.cmd` on Windows, shell script elsewhere) that sets `ANTHROPIC_BASE_URL=http://127.0.0.1:3460/anthropic` and `ANTHROPIC_AUTH_TOKEN=<local random token>`, then execs `claude`. Also offers to add the same to VS Code `claudeCode.environmentVariables`. `detach` removes it.
5. `pocket attach codex` — adds to `~/.codex/config.toml`:
   ```toml
   [model_providers.pocket]
   name = "pocket"
   base_url = "http://127.0.0.1:3460/openai/v1"
   env_key = "POCKET_TOKEN"
   ```
   and sets `model_provider = "pocket"` behind a backup of the original file. `detach` restores the backup. Never touch any other key in that file.
6. `pocket attach cursor` — prints the exact settings to paste (custom OpenAI base URL + key); writes them only with `--write` after showing the diff. Document that agent/Composer features may not route through it.
7. `pocket dash` — opens `http://127.0.0.1:3460/dash`. Shows: per-provider quota bars (used / known limit, reset time), current provider per attached agent, today's paid spend vs cap, failover log (time, from, to, reason), degraded state. Plain HTML + one JS file, no framework, SSE for live updates.
8. `pocket doctor` — checks keychain availability, port free, each key still valid, provider limits older than 30 days, agents attached but daemon down.
9. `pocket lanes sync` — if a `lanes` repo is present, read `agents/roles.yml` `provider_policy` and write per-agent routing overrides (see §7).

## 7. lanes integration
`roles.yml` gains an optional block:
```yaml
provider_policy:
  claude-code: { order: [anthropic, groq, cerebras], daily_cap_usd: 10 }
  codex:       { order: [openai, nvidia, openrouter], daily_cap_usd: 5 }
  reviewer:    { order: [groq, cerebras, nvidia] }     # free only
```
Agent identity comes from the `x-pocket-agent` header set by the `attach` launcher. No header → global policy.

## Tests
- Vitest. Unit: translator round-trips (text, system, tool_use/tool_result, streaming deltas, images rejected cleanly where unsupported); quota meter arithmetic and resets; policy ordering; cooldown.
- Integration with a fake provider server: paid provider returns 429 → request lands on next provider, response carries the right `x-pocket-provider`, dashboard log shows one failover event, degraded banner appears once.
- Keystore: add/list/rm against the real OS keychain on Windows; plaintext never appears in config dir (grep the dir after the test).
- Attach/detach: codex `config.toml` is byte-identical after `attach` then `detach`.
- Security: a request without the local token is rejected; the daemon refuses to bind to `0.0.0.0` without the override flag.

## Deliverables
- `a new `pocket` repo`: `src/`, `test/`, `providers.json`, `README.md`, `LICENSE`, `docs/ORIGIN.md` (why: agents stop when quota ends; BYOK keeps them running on the user's own free tiers, legally, locally).
- README: 30-second quickstart (`npx pocket keys add groq`, `npx pocket attach claude`, `claude-pocket`), the provider table, the policy file, a clear "weaker models on fallback" note, the ToS note (your own keys only).
- Report in `lanes/agents/reports/POCKET-BUILD-claude-code.md` with frontmatter `flags: []`, `tests_run`, `files_changed`, plus measured failover latency (ms from 429 to first token on the fallback).
- No npm publish, no push. Owner publishes.

## Done when
`npm test` passes; a real Claude Code session attached via `claude-pocket` survives a forced 429 from the first provider and continues on the second with the degraded banner; `pocket dash` shows the event; `pocket doctor` is clean; `detach` leaves both agent configs byte-identical to before.

## Working rules
- Claim POCKET-BUILD on the lanes board before starting. One task at a time.
- Owner is away: pick the option closest to this spec, record it under "Decisions made without owner" in the report, continue. Do not wait.
- Three consecutive failures on one step: stop, report, mark BLOCKED.
- Re-verify every free-tier limit from the provider's own docs at build time and write the date into `providers.json`. Do not trust the seed table above.
