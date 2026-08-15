/**
 * weekly-digest 共享类型。
 *
 * 安全边界：只执行白名单只读 git 命令 + 只读 fs 访问（stat/list/readText），
 * 不写不删不执行；报告不含完整会话/记忆内容。
 */

export interface WeeklyDigestReport {
  tool: 'weekly_digest'
  version: 1
  cwd: string
  days: number
  period: { from: string; to: string }
  git: {
    isRepo: boolean
    totalCommits: number
    perDay: { date: string; count: number }[]
    authors: { name: string; count: number }[]
    recent: { hash: string; author: string; date: string; subject: string }[]
  }
  sessions: {
    root: string
    totalSessions: number
    totalBytes: number
    projects: { label: string; sessions: number; bytes: number }[]
  }
  memories: {
    root: string
    days: { date: string; entries: number; preview: string[] }[]
    totalEntries: number
  }
  /** 预渲染的 Markdown 周报（工具主输出）。 */
  digest: string
  stats: { commits: number; sessions: number; memoryEntries: number }
}

export interface Config {
  /** 聚合窗口（天）。默认 7。 */
  days: number
  /** 最近提交/记忆条目最大展示数。默认 10。 */
  maxEntries: number
  /** DSH 会话目录（默认 ~/.dsh/sessions）。 */
  sessionsRoot?: string
  /** 每日记忆目录（默认 ~/.dsh/memories/dsh-memory-evolve）。 */
  memoriesRoot?: string
  /** 单文件读取上限（字节）。默认 256 KB。 */
  maxReadBytes: number
}

export const DEFAULT_CONFIG: Config = {
  days: 7,
  maxEntries: 10,
  maxReadBytes: 256 * 1024,
}
