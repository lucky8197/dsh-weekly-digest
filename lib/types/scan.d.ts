import type { WeeklyDigestReport } from './types.ts';
export interface CommitInfo {
    hash: string;
    author: string;
    date: string;
    subject: string;
}
/** 解析 git log 输出（%H%x1f%an%x1f%ad%x1f%s 每行一条）。 */
export declare function parseLog(stdout: string): CommitInfo[];
/** 按日期聚合提交数。 */
export declare function perDay(commits: CommitInfo[]): {
    date: string;
    count: number;
}[];
/** 按作者聚合提交数（降序）。 */
export declare function byAuthor(commits: CommitInfo[]): {
    name: string;
    count: number;
}[];
/** 项目标签解码（会话目录名 "--C-Users-...-game01--" → 可读标签）。 */
export declare function decodeProjectLabel(dirName: string): string;
export interface SessionStats {
    root: string;
    totalSessions: number;
    totalBytes: number;
    projects: {
        label: string;
        sessions: number;
        bytes: number;
    }[];
}
/** 扫描会话目录：最近 days 天内修改的会话文件（mtime 窗口，只读）。 */
export declare function scanSessions(sessionsRoot: string, days: number, signal?: AbortSignal): Promise<SessionStats>;
export interface MemoryDay {
    date: string;
    entries: number;
    preview: string[];
}
export interface MemoryStats {
    root: string;
    days: MemoryDay[];
    totalEntries: number;
}
/** 扫描每日记忆目录：窗口内的 YYYY-MM-DD.md 文件。 */
export declare function scanMemories(memoriesRoot: string, days: number, maxEntries: number, maxReadBytes: number, signal?: AbortSignal): Promise<MemoryStats>;
/** 生成 Markdown 周报。 */
export declare function buildDigest(report: WeeklyDigestReport, maxEntries: number): string;
export declare function formatBytes(bytes: number): string;
/** 默认会话/记忆根目录。 */
export declare function defaultSessionsRoot(): string;
/** 默认每日记忆目录（memory-evolve 插件实际落盘位置）。 */
export declare function defaultMemoriesRoot(): string;
