/**
 * @fileoverview Git 常用命令封装
 * @description 基于 `utils/node` 的 `execSync` 封装分支、拉取、未提交文件与清理等操作。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { eachDirSync, execSync, rmSync } from './node';

/**
 * 返回当前仓库 HEAD 的短分支名。
 * @param cwd - 工作目录，默认进程当前目录
 */
export const getCurrentBranch = (cwd?: string) => {
  const stdout = execSync('git rev-parse --abbrev-ref HEAD', { cwd });
  return (
    stdout
      .split(os.EOL)
      .filter(v => !!v)[0]
      .trim() || ''
  );
};

/**
 * 对当前分支执行 `git pull --rebase`；若 `prune` 为真则再 `git fetch --all --prune`。
 * @param prune - 是否在 pull 后 prune 远程引用
 * @param cwd - 工作目录
 */
export const pullCurrentBranch = (
  prune = true,
  cwd?: string,
  verbose?: boolean
) => {
  execSync('git pull --rebase', { cwd, verbose });
  if (prune) {
    execSync('git fetch --all --prune', { cwd, verbose });
  }
};

/**
 * 仓库脏文件列表（覆盖 staged/unstaged/untracked）。
 * @param cwd - 工作目录
 */
export const getUnCommittedFiles = (cwd?: string) => {
  // Porcelain 格式可稳定解析：包含未跟踪/已暂存/未暂存等变更
  const stdout = execSync('git status --porcelain', { cwd });
  return stdout
    .split(os.EOL)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.slice(3).trim())
    .filter(Boolean);
};

/**
 * 最近一条提交信息：`detail` 为真时用 `%B`（含 body），否则用 `%s`（单行 subject）。
 * @param detail - 是否完整提交说明
 * @param cwd - 工作目录
 */
export const getLastestCommitMessage = (detail = true, cwd?: string) => {
  return execSync(`git log -n1 --format=${detail ? '%B' : '%s'}`, { cwd });
};

/**
 * 在 `cwd` 下用 shell 通配删除多层及根目录的 `node_modules`（破坏性操作，谨慎使用）。
 * @param cwd - 工作目录
 */
export const removeNodeModules = (cwd?: string) => {
  // execSync('rm -rf ./**/**/node_modules', { cwd });
  // execSync('rm -rf ./**/node_modules', { cwd });
  // execSync('rm -rf ./node_modules', { cwd });

  const root = cwd ?? process.cwd();
  const queue: string[] = [root];
  const visited = new Set<string>();

  while (queue.length) {
    const dir = queue.shift();
    if (!dir || visited.has(dir)) continue;
    visited.add(dir);

    const nm = path.join(dir, 'node_modules');
    if (fs.existsSync(nm)) {
      rmSync(nm);
      // 删除后不再深入 node_modules
    }

    eachDirSync(
      dir,
      (_name, childPath, stat) => {
        if (!stat.isDirectory()) return;
        if (path.basename(childPath) === 'node_modules') return;
        queue.push(childPath);
      },
      ['file', 'link']
    );
  }
};

/**
 * 执行 `git clean -xdf`：删除未跟踪文件与目录。
 * @param cwd - 工作目录
 */
export const cleanGit = (cwd?: string) => {
  execSync('git clean -xdf', { cwd });
};

/**
 * 执行 `git add -A`（暂存所有变更）。
 * @param cwd - 工作目录
 */
export const addGit = (cwd?: string) => {
  execSync('git add -A', { cwd });
};

/**
 * 使用 `git commit -F <file>` 从文件读取提交信息并提交。
 * @param fn - 提交信息文件路径
 * @param cwd - 工作目录
 * @description
 * 内部使用 `git commit -n` 跳过 hooks（用于自动化流程场景）。
 */
export const commitGitByFile = (fn: string, cwd?: string) => {
  // 使用 JSON.stringify 做最小安全引用（双引号 + 转义）
  execSync(`git commit -F ${JSON.stringify(fn)}`, { cwd });
};

/**
 * 执行 `git push` 推送当前分支。
 * @param cwd - 工作目录
 */
export const pushGit = (cwd?: string) => {
  execSync('git push', { cwd });
};
