/**
 * @fileoverview 通用数组小工具
 */

/**
 * 创建一个去重后的新数组，仅保留第一次出现的元素。
 * @param arr - 传入的数组
 * @returns 去重后的新数组
 */
export const uniq = <T>(arr: T[]): T[] => {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const item of arr) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
};

/**
 * 拍平成一维数组，支持2-n维数组。
 * @param arr - 需要拍平的多维数组
 * @returns 一维新数组
 */
export const flatMap = <T>(arr: T[][]): T[] => {
  const result: T[] = [];

  const flatten = (input: any[]) => {
    for (const item of input) {
      if (Array.isArray(item)) {
        flatten(item);
      } else {
        result.push(item);
      }
    }
  };

  flatten(arr);

  return result;
};
