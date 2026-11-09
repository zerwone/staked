import { describe, expect, it } from 'vitest';
import { parse, stringify } from '../src/lib/yaml.js';
import { ROLES } from './helpers.js';

describe('yaml subset', () => {
  it('parses the spec roles.yml', () => {
    const d: any = parse(ROLES);
    expect(d.owner).toBe('mohamad');
    expect(d.agents['claude-code'].lane).toEqual(['supabase/**', 'deploy/**', 'tools/launcher/**']);
    expect(d.agents['claude-code'].can_boot_client).toBe(false);
    expect(d.agents['codex-2'].lane).toEqual([]);
    expect(d.rules).toHaveLength(5);
    expect(d.rules[1]).toBe("never edit another lane's files");
    expect(d.resources).toEqual(['sandbox']);
  });

  it('parses block lists, quoted strings, block scalars, comments', () => {
    const d: any = parse(`a: "x # not a comment"
b: 'it''s'
c:
  - one
  - "two: three"
d: |
  line1
  line2
e: >
  folded
  text
f: ~
g: 12
h:
- k: v
  m: [1, 2]
`);
    expect(d.a).toBe('x # not a comment');
    expect(d.b).toBe("it's");
    expect(d.c).toEqual(['one', 'two: three']);
    expect(d.d).toBe('line1\nline2\n');
    expect(d.e).toBe('folded text\n');
    expect(d.f).toBeNull();
    expect(d.g).toBe(12);
    expect(d.h).toEqual([{ k: 'v', m: [1, 2] }]);
  });

  it('rejects bad indentation and duplicate keys', () => {
    expect(() => parse('a: 1\n   b: 2\n')).toThrow(/indentation/);
    expect(() => parse('a: 1\na: 2\n')).toThrow(/duplicate/);
  });

  it('round-trips stringify', () => {
    const v = { owner: 'o', agents: { x: { status: 'active', lane: ['src/**'], n: true } }, rules: ['a: b', "c's"], empty: [] };
    expect(parse(stringify(v))).toEqual(v);
  });

  it('handles CRLF', () => {
    expect(parse('a: 1\r\nb: [x, y]\r\n')).toEqual({ a: 1, b: ['x', 'y'] });
  });
});
