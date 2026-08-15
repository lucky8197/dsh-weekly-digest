/**
 * Git 命令执行器（weekly-digest 专用白名单）。
 * 仅允许只读 log/rev-parse；`--since <N> days ago` 的 N 由调用方提供。
 */
import { execFile } from 'node:child_process';
/** 校验 log --since 参数（形如 "7 days ago"）。 */
function isSinceArg(value) {
    return /^\d+ days ago$/.test(value);
}
const LOG_FORMAT = '--format=%H%x1f%an%x1f%ad%x1f%s';
/** 校验参数是否命中白名单（--since 的天数是一个变量槽）。 */
export function validateGitArgs(args) {
    if (args.length === 5
        && args[0] === 'log' && args[1] === '--since' && isSinceArg(args[2] ?? '')
        && args[3] === '--date=short' && args[4] === LOG_FORMAT) {
        return true;
    }
    if (args.length === 2 && args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree')
        return true;
    if (args.length === 2 && args[0] === 'rev-parse' && args[1] === '--show-toplevel')
        return true;
    if (args.length === 3 && args[0] === 'log' && args[1] === '-1' && args[2] === '--format=%H')
        return true;
    return false;
}
/** 执行只读 git 命令。 */
export function runGit(cwd, args, signal) {
    return new Promise((resolve) => {
        if (!validateGitArgs(args)) {
            resolve({ code: -2, stdout: '', stderr: 'denied: non-whitelisted git command' });
            return;
        }
        const child = execFile('git', [...args], { cwd, timeout: 15_000, windowsHide: true }, (err, stdout, stderr) => {
            if (err === null) {
                resolve({ code: 0, stdout: String(stdout), stderr: String(stderr) });
            }
            else {
                const code = err.code;
                resolve({ code: code === 'ETIMEDOUT' ? 124 : 1, stdout: String(stdout), stderr: String(stderr) });
            }
        });
        if (signal !== undefined) {
            signal.addEventListener('abort', () => child.kill(), { once: true });
        }
    });
}
