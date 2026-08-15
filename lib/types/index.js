import { defineTool } from '@deepseek-ai/dsh-tools';
import { runAudit } from "./audit.js";
import { DEFAULT_CONFIG } from "./types.js";
export { buildDigest } from "./scan.js";
export const name = 'weekly-digest';
export const inject = [];
export function apply(ctx, config = {}) {
    const effective = {
        ...DEFAULT_CONFIG,
        ...(config.days !== undefined ? { days: config.days } : {}),
        ...(config.maxEntries !== undefined ? { maxEntries: config.maxEntries } : {}),
        ...(config.sessionsRoot !== undefined ? { sessionsRoot: config.sessionsRoot } : {}),
        ...(config.memoriesRoot !== undefined ? { memoriesRoot: config.memoriesRoot } : {}),
    };
    ctx.tools.register(defineTool({
        name: 'weekly_digest',
        description: '周报生成器：聚合最近 N 天（默认 7 天）的 git 提交（每天计数/贡献者/最近提交）、'
            + 'DSH 会话活动（按项目统计会话数与体积）与每日记忆条目，生成 Markdown 周报。'
            + '全程只读：只执行只读 git 命令与文件统计。',
        parameters: {
            cwd: { type: 'string', description: '仓库目录（git 提交统计用）；默认当前会话工作目录' },
            days: { type: 'number', description: '聚合窗口（天），默认 7' },
            maxEntries: { type: 'number', description: '最近提交/记忆条目最大展示数，默认 10' },
        },
        output: {
            schema: { type: 'object', additionalProperties: true },
            render: (_args, value) => {
                const report = value;
                return [{ type: 'text', text: report.digest }];
            },
        },
        async execute(args, exec) {
            const agentCwd = exec.agent
                ?.session?.header?.cwd;
            const cwd = args.cwd ?? agentCwd ?? config.defaultCwd ?? process.cwd();
            const merged = { ...effective };
            if (args.days !== undefined)
                merged.days = args.days;
            if (args.maxEntries !== undefined)
                merged.maxEntries = args.maxEntries;
            const options = { cwd, signal: exec.signal, config: merged };
            const report = await runAudit(options);
            return report;
        },
    }));
}
