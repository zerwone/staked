import { describe, expect, it } from 'vitest';
import { globsOverlap, matchGlob, normalizePath } from '../src/lib/glob.js';

describe('glob', () => {
  it('matches ** at any depth including the directory itself', () => {
    expect(matchGlob('server/**', 'server/a/b.ts')).toBe(true);
    expect(matchGlob('server/**', 'server')).toBe(true);
    expect(matchGlob('server/**', 'serverx/a')).toBe(false);
    expect(matchGlob('**/*.md', 'README.md')).toBe(true);
    expect(matchGlob('**/*.md', 'a/b/c.md')).toBe(true);
    expect(matchGlob('src/**/x.ts', 'src/x.ts')).toBe(true);
    expect(matchGlob('src/**/x.ts', 'src/a/b/x.ts')).toBe(true);
    expect(matchGlob('src/**/x.ts', 'src/ax.ts')).toBe(false);
  });

  it('* stays within a segment, ? is one char, classes and braces work', () => {
    expect(matchGlob('src/*.ts', 'src/a.ts')).toBe(true);
    expect(matchGlob('src/*.ts', 'src/a/b.ts')).toBe(false);
    expect(matchGlob('T-?.md', 'T-1.md')).toBe(true);
    expect(matchGlob('[ab].txt', 'a.txt')).toBe(true);
    expect(matchGlob('[!ab].txt', 'a.txt')).toBe(false);
    expect(matchGlob('{server,deploy}/**', 'deploy/x')).toBe(true);
    expect(matchGlob('src/*.{ts,js}', 'src/a.js')).toBe(true);
  });

  it('dotfiles match, literal patterns own their subtree, trailing slash means subtree', () => {
    expect(matchGlob('src/**', 'src/.env')).toBe(true);
    expect(matchGlob('docs', 'docs/a.md')).toBe(true);
    expect(matchGlob('docs', 'docsx')).toBe(false);
    expect(matchGlob('docs/', 'docs/a/b')).toBe(true);
    expect(matchGlob('README.md', 'README.md')).toBe(true);
  });

  it('normalises Windows backslashes in paths and patterns', () => {
    expect(normalizePath('server\\api\\x.ts')).toBe('server/api/x.ts');
    expect(normalizePath('.\\a\\\\b\\')).toBe('a/b');
    expect(matchGlob('server/**', 'server\\api\\x.ts')).toBe(true);
    expect(matchGlob('server\\**', 'server/api/x.ts')).toBe(true);
    expect(matchGlob('supabase/**', 'server\\api\\x.ts')).toBe(false);
  });

  it('detects lane overlaps', () => {
    expect(globsOverlap('server/**', 'server/api/**')).toBe(true);
    expect(globsOverlap('src/*.ts', 'src/*.js')).toBe(false);
    expect(globsOverlap('server/**', 'supabase/**')).toBe(false);
    expect(globsOverlap('docs/**', 'docs/**')).toBe(true);
    expect(globsOverlap('**/*.md', 'docs/x.md')).toBe(true);
  });
});
