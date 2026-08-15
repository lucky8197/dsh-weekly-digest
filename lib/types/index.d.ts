/**
 * Weekly Digest — DSH 周报生成器插件（host 半区）。
 *
 * 注册 `weekly_digest` 模型工具：聚合最近 N 天的 git 提交、DSH 会话活动与
 * 每日记忆，生成 Markdown 周报。全程只读。
 */
import type { Context } from '@deepseek-ai/cordis';
export { buildDigest } from './scan.ts';
export type { WeeklyDigestReport } from './types.ts';
export declare const name = "weekly-digest";
export declare const inject: readonly [];
/** 插件配置（cordis 配置节 weekly-digest: {...}）。 */
export interface WeeklyDigestConfig {
    /** 聚合窗口（天）。默认 7。 */
    days?: number;
    /** 最近提交/记忆条目最大展示数。默认 10。 */
    maxEntries?: number;
    /** DSH 会话目录（默认 ~/.dsh/sessions）。 */
    sessionsRoot?: string;
    /** 每日记忆目录（默认 ~/.dsh/memories/dsh-memory-evolve）。 */
    memoriesRoot?: string;
    /** 审计默认目录。 */
    defaultCwd?: string;
}
export declare function apply(ctx: Context, config?: WeeklyDigestConfig): void;
