/**
 * dsh-weekly-digest 端到端测试（真实 git 仓库 + 假会话/记忆目录）。
 */
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { runAudit } from '../src/audit.ts'
import { git, makeGitRepo, makeMemoriesDir, makeSessionsDir, testConfig } from './helpers.ts'

function signal(): AbortSignal {
  return new AbortController().signal
}

test('e2e: 完整周报（git 提交 + 会话 + 记忆）', async () => {
  const repo = await makeGitRepo({ 'src/a.ts': 'export const a = 1\n' })
  git(repo, ['commit', '--allow-empty', '-m', 'feat: 新增功能', '--date', '2026-08-14T10:00:00'], { GIT_COMMITTER_DATE: '2026-08-14T10:00:00' })
  const base = await mkdtemp(join(tmpdir(), 'weekly-digest-data-'))
  const sessionsRoot = join(base, 'sessions')
  const memoriesRoot = join(base, 'memories')
  await makeSessionsDir(sessionsRoot, { 'game01': { recent: 3, old: 2 }, 'dshPlugins': { recent: 1, old: 1 } })
  await makeMemoriesDir(memoriesRoot, {
    '2026-08-14': ['完成测试覆盖', '修复连接问题'],
    '2026-08-15': ['发布插件'],
  })

  const report = await runAudit({
    cwd: repo,
    signal: signal(),
    config: testConfig({ sessionsRoot, memoriesRoot, days: 7 }),
  })
  assert.equal(report.tool, 'weekly_digest')
  assert.equal(report.git.isRepo, true)
  assert.ok(report.git.totalCommits >= 2)
  assert.ok(report.git.authors.length >= 1)
  assert.equal(report.sessions.totalSessions, 4) // 3 + 1（old 不计）
  assert.equal(report.sessions.projects.length, 2)
  assert.equal(report.memories.totalEntries, 3)
  assert.equal(report.stats.commits, report.git.totalCommits)
  assert.ok(report.digest.includes('## Git 提交'))
  assert.ok(report.digest.includes('game01：3 个会话'))
  assert.ok(report.digest.includes('## 每日记忆（3 条）'))
})

test('e2e: 非 git 目录 → git 分节为空但仍出周报', async () => {
  const base = await mkdtemp(join(tmpdir(), 'weekly-digest-nogit-'))
  const sessionsRoot = join(base, 'sessions')
  const memoriesRoot = join(base, 'memories')
  await makeSessionsDir(sessionsRoot, { 'projA': { recent: 2, old: 0 } })
  await makeMemoriesDir(memoriesRoot, { '2026-08-15': ['记录'] })
  const report = await runAudit({
    cwd: base,
    signal: signal(),
    config: testConfig({ sessionsRoot, memoriesRoot, days: 7 }),
  })
  assert.equal(report.git.isRepo, false)
  assert.equal(report.git.totalCommits, 0)
  assert.equal(report.sessions.totalSessions, 2)
  assert.equal(report.memories.totalEntries, 1)
  assert.ok(report.digest.includes('非 git 仓库或无提交'))
})

test('e2e: days 窗口过滤会话与记忆', async () => {
  const repo = await makeGitRepo({ 'a.ts': 'x\n' })
  const base = await mkdtemp(join(tmpdir(), 'weekly-digest-window-'))
  const sessionsRoot = join(base, 'sessions')
  const memoriesRoot = join(base, 'memories')
  await makeSessionsDir(sessionsRoot, { 'projA': { recent: 2, old: 2 } })
  await makeMemoriesDir(memoriesRoot, {
    '2026-08-14': ['最近'],
    '2020-01-01': ['远古'],
  })
  const report = await runAudit({
    cwd: repo,
    signal: signal(),
    config: testConfig({ sessionsRoot, memoriesRoot, days: 7 }),
  })
  assert.equal(report.sessions.totalSessions, 2) // old 被窗口过滤
  assert.equal(report.memories.days.length, 1)   // 2020 被窗口过滤
  assert.equal(report.memories.days[0]?.date, '2026-08-14')
})

test('e2e: maxEntries 限制展示数', async () => {
  const repo = await makeGitRepo({ 'a.ts': 'x\n' })
  for (let i = 0; i < 5; i++) {
    git(repo, ['commit', '--allow-empty', '-m', `commit ${i}`])
  }
  const base = await mkdtemp(join(tmpdir(), 'weekly-digest-entries-'))
  const sessionsRoot = join(base, 'sessions')
  const memoriesRoot = join(base, 'memories')
  await makeSessionsDir(sessionsRoot, { 'p': { recent: 1, old: 0 } })
  await makeMemoriesDir(memoriesRoot, { '2026-08-15': ['a', 'b', 'c'] })
  const report = await runAudit({
    cwd: repo,
    signal: signal(),
    config: testConfig({ sessionsRoot, memoriesRoot, days: 7, maxEntries: 2 }),
  })
  assert.ok(report.git.recent.length <= 2)
  assert.ok(report.memories.days[0]?.preview.length <= 2)
})

test('e2e: 只读——聚合不改动任何数据', async () => {
  const repo = await makeGitRepo({ 'a.ts': 'x\n' })
  const base = await mkdtemp(join(tmpdir(), 'weekly-digest-ro-'))
  const sessionsRoot = join(base, 'sessions')
  const memoriesRoot = join(base, 'memories')
  await makeSessionsDir(sessionsRoot, { 'p': { recent: 1, old: 0 } })
  await makeMemoriesDir(memoriesRoot, { '2026-08-15': ['记录'] })
  const before = await git(repo, ['rev-list', '--count', 'HEAD'])
  await runAudit({ cwd: repo, signal: signal(), config: testConfig({ sessionsRoot, memoriesRoot, days: 7 }) })
  const after = await git(repo, ['rev-list', '--count', 'HEAD'])
  assert.equal(before, after)
  const { readdir } = await import('node:fs/promises')
  const memFiles = await readdir(memoriesRoot)
  assert.deepEqual(memFiles.sort(), ['2026-08-15.md'])
})

test('e2e: 默认目录缺失时优雅降级', async () => {
  const repo = await makeGitRepo({ 'a.ts': 'x\n' })
  const base = await mkdtemp(join(tmpdir(), 'weekly-digest-missing-'))
  const report = await runAudit({
    cwd: repo,
    signal: signal(),
    config: testConfig({ sessionsRoot: join(base, 'nope-sessions'), memoriesRoot: join(base, 'nope-mem') }),
  })
  assert.equal(report.sessions.totalSessions, 0)
  assert.equal(report.memories.totalEntries, 0)
  assert.ok(report.digest.includes('窗口内无会话活动'))
})

test('e2e: 报告形状完整', async () => {
  const repo = await makeGitRepo({ 'a.ts': 'x\n' })
  const base = await mkdtemp(join(tmpdir(), 'weekly-digest-shape-'))
  const report = await runAudit({
    cwd: repo,
    signal: signal(),
    config: testConfig({ sessionsRoot: join(base, 's'), memoriesRoot: join(base, 'm'), days: 14 }),
  })
  assert.equal(report.version, 1)
  assert.ok(report.period.from < report.period.to)
  assert.ok(report.digest.length > 0)
  assert.equal(typeof report.stats.commits, 'number')
})
