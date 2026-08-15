/**
 * git 白名单 + 解析函数 + 渲染单元测试。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateGitArgs } from '../src/git.ts'
import { buildDigest, byAuthor, decodeProjectLabel, perDay, parseLog } from '../src/scan.ts'
import type { WeeklyDigestReport } from '../src/types.ts'

/* ---------- 白名单 ---------- */

test('git: 放行只读 log/rev-parse', () => {
  assert.equal(validateGitArgs(['rev-parse', '--is-inside-work-tree']), true)
  assert.equal(validateGitArgs(['rev-parse', '--show-toplevel']), true)
  assert.equal(validateGitArgs(['log', '-1', '--format=%H']), true)
  assert.equal(validateGitArgs(['log', '--since', '7 days ago', '--date=short', '--format=%H%x1f%an%x1f%ad%x1f%s']), true)
})

test('git: 拒绝破坏性命令与畸形参数', () => {
  assert.equal(validateGitArgs(['checkout', '-b', 'x']), false)
  assert.equal(validateGitArgs(['push', 'origin', 'main']), false)
  assert.equal(validateGitArgs(['reset', '--hard']), false)
  assert.equal(validateGitArgs(['log', '--since', '0.5 days ago', '--date=short', '--format=%H%x1f%an%x1f%ad%x1f%s']), false)
  assert.equal(validateGitArgs(['log', '--since', '7 days ago']), false)
  assert.equal(validateGitArgs(['log']), false)
})

/* ---------- 解析 ---------- */

test('scan: parseLog 解析 %x1f 分隔提交', () => {
  const commits = parseLog('abc123\u001fAlice\u001f2026-08-15\u001ffeat: 修复问题\n')
  assert.equal(commits.length, 1)
  assert.equal(commits[0]?.hash, 'abc123')
  assert.equal(commits[0]?.author, 'Alice')
  assert.equal(commits[0]?.date, '2026-08-15')
  assert.equal(commits[0]?.subject, 'feat: 修复问题')
})

test('scan: parseLog 空输出', () => {
  assert.deepEqual(parseLog(''), [])
})

test('scan: perDay 按日期聚合', () => {
  const commits = [
    { hash: 'a', author: 'A', date: '2026-08-14', subject: 'x' },
    { hash: 'b', author: 'B', date: '2026-08-14', subject: 'y' },
    { hash: 'c', author: 'A', date: '2026-08-15', subject: 'z' },
  ]
  assert.deepEqual(perDay(commits), [
    { date: '2026-08-14', count: 2 },
    { date: '2026-08-15', count: 1 },
  ])
})

test('scan: byAuthor 聚合并降序', () => {
  const commits = [
    { hash: 'a', author: 'A', date: 'd', subject: '1' },
    { hash: 'b', author: 'B', date: 'd', subject: '2' },
    { hash: 'c', author: 'A', date: 'd', subject: '3' },
  ]
  assert.deepEqual(byAuthor(commits), [
    { name: 'A', count: 2 },
    { name: 'B', count: 1 },
  ])
})

test('scan: decodeProjectLabel 解码会话目录名', () => {
  assert.equal(decodeProjectLabel('--game01--'), 'game01')
  assert.equal(decodeProjectLabel('--C-Users-Lucky-Nutstore-.nutstore_MTI0NTA1MjE2NUBxcS5jb20~003D-game01--'), 'game01')
  assert.equal(decodeProjectLabel('--D-Desktop-dshPlugins--'), 'dshPlugins')
})

/* ---------- 周报渲染 ---------- */

function reportOf(overrides: Partial<WeeklyDigestReport> = {}): WeeklyDigestReport {
  return {
    tool: 'weekly_digest',
    version: 1,
    cwd: '/repo',
    days: 7,
    period: { from: '2026-08-09', to: '2026-08-15' },
    git: {
      isRepo: true,
      totalCommits: 3,
      perDay: [{ date: '2026-08-14', count: 2 }, { date: '2026-08-15', count: 1 }],
      authors: [{ name: 'A', count: 2 }, { name: 'B', count: 1 }],
      recent: [
        { hash: 'abc1234567', author: 'A', date: '2026-08-15', subject: 'feat: 周报' },
        { hash: 'def1234567', author: 'B', date: '2026-08-14', subject: 'fix: bug' },
      ],
    },
    sessions: {
      root: '/sessions',
      totalSessions: 5,
      totalBytes: 500,
      projects: [{ label: 'game01', sessions: 3, bytes: 300 }, { label: 'dshPlugins', sessions: 2, bytes: 200 }],
    },
    memories: {
      root: '/mem',
      days: [{ date: '2026-08-14', entries: 2, preview: ['[09:00] 完成 A', '[10:00] 完成 B'] }],
      totalEntries: 2,
    },
    digest: '',
    stats: { commits: 3, sessions: 5, memoryEntries: 2 },
    ...overrides,
  }
}

test('digest: Markdown 周报分节完整', () => {
  const text = buildDigest(reportOf(), 10)
  assert.ok(text.includes('# 周报（2026-08-09 ~ 2026-08-15）'))
  assert.ok(text.includes('## Git 提交（3 个）'))
  assert.ok(text.includes('2026-08-14 ×2'))
  assert.ok(text.includes('贡献者：A（2）、B（1）'))
  assert.ok(text.includes('`abc12345` 2026-08-15 A：feat: 周报'))
  assert.ok(text.includes('## 会话活动（5 个 / 500 B）'))
  assert.ok(text.includes('game01：3 个会话'))
  assert.ok(text.includes('## 每日记忆（2 条）'))
  assert.ok(text.includes('完成 A'))
})

test('digest: 空数据源给出占位提示', () => {
  const empty = reportOf({
    git: { isRepo: false, totalCommits: 0, perDay: [], authors: [], recent: [] },
    sessions: { root: '/s', totalSessions: 0, totalBytes: 0, projects: [] },
    memories: { root: '/m', days: [], totalEntries: 0 },
    stats: { commits: 0, sessions: 0, memoryEntries: 0 },
  })
  const text = buildDigest(empty, 10)
  assert.ok(text.includes('非 git 仓库或无提交'))
  assert.ok(text.includes('窗口内无会话活动'))
  assert.ok(text.includes('窗口内无每日记忆'))
})
