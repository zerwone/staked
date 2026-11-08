# Example: two agents on a web app

A repo scaffolded by `lanes init --agents claude-code,cursor --owner alex`, then used for a morning:

- `claude-code` owns the API and database (`api/**`, `db/**`) and is the boss.
- `cursor` owns the front end (`web/**`).
- The orders API contract lives in `agents/specs/orders-api.md`; both sides change it there first.
- `claude-code` is DOING T-001 (the endpoint). `cursor` finished T-002 (the page), filed
  `agents/reports/T-002-cursor.md` and set it to REVIEW.
- `cursor` asked the owner one question (Q-001) and built on its default meanwhile.

Everything under `agents/BOARD.md`, `agents/HISTORY.md`, `CLAUDE.md`, `AGENTS.md` and
`.cursor/rules/lanes.mdc` is generated. The sources are `agents/roles.yml`,
`agents/board.jsonl`, `agents/questions.jsonl` and the spec frontmatter.

Try it (copy the folder somewhere outside this repo first, so lanes finds this `agents/`):

```sh
cp -r examples/two-agents /tmp/two-agents && cd /tmp/two-agents && git init -q
npx lanes board                     # T-002 REVIEW cursor, T-001 DOING claude-code
npx lanes questions open            # Q-001, blocks T-002, default: same page, filter chip
npx lanes check --as cursor --paths web/orders.tsx,api/orders.ts
#   - api/orders.ts: outside cursor's lane (lane of claude-code)
npx lanes status T-002 DONE --as cursor        # refused: nobody approves their own work
npx lanes status T-002 DONE --as claude-code   # the reviewer approves
npx lanes doctor
```
