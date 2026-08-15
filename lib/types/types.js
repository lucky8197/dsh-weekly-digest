/**
 * weekly-digest 共享类型。
 *
 * 安全边界：只执行白名单只读 git 命令 + 只读 fs 访问（stat/list/readText），
 * 不写不删不执行；报告不含完整会话/记忆内容。
 */
export const DEFAULT_CONFIG = {
    days: 7,
    maxEntries: 10,
    maxReadBytes: 256 * 1024,
};
