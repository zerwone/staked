// Minimatch-style globs, implemented here so lanes has zero runtime deps.
// Supported: ** (any depth), * (within a segment), ?, [abc] / [!abc], {a,b}.
// Semantics chosen for ownership checks:
//  - dotfiles are matched by * and ** (src/** owns src/.env)
//  - a pattern with no glob characters matches that path and everything under it
//  - a trailing slash means "everything under": docs/ == docs/**
//  - backslashes are normalised to forward slashes on both sides
//  - matching is case-sensitive (git paths are case-preserving)

const cache = new Map<string, RegExp>();

export function normalizePath(p: string): string {
  let s = p.replace(/\\/g, '/');
  while (s.startsWith('./')) s = s.slice(2);
  s = s.replace(/\/{2,}/g, '/');
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

function normalizePattern(p: string): string {
  let s = p.trim().replace(/\\/g, '/');
  while (s.startsWith('./')) s = s.slice(2);
  if (s.startsWith('/')) s = s.slice(1);
  if (s.endsWith('/')) s += '**';
  return s;
}

export function hasMagic(p: string): boolean {
  return /[*?[\]{}]/.test(p);
}

function escapeRe(c: string): string {
  return /[.+^$()|\\\/]/.test(c) ? '\\' + c : c;
}

function expandBraces(p: string): string[] {
  const open = p.indexOf('{');
  if (open < 0) return [p];
  let depth = 0;
  for (let i = open; i < p.length; i++) {
    if (p[i] === '{') depth++;
    else if (p[i] === '}') {
      depth--;
      if (depth === 0) {
        const inner = p.slice(open + 1, i);
        const parts: string[] = [];
        let d = 0;
        let cur = '';
        for (const c of inner) {
          if (c === '{') d++;
          if (c === '}') d--;
          if (c === ',' && d === 0) {
            parts.push(cur);
            cur = '';
          } else cur += c;
        }
        parts.push(cur);
        if (parts.length < 2) return [p];
        const pre = p.slice(0, open);
        const post = p.slice(i + 1);
        return parts.flatMap((x) => expandBraces(pre + x + post));
      }
    }
  }
  return [p];
}

function translate(pat: string): string {
  let re = '';
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === '*') {
      if (pat[i + 1] === '*') {
        const prevSlash = i === 0 || pat[i - 1] === '/';
        const nextSlash = pat[i + 2] === '/';
        const atEnd = i + 2 === pat.length;
        if (prevSlash && nextSlash) {
          re += '(?:[^/]*(?:/|$))*';
          i += 2; // consume ** and /
          continue;
        }
        if (prevSlash && atEnd) {
          // trailing /** also matches the directory itself: strip preceding slash
          if (re.endsWith('\\/')) re = re.slice(0, -2) + '(?:/.*)?';
          else re += '.*';
          i += 1;
          continue;
        }
        re += '.*';
        i += 1;
        continue;
      }
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else if (c === '[') {
      const close = pat.indexOf(']', i + 2);
      if (close < 0) {
        re += '\\[';
        continue;
      }
      let body = pat.slice(i + 1, close);
      if (body.startsWith('!')) body = '^' + body.slice(1);
      re += '[' + body.replace(/\\/g, '\\\\') + ']';
      i = close;
    } else {
      re += escapeRe(c);
    }
  }
  return re;
}

export function globToRegExp(pattern: string): RegExp {
  const key = pattern;
  const hit = cache.get(key);
  if (hit) return hit;
  const norm = normalizePattern(pattern);
  const alts = expandBraces(norm).map((p) => {
    if (!hasMagic(p)) return escapeLiteral(p) + '(?:/.*)?';
    return translate(p);
  });
  const re = new RegExp('^(?:' + alts.join('|') + ')$');
  cache.set(key, re);
  return re;
}

function escapeLiteral(p: string): string {
  return p.replace(/[.*+?^${}()|[\]\\\/]/g, (m) => '\\' + m);
}

export function matchGlob(pattern: string, path: string): boolean {
  return globToRegExp(pattern).test(normalizePath(path));
}

export function matchAny(patterns: string[], path: string): boolean {
  return patterns.some((p) => matchGlob(p, path));
}

/** A concrete path that the pattern matches (used to probe overlaps). */
export function samplePath(pattern: string): string {
  const norm = normalizePattern(expandBraces(pattern)[0]);
  return norm
    .replace(/\*\*/g, 'x')
    .replace(/\*/g, 'x')
    .replace(/\?/g, 'x')
    .replace(/\[!?([^\]])[^\]]*\]/g, (_m, c) => (_m.startsWith('[!') ? 'x' : c));
}

/** Literal leading part of a pattern, up to the first glob character. */
export function staticPrefix(pattern: string): string {
  const norm = normalizePattern(pattern);
  const m = /[*?[{]/.exec(norm);
  return m ? norm.slice(0, m.index) : norm;
}

/** Heuristic: could some path be matched by both patterns? */
export function globsOverlap(a: string, b: string): boolean {
  const pa = staticPrefix(a);
  const pb = staticPrefix(b);
  if (!(pa.startsWith(pb) || pb.startsWith(pa))) return false;
  const aSamples = expandBraces(normalizePattern(a)).map(samplePath);
  const bSamples = expandBraces(normalizePattern(b)).map(samplePath);
  return aSamples.some((s) => matchGlob(b, s)) || bSamples.some((s) => matchGlob(a, s));
}
