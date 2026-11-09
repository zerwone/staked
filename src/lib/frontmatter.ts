import { parse, YamlError, YamlValue } from './yaml.js';

export interface Frontmatter {
  data: Record<string, YamlValue> | null;
  body: string;
  error: string | null;
}

/** Split `---\n yaml \n---\n body`. data is null when there is no frontmatter block. */
export function readFrontmatter(text: string): Frontmatter {
  const src = text.replace(/^﻿/, '');
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) {
    // an empty block: ---\n---
    const e = /^---[ \t]*\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
    if (e) return { data: {}, body: src.slice(e[0].length), error: null };
    return { data: null, body: src, error: null };
  }
  try {
    const v = parse(m[1]);
    if (v === null) return { data: {}, body: src.slice(m[0].length), error: null };
    if (typeof v !== 'object' || Array.isArray(v)) return { data: null, body: src, error: 'frontmatter must be a mapping' };
    return { data: v as Record<string, YamlValue>, body: src.slice(m[0].length), error: null };
  } catch (e) {
    return { data: null, body: src, error: e instanceof YamlError ? e.message : String(e) };
  }
}
