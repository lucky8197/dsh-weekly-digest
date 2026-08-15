/**
 * 审计编排：weekly_digest 工具核心逻辑。
 * 数据源：git 提交（只读白名单命令）+ 会话目录 + 每日记忆（只读 fs）。
 */
import { runGit } from './git.ts'
import {
  buildDigest, byAuthor, defaultMemoriesRoot, defaultSessionsRoot, parseLog, perDay,
  scanMemories, scanSessions,
} from './scan.ts'
import type { Config, WeeklyDigestReport } from './types.ts'

export { buildDigest } from './scan.ts'

export interface AuditOptions {
  cwd: string
  signal: AbortSignal
  config: Config
}

/** 执行周报聚合。 */
export async function runAudit(options: AuditOptions): Promise<WeeklyDigestReport> {
  const { config } = options
  const now = new Date()
  const from = new Date(now.getTime() - config.days * 86_400_000)

  const gitSection: WeeklyDigestReport['git'] = { isRepo: false, totalCommits: 0, perDay: [], authors: [], recent: [] }
  const inside = await runGit(options.cwd, ['rev-parse', '--is-inside-work-tree'], options.signal)
  if (inside.code === 0 && inside.stdout.trim() === 'true') {
    const top = await runGit(options.cwd, ['rev-parse', '--show-toplevel'], options.signal)
    const repoRoot = top.stdout.trim() || options.cwd
    const logRes = await runGit(repoRoot, ['log', '--since', `${config.days} days ago`, '--date=short', '--format=%H%x1f%an%x1f%ad%x1f%s'], options.signal)
    if (logRes.code === 0) {
      const commits = parseLog(logRes.stdout)
      gitSection.isRepo = true
      gitSection.totalCommits = commits.length
      gitSection.perDay = perDay(commits)
      gitSection.authors = byAuthor(commits)
      gitSection.recent = commits.slice(0, config.maxEntries)
    }
  }

  const sessionsRoot = config.sessionsRoot ?? defaultSessionsRoot()
  const memoriesRoot = config.memoriesRoot ?? defaultMemoriesRoot()
  const [sessions, memories] = await Promise.all([
    scanSessions(sessionsRoot, config.days, options.signal),
    scanMemories(memoriesRoot, config.days, config.maxEntries, config.maxReadBytes, options.signal),
  ])

  const report: WeeklyDigestReport = {
    tool: 'weekly_digest',
    version: 1,
    cwd: options.cwd,
    days: config.days,
    period: { from: fmt(from), to: fmt(now) },
    git: gitSection,
    sessions,
    memories,
    digest: '',
    stats: { commits: gitSection.totalCommits, sessions: sessions.totalSessions, memoryEntries: memories.totalEntries },
  }
  report.digest = buildDigest(report, config.maxEntries)
  return report
}

function fmt(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
