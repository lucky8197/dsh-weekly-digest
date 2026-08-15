#!/usr/bin/env node
/**
 * setup-dsh-deps — 把本插件的开发依赖指向本机 DSH 安装。
 *
 * 插件源码 import 的 `@deepseek-ai/*` 与 `cordis` 类型来自 DSH 运行时
 * （npm 发行版：npx 缓存 / ~/.dsh/profiles/node_modules），不在公开 npm 上
 * 独立发布。本脚本：
 *
 * 1. 定位 DSH 依赖根（--checkout 显式指定 > `dsh` 在 PATH 时从 bin 反推
 *    npx 缓存 > ~/.dsh/profiles/node_modules > 常见位置），校验
 *    node_modules/@deepseek-ai/cordis 存在；
 * 2. 重建本插件 node_modules 下的依赖链接（@deepseek-ai/*、@types 等；
 *    Windows 用 junction，POSIX 用 symlink）；
 * 3. 把 tsconfig.json 的 compilerOptions.paths 前缀重写为 DSH 根路径。
 *
 * 用法：node scripts/setup-dsh-deps.mjs [--checkout <path>]
 * 之后即可 `npx tsc -p tsconfig.json` / `npx tsdown ...`（typescript 与
 * tsdown 作为 devDependencies 安装在本插件）。
 *
 * 只做链接与路径改写，不写任何业务文件；构建产物 lib/ 由 build 步骤生成。
 */
import { existsSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const IS_WIN = process.platform === 'win32'

/** 依赖名 → DSH 根下相对路径。 */
const LINKS = {
  'node_modules/@deepseek-ai/cordis': 'node_modules/@deepseek-ai/cordis',
  'node_modules/@deepseek-ai/dsh-tools': 'node_modules/@deepseek-ai/dsh-tools',
  'node_modules/@deepseek-ai/dsh-fs': 'node_modules/@deepseek-ai/dsh-fs',
  'node_modules/@deepseek-ai/dsh-session': 'node_modules/@deepseek-ai/dsh-session',
  'node_modules/@deepseek-ai/dsh-host-webserver': 'node_modules/@deepseek-ai/dsh-host-webserver',
  'node_modules/@types': 'node_modules/@types',
}

/** 候选 DSH 安装根（目录内含 node_modules/@deepseek-ai/cordis）。 */
function candidates() {
  const list = []
  try {
    // npx 缓存布局：<root>/node_modules/.bin/dsh.ps1；源码检出布局：<root>/bin/dsh
    const which = execFileSync('where', ['dsh.ps1'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0]
    if (which) {
      let p = dirname(which)
      for (let up = 0; up < 3; up++) {
        p = dirname(p)
        list.push(p)
      }
    }
  } catch {
    // dsh 不在 PATH
  }
  list.push(join(process.env.HOME ?? '', '.dsh', 'profiles'))
  list.push(join(process.env.USERPROFILE ?? '', '.dsh', 'profiles'))
  return list
}

function fail(message) {
  console.error(`setup-dsh-deps: ${message}`)
  process.exit(1)
}

function resolveRoot(explicit) {
  const check = (root) => {
    if (existsSync(join(root, 'node_modules', '@deepseek-ai', 'cordis', 'package.json'))) return root
    return undefined
  }
  if (explicit !== undefined) {
    const hit = check(resolve(explicit))
    if (hit) return hit
    fail(`--checkout ${explicit} 不是有效的 DSH 依赖根（缺 node_modules/@deepseek-ai/cordis）`)
  }
  for (const candidate of candidates()) {
    const hit = check(candidate)
    if (hit) return hit
  }
  fail('无法定位 DSH 依赖根：dsh 不在 PATH 且常见位置不存在。用 --checkout <path> 显式指定（需含 node_modules/@deepseek-ai/cordis）。')
}

/** 重建一个链接（先删旧链接；真实目录则跳过不动）。 */
function relink(target, source) {
  let current
  try {
    current = readlinkSync(target)
  } catch (error) {
    if (error.code !== 'ENOENT') return // 真实目录或非链接：不动
  }
  if (current !== undefined) {
    if (resolve(current) === resolve(source)) return
    unlinkSync(target)
  }
  mkdirSync(dirname(target), { recursive: true })
  symlinkSync(source, target, IS_WIN ? 'junction' : 'dir')
}

const argCheckout = process.argv.indexOf('--checkout')
const explicit = argCheckout >= 0 ? process.argv[argCheckout + 1] : undefined

const root = resolveRoot(explicit)
console.log(`setup-dsh-deps: DSH 依赖根 = ${root}`)

// 1. 依赖链接
let linked = 0
for (const [target, rel] of Object.entries(LINKS)) {
  const source = join(root, rel)
  if (!existsSync(source)) {
    console.warn(`  skip ${target}: DSH 根缺少 ${rel}`)
    continue
  }
  relink(join(ROOT, target), source)
  linked++
}
console.log(`setup-dsh-deps: ${linked} 个依赖链接已就位`)

// 2. tsconfig paths 重写：把任意绝对前缀（占位符/他机路径/本机路径）统一规范化为
//    <root>/node_modules/<suffix>。以最后一个 /node_modules/ 为界截断，幂等。
const tsconfigPath = join(ROOT, 'tsconfig.json')
const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'))
const paths = tsconfig.compilerOptions?.paths
if (paths !== undefined) {
  const marker = '/node_modules/'
  let changed = 0
  for (const [name, targets] of Object.entries(paths)) {
    paths[name] = targets.map((t) => {
      const norm = t.replace(/\\/g, '/')
      const idx = norm.lastIndexOf(marker)
      if (idx < 0) return t
      const suffix = norm.slice(idx + marker.length)
      const joined = join(root, 'node_modules', ...suffix.split('/'))
      if (joined !== t) changed++
      return joined
    })
  }
  if (changed > 0) {
    writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`)
    console.log(`setup-dsh-deps: tsconfig.json paths 已重写 ${changed} 处 → ${root}`)
  } else {
    console.log('setup-dsh-deps: tsconfig.json paths 无需改动')
  }
}

console.log('setup-dsh-deps: 完成。构建：npx tsc -p tsconfig.json && npx tsdown -c tsdown.config.ts --tsconfig tsconfig.down.json')
