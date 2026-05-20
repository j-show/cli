/**
 * Inquirer 最小 API 形状。
 * @description Inquirer 为纯 ESM；源码在 NodeNext 下按 CJS 解析时静态 import 会 TS1479，故用动态 `import()` + 本地结构类型。
 * @internal
 */
export interface InquirerApi {
  /**
   * 弹出交互提示并返回用户选择。
   * @param questions - Inquirer 问题配置（单对象或数组）
   * @returns 以问题 `name` 为键的答案对象
   */
  prompt: <T extends Record<string, unknown> = Record<string, unknown>>(
    questions: object
  ) => Promise<T>;
}

/** 进程内单例，避免重复动态 import。 */
let inquirerSingleton: InquirerApi | undefined;

/**
 * 懒加载并缓存 `inquirer` 默认导出。
 * @returns Inquirer API 实例
 * @internal
 */
export const getInquirer = async (): Promise<InquirerApi> => {
  if (inquirerSingleton == null) {
    const mod = (await import('inquirer')) as unknown as {
      default: InquirerApi;
    };
    inquirerSingleton = mod.default;
  }
  return inquirerSingleton;
};

/**
 * 是/否确认提示。
 * @param message - 提示文案
 * @returns 用户选择为「是」时为 `true`
 */
export const confirmInquirer = async (message: string): Promise<boolean> => {
  const inquirer = await getInquirer();
  const { value } = await inquirer.prompt<{ value: boolean }>({
    type: 'confirm',
    name: 'value',
    message
  });

  return !!value;
};

/**
 * 单行文本输入提示。
 * @param message - 提示文案
 * @param defaultValue - 默认值（回车采纳）
 * @returns 去除首尾空白后的输入
 */
export const inputInquirer = async (
  message: string,
  defaultValue?: string
): Promise<string> => {
  const inquirer = await getInquirer();
  const { value } = await inquirer.prompt<{ value: string }>({
    type: 'input',
    name: 'value',
    message,
    default: defaultValue
  });

  return value.trim();
};

/** Inquirer 列表/多选的可选项：字符串或 `{ name, value }` 对象数组。 */
export type InquirerChoices = string[] | Array<{ name: string; value: string }>;

/**
 * 单选列表（`rawlist`）提示。
 * @param message - 提示文案
 * @param choices - 可选项
 * @param defaultValue - 默认选中值
 * @returns 选中项的 `value`（字符串列表时即为选项文本）
 */
export const selectInquirer = async (
  message: string,
  choices: InquirerChoices,
  defaultValue?: string
): Promise<string> => {
  const inquirer = await getInquirer();
  const { value } = await inquirer.prompt<{ value: string }>({
    type: 'rawlist',
    name: 'value',
    message,
    choices,
    default: defaultValue
  });

  return value;
};

/**
 * 多选列表提示。
 * @param message - 提示文案
 * @param choices - 可选项
 * @param defaultValue - 默认勾选项
 * @returns 选中项 `value` 数组
 */
export const checkboxInquirer = async (
  message: string,
  choices: InquirerChoices,
  defaultValue?: string[]
): Promise<string[]> => {
  const inquirer = await getInquirer();
  const { value } = await inquirer.prompt<{ value: string[] }>({
    type: 'checkbox',
    name: 'value',
    message,
    choices,
    default: defaultValue
  });

  return value;
};
