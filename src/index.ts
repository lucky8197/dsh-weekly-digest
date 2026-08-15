/**
 * Weekly Digest — DSH 周报生成器插件（host 半区）。
 *
 * 注册 `weekly_digest` 模型工具：聚合最近 N 天的 git 提交、DSH 会话活动与
 * 每日记忆，生成 Markdown 周报。全程只读。
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type JsonValue } from '@deepseek-ai/dsh-tools'
import { runAudit, type AuditOptions } from './audit.ts'
import { DEFAULT_CONFIG, type Config, type WeeklyDigestReport } from './types.ts'

export { buildDigest } from './scan.ts'
export type { WeeklyDigestReport } from './types.ts'

export const name = 'weekly-digest'
export const inject = [] as const

/** 插件配置（cordis 配置节 weekly-digest: {...}）。 */
export interface WeeklyDigestConfig {
  /** 聚合窗口（天）。默认 7。 */
  days?: number
  /** 最近提交/记忆条目最大展示数。默认 10。 */
  maxEntries?: number
  /** DSH 会话目录（默认 ~/.dsh/sessions）。 */
  sessionsRoot?: string
  /** 每日记忆目录（默认 ~/.dsh/memories/dsh-memory-evolve）。 */
  memoriesRoot?: string
  /** 审计默认目录。 */
  defaultCwd?: string
}

export function apply(ctx: Context, config: WeeklyDigestConfig = {}): void {
  const effective: Config = {
    ...DEFAULT_CONFIG,
    ...(config.days !== undefined ? { days: config.days } : {}),
    ...(config.maxEntries !== undefined ? { maxEntries: config.maxEntries } : {}),
    ...(config.sessionsRoot !== undefined ? { sessionsRoot: config.sessionsRoot } : {}),
    ...(config.memoriesRoot !== undefined ? { memoriesRoot: config.memoriesRoot } : {}),
  }

  ctx.tools.register(defineTool({
    name: 'weekly_digest',
    description:
      '周报生成器：聚合最近 N 天（默认 7 天）的 git 提交（每天计数/贡献者/最近提交）、'
      + 'DSH 会话活动（按项目统计会话数与体积）与每日记忆条目，生成 Markdown 周报。'
      + '全程只读：只执行只读 git 命令与文件统计。',
    parameters: {
      cwd: { type: 'string', description: '仓库目录（git 提交统计用）；默认当前会话工作目录' },
      days: { type: 'number', description: '聚合窗口（天），默认 7' },
      maxEntries: { type: 'number', description: '最近提交/记忆条目最大展示数，默认 10' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value: Record<string, JsonValue>) => {
        const report = value as unknown as WeeklyDigestReport
        return [{ type: 'text', text: report.digest }]
      },
    },
    async execute(args, exec): Promise<Record<string, JsonValue>> {
      const agentCwd = (exec.agent as { session?: { header?: { cwd?: string } } } | undefined)
        ?.session?.header?.cwd
      const cwd = args.cwd ?? agentCwd ?? config.defaultCwd ?? process.cwd()
      const merged: Config = { ...effective }
      if (args.days !== undefined) merged.days = args.days
      if (args.maxEntries !== undefined) merged.maxEntries = args.maxEntries
      const options: AuditOptions = { cwd, signal: exec.signal, config: merged }
      const report = await runAudit(options)
      return report as unknown as Record<string, JsonValue>
    },
  }))
}
