/**
 * 数据源解析与周报渲染（纯函数 + 只读 fs 扫描）。
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
/** 解析 git log 输出（%H%x1f%an%x1f%ad%x1f%s 每行一条）。 */
export function parseLog(stdout) {
    const out = [];
    for (const line of stdout.split(/\r?\n/)) {
        if (line.trim() === '')
            continue;
        const [hash, author, date, subject, ...rest] = line.split('\u001f');
        if (hash === undefined)
            continue;
        out.push({
            hash,
            author: author ?? '',
            date: date ?? '',
            subject: [subject, ...rest].join('\u001f'),
        });
    }
    return out;
}
/** 按日期聚合提交数。 */
export function perDay(commits) {
    const map = new Map();
    for (const c of commits) {
        map.set(c.date, (map.get(c.date) ?? 0) + 1);
    }
    return [...map.entries()]
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
}
/** 按作者聚合提交数（降序）。 */
export function byAuthor(commits) {
    const map = new Map();
    for (const c of commits)
        map.set(c.author, (map.get(c.author) ?? 0) + 1);
    return [...map.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
}
/** 项目标签解码（会话目录名 "--C-Users-...-game01--" → 可读标签）。 */
export function decodeProjectLabel(dirName) {
    let label = dirName.replace(/^--+|--+$/g, '');
    label = label.replace(/~003D/gi, '=');
    // 取最后两段作为标签（如 "...game01" → "game01"；含用户名的路径取末段）
    const parts = label.split(/[-]+/).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : dirName;
}
/** 扫描会话目录：最近 days 天内修改的会话文件（mtime 窗口，只读）。 */
export async function scanSessions(sessionsRoot, days, signal) {
    const cutoff = Date.now() - days * 86_400_000;
    const projects = [];
    let totalSessions = 0;
    let totalBytes = 0;
    let entries;
    try {
        entries = await readdir(sessionsRoot, { withFileTypes: true });
    }
    catch {
        return { root: sessionsRoot, totalSessions: 0, totalBytes: 0, projects: [] };
    }
    for (const entry of entries) {
        if (signal?.aborted === true)
            break;
        if (!entry.isDirectory())
            continue;
        let files;
        try {
            files = await readdir(join(sessionsRoot, entry.name));
        }
        catch {
            continue;
        }
        let count = 0;
        let bytes = 0;
        for (const file of files) {
            try {
                const abs = join(sessionsRoot, entry.name, file);
                const st = await stat(abs);
                if (st.mtimeMs >= cutoff) {
                    count++;
                    bytes += st.size;
                }
            }
            catch {
                // 跳过不可读
            }
        }
        if (count > 0) {
            projects.push({ label: decodeProjectLabel(entry.name), sessions: count, bytes });
            totalSessions += count;
            totalBytes += bytes;
        }
    }
    projects.sort((a, b) => b.sessions - a.sessions);
    return { root: sessionsRoot, totalSessions, totalBytes, projects };
}
/** 扫描每日记忆目录：窗口内的 YYYY-MM-DD.md 文件。 */
export async function scanMemories(memoriesRoot, days, maxEntries, maxReadBytes, signal) {
    const cutoff = Date.now() - days * 86_400_000;
    const out = [];
    let totalEntries = 0;
    let files;
    try {
        files = await readdir(memoriesRoot);
    }
    catch {
        return { root: memoriesRoot, days: [], totalEntries: 0 };
    }
    for (const file of files) {
        if (signal?.aborted === true)
            break;
        const m = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(file);
        if (m === null)
            continue;
        const date = m[1];
        const dateMs = new Date(`${date}T00:00:00`).getTime();
        if (Number.isNaN(dateMs) || dateMs < cutoff)
            continue;
        try {
            const abs = join(memoriesRoot, file);
            const st = await stat(abs);
            if (st.size > maxReadBytes)
                continue;
            const content = await readFile(abs, 'utf8');
            // 条目：以 [HH:MM] 开头的行
            const lines = content.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^\[\d{2}:\d{2}\]/.test(l));
            if (lines.length === 0)
                continue;
            totalEntries += lines.length;
            out.push({ date, entries: lines.length, preview: lines.slice(0, maxEntries) });
        }
        catch {
            // 跳过不可读
        }
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return { root: memoriesRoot, days: out, totalEntries };
}
/* ------------------------------------------------------------------ */
/* 周报渲染                                                            */
/* ------------------------------------------------------------------ */
/** 生成 Markdown 周报。 */
export function buildDigest(report, maxEntries) {
    const lines = [];
    lines.push(`# 周报（${report.period.from} ~ ${report.period.to}）`);
    lines.push('');
    const g = report.git;
    lines.push(`## Git 提交（${g.totalCommits} 个）`);
    if (g.isRepo && g.totalCommits > 0) {
        lines.push(`- 每天：${g.perDay.map((d) => `${d.date} ×${d.count}`).join('、')}`);
        if (g.authors.length > 0) {
            lines.push(`- 贡献者：${g.authors.map((a) => `${a.name}（${a.count}）`).join('、')}`);
        }
        lines.push('');
        lines.push('最近提交：');
        for (const c of g.recent.slice(0, maxEntries)) {
            lines.push(`- \`${c.hash.slice(0, 8)}\` ${c.date} ${c.author}：${c.subject}`);
        }
    }
    else {
        lines.push('- 非 git 仓库或无提交。');
    }
    lines.push('');
    const s = report.sessions;
    lines.push(`## 会话活动（${s.totalSessions} 个 / ${formatBytes(s.totalBytes)}）`);
    if (s.projects.length > 0) {
        for (const p of s.projects) {
            lines.push(`- ${p.label}：${p.sessions} 个会话（${formatBytes(p.bytes)}）`);
        }
    }
    else {
        lines.push('- 窗口内无会话活动。');
    }
    lines.push('');
    const m = report.memories;
    lines.push(`## 每日记忆（${m.totalEntries} 条）`);
    if (m.days.length > 0) {
        for (const day of m.days) {
            lines.push(`### ${day.date}（${day.entries} 条）`);
            for (const preview of day.preview) {
                lines.push(`- ${preview.length > 160 ? `${preview.slice(0, 159)}…` : preview}`);
            }
            lines.push('');
        }
    }
    else {
        lines.push('- 窗口内无每日记忆。');
    }
    return lines.join('\n');
}
export function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
/** 默认会话/记忆根目录。 */
export function defaultSessionsRoot() {
    return join(homedir(), '.dsh', 'sessions');
}
/** 默认每日记忆目录（memory-evolve 插件实际落盘位置）。 */
export function defaultMemoriesRoot() {
    return join(homedir(), '.dsh', 'memories', 'daily');
}
