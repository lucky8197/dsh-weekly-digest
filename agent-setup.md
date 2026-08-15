# agent-setup.md — 供 Agent 安装与使用 dsh-weekly-digest

## 1. 安装

```bash
dsh plugin --profile web add "github:lucky8197/dsh-weekly-digest#main"
# 或本地 link 安装（等价验证）：dsh plugin --profile web add "link:<本地路径>"
```

安装后**重启 dsh web** 使插件生效。

## 2. 验证挂载

```bash
dsh --profile web --dump-config | grep weekly-digest
# 期望输出包含：id: weekly-digest
```

## 3. 调用工具

```
weekly_digest(cwd: "/path/to/repo")            # 默认 7 天周报
weekly_digest(cwd: "/path/to/repo", days: 14)  # 双周报
weekly_digest(cwd: "/path/to/repo", maxEntries: 5)
```

## 4. 解读报告

- `digest`：预渲染的 Markdown 周报（工具主输出），分 Git 提交 / 会话活动 / 每日记忆三节；
- `git`：每天提交数、贡献者排行、最近提交；
- `sessions`：按项目分组的会话统计（`~/.dsh/sessions`）；
- `memories`：按日分组的每日记忆与摘录（`~/.dsh/memories/daily`）。

## 5. Agent 工作流建议

1. 每周结束时跑一次 `weekly_digest(cwd: 项目目录)`；
2. 把 `digest` 直接粘贴进周报文档，按需补充上下文；
3. 多项目周报：对每个项目各跑一次（git 部分按仓库聚合，会话/记忆部分全局）。

## 6. 注意

- 工具只执行**白名单只读 git 命令** + 只读文件统计，不写不删；
- 非 git 目录时 git 分节显示占位提示，周报其余部分照常；
- 会话文件本身多为 0 字节占位，体积统计如实显示（0 B 属正常）；
- 单文件 > 256 KB 的记忆文件跳过不读。
