/**
 * @fileoverview 字符串与 {@link RegExp} 互转辅助
 */

const VALID_REGEXP_FLAGS = /^[gimsuy]*$/;

/**
 * 将字符串转为正则对象。
 *
 * - 若以 `/` 开头，则按 JavaScript 正则字面量形式解析：`/pattern/flags`（模式中可用 `\\/` 表示字面量 `/`）。
 * - 否则将整段字符串视为正则源码；此时可使用 `defaultFlags`。
 *
 * @param source - 正则字面量字符串，或正则源码
 * @param defaultFlags - 非字面量形式时使用的标志位（字面量形式时忽略）
 * @returns 转换后的 {@link RegExp}
 * @example
 * ```ts
 * import { toRegExp } from '@jshow/cli';
 *
 * toRegExp('/\\.test\\./i').test('a.TEST.ts'); // true
 * toRegExp('^foo$', 'i').test('FOO'); // true
 * ```
 */
export const toRegExp = (source: string, defaultFlags = ''): RegExp => {
  const s = source.trim();

  if (!s.startsWith('/')) {
    return new RegExp(s, defaultFlags);
  }

  let i = 1;
  let pattern = '';
  while (i < s.length) {
    const c = s[i];

    if (c === '\\' && i + 1 < s.length) {
      pattern += c + s[i + 1];
      i += 2;
      continue;
    }

    if (c === '/') {
      const flags = s.slice(i + 1);
      if (!VALID_REGEXP_FLAGS.test(flags)) {
        return new RegExp(s, defaultFlags);
      }

      return new RegExp(pattern, flags);
    }

    pattern += c;
    i++;
  }

  return new RegExp(s, defaultFlags);
};

/**
 * 将逗号分隔的模式字符串转为多个 {@link RegExp}（空段会被丢弃）。
 * @param source - 例如 `"^foo$,/bar/i"`；各段交由 {@link toRegExp} 解析
 * @returns 非空正则数组
 * @example
 * ```ts
 * import { toPatterns } from '@jshow/cli';
 *
 * const [a, b] = toPatterns('^pkg-,/\\.test\\./i');
 * ```
 */
export const toPatterns = (source: string) => {
  return source
    .split(',')
    .map(o => {
      const v = o && o.trim();
      return v ? toRegExp(v) : null;
    })
    .filter(Boolean) as RegExp[];
};
