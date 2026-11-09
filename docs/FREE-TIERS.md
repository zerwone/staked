# Free tiers, verified 2026-11-08

Checked against each provider's own docs on 2026-11-08 (NVIDIA: no official table exists; see note). Use these to replace the seed numbers in pocket's `providers.json` and set `verified_on: 2026-11-08`. Provider limits change; re-check before each release. Account-level limits in each provider's console override these.

| id | models on free tier (main) | RPM | RPD | tokens | card | caveats | source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| groq | openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.8-27b | 30 | 1,000 | 8K TPM, 200K TPD | no | **llama-3.3-70b-versatile is no longer listed**; docs say the table is "base limits for the Developer plan", so free may be lower: read live limits from console | [rate limits](https://console.groq.com/docs/rate-limits) |
| cerebras | gpt-oss-120b, qwen-3.8-27b | **5** | not listed | 30K uncached TPM, 90K total TPM, 1M TPH, 1M TPD | no | seed said 30 RPM: wrong. 5 RPM makes it a low-priority fallback for agents | [rate limits](https://inference-docs.cerebras.ai/support/rate-limits) |
| nvidia | 100+ hosted models | ~40, **account-wide across all models** | not published | not published | no (phone verify) | NVIDIA publishes no stable table; staff say limits depend on model and current traffic | [community-verified](https://news.creeta.com/en/nvidia-nim-free-tier-limits-2026/), [NVIDIA forum](https://forums.developer.nvidia.com/t/is-nim-free/369368) |
| openrouter | `:free` variants | 20 | 50; 1,000 after $10 lifetime credit purchase | n/a | no | confirmed | [limits](https://openrouter.ai/docs/api/reference/limits) |
| mistral | free-tier models | 1 req/sec (~60) | n/a | 500K TPM, 1B tokens/month | no (phone verify) | **requests on the free Experiment plan may be used to train Mistral's models**; dashboard must show this | [limits](https://help.mistral.ai/en/articles/225174-what-are-the-limits-of-the-free-tier), [experiment plan](https://help.mistral.ai/en/articles/450104-how-can-i-try-the-api-for-free-with-the-experiment-plan) |

## Changes pocket needs
1. Groq fallback model: replace `llama-3.3-70b-versatile` with `openai/gpt-oss-120b` (strong) / `qwen/qwen3.8-27b` (mid) / `openai/gpt-oss-20b` (fast). Read the account's live limits at runtime instead of trusting this table.
2. Cerebras: 5 RPM. Put it after groq, nvidia and mistral in the default order; it is a burst reserve, not a main lane.
3. NVIDIA: meter as one 40 RPM bucket shared by every model on the key.
4. Mistral: show "free-tier requests may be used for training" next to the provider in the dashboard and in `keys add mistral`. Default it to off in the policy until the user enables it.
5. Default order becomes: paid → groq → nvidia → mistral (if enabled) → openrouter → cerebras.
