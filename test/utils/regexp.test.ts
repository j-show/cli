/**
 * @fileoverview `toRegExp` / `toPatterns` 契约测试
 */

import { describe, expect, it } from 'vitest';

import { toPatterns, toRegExp } from '../../src/utils/regexp';

describe('toRegExp', () => {
  it('非字面量字符串应作为 pattern 源码解析', () => {
    expect(toRegExp('^foo$', 'i').test('FOO')).toBe(true);
  });

  it('应解析 /pattern/flags 字面量', () => {
    expect(toRegExp('/\\.test\\./i').test('a.TEST.ts')).toBe(true);
  });

  it('非法 flags 时应将整段字面量作为 pattern 并套用 defaultFlags', () => {
    const re = toRegExp('/abc/xyz', 'i');
    expect(re.flags).toBe('i');
    expect(re.test('/ABC/xyz')).toBe(true);
    expect(re.test('abc')).toBe(false);
  });
});

describe('toPatterns', () => {
  it('空串应返回空数组', () => {
    expect(toPatterns('')).toEqual([]);
    expect(toPatterns()).toEqual([]);
    expect(toPatterns(void 0)).toEqual([]);
  });

  it('逗号分隔多段应丢弃空白段', () => {
    const [a, b] = toPatterns('^pkg-a$, ,^pkg-b$');
    expect(a.test('pkg-a')).toBe(true);
    expect(b.test('pkg-b')).toBe(true);
    expect(toPatterns(' , ')).toEqual([]);
  });
});
