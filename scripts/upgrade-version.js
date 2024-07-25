#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const semver = require('semver');

const readPackageJson = fn => {
  try {
    const content = fs.readFileSync(fn, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`错误: 无法读取或解析 package.json: ${error.message}`);
  }

  return null;
};

const writePackageJson = (fn, json) => {
  try {
    const content = JSON.stringify(json, null, 2) + '\n';
    fs.writeFileSync(fn, content, 'utf8');
  } catch (error) {
    console.error(`错误: 无法写入文件: ${error.message}`);
  }
};

// 构建 package.json 路径
const packageJsonPath = path.join(__dirname, '../package.json');

// 读取 package.json
const packageJson = readPackageJson(packageJsonPath);
if (!packageJson) {
  process.exit(1);
}

// 获取当前版本
const currentVersion = packageJson.version;
if (!currentVersion) {
  console.error('错误: package.json 中未找到 version 字段');
  process.exit(1);
}

// 确定新版本
const newVersion = semver.inc(currentVersion, 'patch');

// 更新版本
packageJson.version = newVersion;

// 写入文件
writePackageJson(packageJsonPath, packageJson);
console.log(`✓ 版本已更新: ${currentVersion} -> ${newVersion}`);
