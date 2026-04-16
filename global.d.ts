/**
 * 全局类型补充：Vite 客户端类型与 `import.meta.env` 占位声明。
 * 若项目使用环境变量，可在 `ImportMetaEnv` 中扩展字段。
 */
/// <reference types="vite/client" />

/**
 * 构建/运行时注入的环境变量键（按需扩展）。
 * 保持空接口以兼容 `vite/client` 的常见写法。
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Vite env 占位，由应用侧扩展
interface ImportMetaEnv {}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
