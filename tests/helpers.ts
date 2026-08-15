/**
 * 测试辅助：真实 git 临时仓库 + 假会话/记忆目录。
 */
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DEFAULT_CONFIG, type Config } from '../src/types.ts'

/** 初始化 git 仓库并提交初始文件。 */
export async function makeGitRepo(
  files: Record<string, string>,
  opts: { branch?: string; commitMsg?: string } = {},
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'weekly-digest-git-'))
  git(dir, ['init', '-b', opts.branch ?? 'main'])
  git(dir, ['config', 'user.name', 'Test Author'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, ...rel.split('/'))
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, content)
  }
  git(dir, ['add', '.'])
  git(dir, ['commit', '-m', opts.commitMsg ?? 'init'])
  return dir
}

export function git(cwd: string, args: string[], env?: Record<string, string>): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } }).trim()
}

/** 构造假会话目录：project dirs 下放 session 文件，mtime 可控制。 */
export async function makeSessionsDir(base: string, projects: Record<string, { recent: number; old: number }>): Promise<void> {
  const now = Date.now()
  for (const [project, counts] of Object.entries(projects)) {
    const dir = join(base, `--${project}--`)
    await mkdir(dir, { recursive: true })
    for (let i = 0; i < counts.recent; i++) {
      const file = join(dir, `session-recent-${i}.zstd`)
      await writeFile(file, 'x'.repeat(100))
      await utimes(file, now / 1000, now / 1000)
    }
    for (let i = 0; i < counts.old; i++) {
      const file = join(dir, `session-old-${i}.zstd`)
      await writeFile(file, 'x'.repeat(100))
      const old = (now - 30 * 86_400_000) / 1000
      await utimes(file, old, old)
    }
  }
}

/** 构造假每日记忆目录。 */
export async function makeMemoriesDir(base: string, days: Record<string, string[]>): Promise<void> {
  await mkdir(base, { recursive: true })
  for (const [date, entries] of Object.entries(days)) {
    const content = entries.map((e) => `[09:00] ${e}`).join('\n') + '\n'
    await writeFile(join(base, `${date}.md`), content)
  }
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return { ...DEFAULT_CONFIG, ...overrides }
}
