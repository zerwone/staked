import { Args, bool } from '../lib/args.js';
import { Ctx, findRepo } from '../lib/context.js';
import { CONTEXT_LIMIT, runGen } from '../lib/render.js';

export function cmdGen(ctx: Ctx, args: Args): number {
  const repo = findRepo(ctx);
  const res = runGen(repo, { force: bool(args, 'force'), dryRun: bool(args, 'dry-run') });
  if (bool(args, 'json')) {
    ctx.out(JSON.stringify(res, null, 2));
    return res.refused.length ? 1 : 0;
  }
  for (const [f, size] of Object.entries(res.sizes)) {
    const tag = res.refused.includes(f) ? 'refused' : res.written.includes(f) ? 'wrote' : 'same';
    const over = !f.startsWith('agents/') && size >= CONTEXT_LIMIT ? '  OVER 6 KB TARGET' : '';
    ctx.out(`${tag.padEnd(8)} ${f.padEnd(26)} ${String(size).padStart(5)} B${over}`);
  }
  for (const f of res.removed) ctx.out(`removed  ${f} (no agent reads it any more)`);
  if (res.refused.length) {
    ctx.err(
      `staked gen: refused to overwrite hand-written ${res.refused.join(', ')}. ` +
        'Move what matters into agents/roles.yml or agents/DECISIONS.md, delete the file, and rerun (or pass --force).',
    );
    return 1;
  }
  return 0;
}
