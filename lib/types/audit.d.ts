import type { Config, WeeklyDigestReport } from './types.ts';
export { buildDigest } from './scan.ts';
export interface AuditOptions {
    cwd: string;
    signal: AbortSignal;
    config: Config;
}
/** 执行周报聚合。 */
export declare function runAudit(options: AuditOptions): Promise<WeeklyDigestReport>;
