/** 校验参数是否命中白名单（--since 的天数是一个变量槽）。 */
export declare function validateGitArgs(args: readonly string[]): boolean;
export interface GitResult {
    code: number;
    stdout: string;
    stderr: string;
}
/** 执行只读 git 命令。 */
export declare function runGit(cwd: string, args: readonly string[], signal?: AbortSignal): Promise<GitResult>;
