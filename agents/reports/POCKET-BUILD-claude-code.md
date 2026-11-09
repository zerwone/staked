---
task: POCKET-BUILD
agent: claude-code
flags: []
tests_run:
  - "pocket: npm test inside a D-Bus session with gnome-keyring (real OS keychain): 9 files, 65 tests passed"
  - "pocket: npm test without a keychain: 62 passed, 3 keychain tests skipped"
  - "pocket: fresh clone from pocket.bundle, npm ci && npm test: 62 passed, 3 skipped"
  - "pocket: real Claude Code CLI 2.1.319 via claude-pocket against fake providers (test/claude-code.test.ts)"
  - "pocket doctor --offline with daemon up and keychain available: 0 errors, 6 warnings"
  - "lanes: npx tsc build + lanes check --staged --as claude-code on the claim commit"
native_boot: false
failover_latency_ms: { stream_median: 1, stream_p95: 3, nonstream_median: 1, nonstream_p95: 2, real_claude_code: 7 }
files_changed:
  - "agents/board.jsonl"
  - "agents/inbox/POCKET-BUILD.md"
  - "agents/inbox/claude-code/POCKET-BUILD.md"
  - "CLAUDE.md"
  - "AGENTS.md"
  - "agents/BOARD.md"
  - "agents/reports/POCKET-BUILD-claude-code.md"
pocket_repo: "/home/user/pocket (delivered as pocket.bundle; 8 commits, main 41492eb)"
pocket_files_changed:
  - ".gitignore"
  - "LICENSE"
  - "README.md"
  - "docs/ORIGIN.md"
  - "package-lock.json"
  - "package.json"
  - "providers.json"
  - "scripts/copy-assets.mjs"
  - "src/app.ts"
  - "src/cli.ts"
  - "src/commands/attach.ts"
  - "src/commands/daemon.ts"
  - "src/commands/keys.ts"
  - "src/commands/misc.ts"
  - "src/config.ts"
  - "src/ctx.ts"
  - "src/dash/dash.js"
  - "src/dash/index.html"
  - "src/keystore.ts"
  - "src/main.ts"
  - "src/meter.ts"
  - "src/policy.ts"
  - "src/providers.ts"
  - "src/router.ts"
  - "src/server.ts"
  - "src/sse.ts"
  - "src/state.ts"
  - "src/translate.ts"
  - "src/yaml.ts"
  - "test/attach.test.ts"
  - "test/claude-code.test.ts"
  - "test/daemon-doctor-lanes.test.ts"
  - "test/dash.test.ts"
  - "test/helpers.ts"
  - "test/keys.test.ts"
  - "test/latency.test.ts"
  - "test/meter-policy.test.ts"
  - "test/router.test.ts"
  - "test/translate.test.ts"
  - "tsconfig.json"
  - "vitest.config.ts"
---
# POCKET-BUILD report (claude-code)

Flags on: none.

Status: built and tested. BOARD row POCKET-BUILD set to REVIEW. pocket was not pushed or published:
the spec says "no push", and attaching `zerwone/pocket` to this session was denied, so the repo exists
only as a local git repo plus a **git bundle** handed to the owner (see "Where the code is").

## Where the code is

- Built at `/home/user/pocket` in the build container. The spec's `a new `pocket` repo` does not exist here (Linux cloud container).
- Git history: 8 commits on `main` (list below). Delivered as `pocket.bundle` (all refs).
  Restore with `git clone pocket.bundle pocket`. A fresh clone from the bundle passes `npm test` (62 passed, 3 keychain tests skipped without a D-Bus session).
- The container is temporary: the bundle is the copy that survives it.

| Commit | What |
|---|---|
| a5be16d | pocket: scaffold |
| 42293d5 | pocket: daemon start\|stop\|status\|logs |
| 13941a0 | pocket: keys add\|list\|rm |
| a52ea34 | pocket: route (translator, router, quota meter, 429 failover) |
| e2141e9 | pocket: attach/detach claude, codex, cursor |
| 051bae5 | pocket: dash |
| e8c6d18 | pocket: doctor, lanes sync |
| 41492eb | README, docs/ORIGIN.md |

## Evidence

`npm test` inside a D-Bus session with gnome-keyring unlocked (real OS keychain), at the end:

```
 ✓ test/claude-code.test.ts (1 test) 507ms
 ✓ test/dash.test.ts (2 tests) 313ms
 ✓ test/latency.test.ts (1 test) 314ms
 ✓ test/daemon-doctor-lanes.test.ts (5 tests) 2405ms
 ✓ test/attach.test.ts (13 tests) 43ms
 ✓ test/translate.test.ts (13 tests) 15ms
 ✓ test/keys.test.ts (5 tests) 864ms
 ✓ test/meter-policy.test.ts (8 tests) 8ms
 ✓ test/router.test.ts (17 tests) 10293ms
 Test Files  9 passed (9)
      Tests  65 passed (65)
   Duration  10.78s (transform 441ms, setup 0ms, collect 1.29s, tests 14.76s, environment 1ms, prepare 534ms)
```

Without a D-Bus session (keychain tests skip; the "refuse without keychain" test runs): `Test Files 9 passed, Tests 62 passed | 3 skipped (65)`.

Spec tests, where they are:

- Translator round-trips (text, system, tool_use/tool_result, streaming deltas both directions, images rejected cleanly): `test/translate.test.ts`.
- Quota meter arithmetic and UTC-midnight resets, policy ordering, cooldown, per-agent caps: `test/meter-policy.test.ts`.
- Integration with fake providers (`test/router.test.ts`): paid provider returns 429 → request lands on groq,
  `x-pocket-provider: groq`, the dashboard log shows exactly one failover event, the degraded banner appears once
  (not on the second request). Also covered: streaming, tool calls over streaming, "after the first token, finish
  on the same provider", a stream cut before the first token fails over, 5xx retried once then failover, timeouts,
  daily cap, nothing-can-serve 503, images.
- Keystore (`test/keys.test.ts`): add/list/rm against the **real** OS keychain (Linux Secret Service via gnome-keyring;
  Windows was not available), verify request, rejected key not stored, piped-stdin path of the real binary. After
  the test the whole config dir is grepped for the plaintext key, and `/proc/keys` for any kernel-keyring copy: none.
- Attach/detach (`test/attach.test.ts`): Codex `config.toml` is **byte-identical** after attach then detach for 5 file
  shapes (typical, no trailing newline, CRLF, empty, tables only) plus "no file before". VS Code `settings.json`
  byte-identical after `attach claude --vscode` then detach.
- Security (`test/router.test.ts`, `test/daemon-doctor-lanes.test.ts`): no local token → 401, a provider key in place of
  the token → 401, foreign Host header → 421, the daemon refuses `0.0.0.0` without `--i-know-this-is-exposed`,
  `/healthz` / dash / logs never contain a key.

### Done-when checks

| Check | Result |
|---|---|
| `npm test` passes | yes: 65/65 with keychain, 62 + 3 skipped without |
| a real Claude Code session attached via `claude-pocket` survives a forced 429 and continues on the second provider with the degraded banner | **yes, with fake providers** (`test/claude-code.test.ts`). The real `claude` CLI 2.1.319, started through the generated launcher, sent its request to pocket; the fake paid provider returned 429; pocket served it from the fake groq (Claude Code's 12 tools translated to OpenAI format); the session ended `subtype: success` and its result starts `[pocket] running on groq/llama-3.3-70b-versatile, anthropic quota exhausted (429)`. No real provider keys exist in this environment, so the upstreams are local fakes. |
| `pocket dash` shows the event | yes: `test/dash.test.ts` loads the page in Chromium (phone width), sends a request, and the failover row appears live over SSE with no reload and no page errors |
| `pocket doctor` is clean | 0 errors. 6 warnings remain and are true: no keys stored here, and the 5 free-tier limits are unverified (see Blocked) |
| `detach` leaves both agent configs byte-identical | yes for Codex `config.toml` and VS Code `settings.json` (tested). The `claude-pocket` launcher is a new file and is removed |

### Measured failover latency (ms from the 429 reaching pocket to the first token on the fallback)

Measured by pocket itself (the dashboard's "429 → first token" column), local fake providers, 30 runs each (`test/latency.test.ts`):

- streaming: median 1 ms, p95 3 ms, max 5 ms
- non-streaming: median 1 ms, p95 2 ms, max 3 ms
- the real Claude Code run above: 7 ms

These are pocket's own overhead plus a local fake's time to first token. Against real providers, add the fallback
provider's own time to first token (network + queue), which pocket does not control.

## Decisions made without owner

1. **Location.** `a new `pocket` repo` does not exist here, so pocket was built at `/home/user/pocket` and delivered as a git
   bundle. Attaching `zerwone/pocket` was denied in this session, and the spec says "no push" anyway.
2. **Linux keychain = Secret Service via `secret-tool`, not the npm module.** Tests showed `@napi-rs/keyring` on Linux
   (a) silently falls back to the kernel keyring when no Secret Service is reachable, and (b) also caches every key in
   the kernel persistent keyring and does **not** remove that copy on delete. Kernel keys are not on disk, but they
   vanish on reboot or idle expiry, and `keys rm` must mean gone. So on Linux pocket drives libsecret through
   `secret-tool` (the key goes in over stdin, never argv), requires `org.freedesktop.secrets` on the session bus, and
   refuses otherwise with the reason. Windows and macOS use `@napi-rs/keyring` (Credential Manager, Keychain). Test
   leftovers in this container's kernel keyring were removed by hand (`keyctl` invalidate); `/proc/keys` is clean.
3. **Free-tier limits not re-verified.** The spec says to re-verify every limit from the providers' own docs. Every docs host
   (console.groq.com, inference-docs.cerebras.ai, docs.api.nvidia.com, openrouter.ai, docs.mistral.ai) was unreachable
   from this environment (blocked by the proxy and DNS). `providers.json` therefore carries the spec's seed numbers with
   `verified_on: null` and `source: "spec seed table (unverified)"`. `pocket doctor` warns about each one, and the dashboard marks
   them with `*`. The live 429 always wins over the seed numbers. Model ids per tier and the paid `price_per_mtok`
   values (used only to enforce `daily_cap_usd`) are likewise unverified placeholders, and the file says so.
4. **README quickstart does not say `npx pocket`.** The npm name `pocket` belongs to an unrelated package (v0.1.0).
   Following the spec's `npx pocket keys add groq` literally would have users download a stranger's code and paste an
   API key into it. The README installs from the repo and warns against `npx pocket`. The owner needs to pick a
   publishable name. (The same is true of `lanes` on npm. Its README still says `npx lanes`; that needs the same fix
   before anyone follows it.)
5. **Banner placement.** The banner is prefixed to the first text of the first reply after a failover, so every client
   shows it (Claude Code's `-p` result only shows final text; a separate block was dropped there). If the reply opens
   with a tool call, the banner gets its own text block in front and the tool block indices shift by one. It is shown
   once per agent and provider, and again only after the agent has returned to its primary and failed over again.
6. **Pivot through the Anthropic shape.** Every inbound request is normalised to an Anthropic request and every response to
   Anthropic events, then converted for the upstream and the client. OpenAI→OpenAI traffic (Codex to groq) therefore
   loses OpenAI-only parameters (e.g. `response_format`, `logprobs`, `n`).
7. **Failover rules.** A 429 is never retried on the same provider: it sets a cooldown from `retry-after`, or from
   `cooldown_seconds`. 5xx, timeout and connection errors are retried `retry_same_provider` times, then fail over. A 4xx
   other than 429 moves to the next provider without a retry (the request may suit another provider). Before the first
   token, a stream that errors **or ends without `message_stop`/`[DONE]`** counts as a failure. After the first token the
   reply finishes on the same provider, and a break closes the stream with an `error` event.
8. **What counts as a failover event.** Only a live failure inside a request is logged (with latency). Requests that simply skip
   a provider that is still cooling down are not logged again, so the log is not flooded.
9. **Agent identity.** From `x-pocket-agent` (Claude Code via `ANTHROPIC_CUSTOM_HEADERS`, Codex via `http_headers` in our own
   provider table), or a `/a/<agent>/` path prefix for clients that cannot set headers (Cursor). With neither, the global policy applies.
10. **Codex table.** Besides the spec's four keys, pocket's own `[model_providers.pocket]` table sets `wire_api = "chat"` and
    `http_headers = { "x-pocket-agent" = "codex" }`. The edit is textual (the file is never re-serialised). A TOML parse check
    proves that no other key changed, and pocket refuses if the result would not parse. A `codex-pocket` launcher sets `POCKET_TOKEN`.
11. **Cursor `--write`.** Not implemented: it exits 2 with the reason. Cursor keeps the OpenAI key and base URL in its
    internal app database, not in a settings file pocket can show as a diff and edit safely. `attach cursor` prints the
    values and notes that Agent/Composer may not route through it, and that Cursor may call custom URLs from its servers.
12. **VS Code.** `attach claude --vscode` edits `claudeCode.environmentVariables` only when `settings.json` is plain JSON.
    With comments (JSONC) it prints the snippet instead, because a JSONC rewrite would lose the comments.
13. **Images.** They go only to providers marked `images: true` (anthropic, openai). If the only image-capable provider is
    rate-limited, the client gets a 503 that says so; if none in the order supports images, a 422.
14. **count_tokens** is answered locally (about 4 characters per token), so it never spends quota or triggers failover.
15. **Local token.** It is a random secret in the config dir (mode 0600), not a provider key. It has to be on disk because the launchers
    pass it to the agent. The dashboard accepts it once in the URL and then uses an HttpOnly, SameSite=Strict cookie.
16. **Commits.** One commit per command group. `attach claude/codex/cursor` share one source file and one commit, and
    `doctor` and `lanes sync` share one. The intermediate commits are not each buildable on their own (the CLI imports all
    commands); the final tree is the evidence, as the spec says.
17. **lanes side.** The owner had already added the README "Sister project" line and `provider_policy` on main. I merged
    main into the branch and changed neither. The spec moved to `agents/inbox/claude-code/` with frontmatter (body unchanged).

## Blocked / not verified

- **Windows keychain and Windows run.** No Windows machine here. Credential Manager is used through `@napi-rs/keyring`
  but has not been exercised. The `.cmd` launchers are written but not run. Owner: please run `npm test` on Windows.
- **Real providers.** No real keys and no network to the providers from this environment. Every provider was a local fake that
  speaks the provider's wire format. The first real session should run `pocket keys add <p>` (it verifies the key) and
  `pocket route` to see which provider answers.
- **Free-tier limits and model ids.** Not re-verified (decision 3).
- **Codex and Cursor clients.** Neither binary exists here. Codex attach/detach is tested on the config file. The
  `http_headers` / `wire_api` keys follow Codex's documented provider table but were not run against a real Codex.
