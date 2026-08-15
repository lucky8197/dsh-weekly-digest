# dsh-weekly-digest（周报生成器）

> **Weekly Digest Generator for DeepSeek Harness.**
> Aggregates the last N days (default 7) of git commits, DSH session activity and
> daily memory entries into a Markdown weekly report — commits per day, top
> contributors, recent commit list, per-project session counts, and daily memory
> highlights. Read-only end to end.
> Install with: `dsh plugin --profile web add "github:lucky8197/dsh-weekly-digest#main"`.

每周五下午写周报是最烦的事：翻 git log、数会话、回忆这周干了什么。`dsh-weekly-digest`
把三份现成数据源自动聚合：

1. **git 提交**（当前仓库）：每天提交数、贡献者排行、最近提交明细；
2. **DSH 会话活动**（`~/.dsh/sessions`）：按项目统计窗口内会话数与体积；
3. **每日记忆**（`~/.dsh/memories/daily`）：窗口内每天的记忆条目与摘录。

输出一份可直接粘贴的 Markdown 周报。**全程只读**，不写任何文件。

## 快速安装

```bash
dsh plugin --profile web add "github:lucky8197/dsh-weekly-digest#main"
```

## 工具用法

```
weekly_digest
  参数：
    cwd?: string          仓库目录（git 提交统计用；默认当前会话工作目录）
    days?: number         聚合窗口（天，默认 7）
    maxEntries?: number   最近提交/记忆条目最大展示数（默认 10）
  输出：canonical JSON 报告（主输出渲染为 Markdown 周报）
```

### 周报示例（节选）

```markdown
# 周报（2026-08-08 ~ 2026-08-15）

## Git 提交（106 个）
- 每天：2026-08-11 ×5、2026-08-12 ×23、2026-08-13 ×49、2026-08-14 ×25、2026-08-15 ×4
- 贡献者：dev（69）、luoliang（37）

最近提交：
- `97e47b73` 2026-08-15 luoliang：test: 测试覆盖审查补测第3批（实现 v1.43 / 技术 v1.39）

## 会话活动（32 个 / 0 B）
- game01：24 个会话

## 每日记忆（26 条）
### 2026-08-15（15 条）
- [09:54] [git master] [game01] 三篇文档结构修订完成并提交（fe9f119）…
```

### canonical JSON

```jsonc
{
  "tool": "weekly_digest", "version": 1, "cwd": "/path", "days": 7,
  "period": { "from": "2026-08-08", "to": "2026-08-15" },
  "git": { "isRepo": true, "totalCommits": 106, "perDay": [...], "authors": [...], "recent": [...] },
  "sessions": { "root": "...", "totalSessions": 32, "totalBytes": 0, "projects": [...] },
  "memories": { "root": "...", "days": [...], "totalEntries": 26 },
  "digest": "# 周报（…）\n…",
  "stats": { "commits": 106, "sessions": 32, "memoryEntries": 26 }
}
```

## 配置（cordis 配置节）

```yaml
- insert:
    - id: weekly-digest
      name: 'dsh-weekly-digest'
      config:
        days: 7                  # 聚合窗口（天）
        maxEntries: 10           # 最近提交/记忆条目最大展示数
        sessionsRoot: "~/.dsh/sessions"          # 会话目录（默认值）
        memoriesRoot: "~/.dsh/memories/daily"    # 每日记忆目录（默认值）
```

## 安全边界（硬性要求）

- **只执行白名单只读 git 命令**（`git log --since` / `rev-parse`，见 `src/git.ts`），
  拒绝 checkout/push/reset 等一切写操作；
- 会话/记忆目录仅 **只读 stat/list/readText**，单文件 > 256 KB 跳过；
- **报告不含完整会话/记忆内容**：只含统计与 ≤160 字符摘录；
- 不写、不删、不执行（有测试断言）。

## 数据源说明

| 数据源 | 位置 | 说明 |
| --- | --- | --- |
| git 提交 | `cwd` 所在仓库 | `git log --since="N days ago"`，白名单只读 |
| 会话活动 | `~/.dsh/sessions` | 按工作目录分组，统计窗口内 mtime 的会话文件 |
| 每日记忆 | `~/.dsh/memories/daily` | `YYYY-MM-DD.md`，按文件名日期过滤窗口，摘录 `[HH:MM]` 条目 |

## 工程结构

```
dsh-weekly-digest/
├── package.json          # name=dsh-weekly-digest, main=./lib/index.js, dsh.bundle.patch
├── cordis.patch.yml      # - insert: [{ id: weekly-digest, name: 'dsh-weekly-digest' }]
├── scripts/              # setup-dsh-deps / build.sh / build-win.mjs（纯 tsc 构建）
├── src/
│   ├── index.ts          # apply(ctx)：注册 weekly_digest 工具 + 配置读取
│   ├── audit.ts          # 编排：git + 会话 + 记忆三源聚合
│   ├── git.ts            # 白名单执行器（只读 log/rev-parse）
│   ├── scan.ts           # git 输出解析 / 会话与记忆扫描 / 周报渲染
│   └── types.ts          # canonical 类型 + 配置
└── tests/                # node --test（16 用例，真实 git 仓库端到端）
```

## 开发 / 测试 / 构建

```bash
npm install && npm run setup
npm test                # node --test（16 用例）
npm run build:win       # Windows 构建；POSIX 用 npm run build
```

构建产物 `lib/` 入库提交（GitHub 源安装免构建）。

## License

BSD-3-Clause。见 [LICENSE](./LICENSE)。
