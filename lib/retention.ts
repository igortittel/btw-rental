/**
 * How long operational records are kept (decision of the client, 19 Nov 2026). The daily cron
 * deletes older rows. Bookings, protocols, documents and the audit log are not deleted here:
 * they are business records (the audit log is immutable); personal data in them is removed by
 * anonymisation (GDPR) instead.
 */
export const RETENTION = {
  /** E-mail log: recipient, type and status of each sent e-mail. */
  emailLogMonths: 12,
  /** Results of the daily cron. */
  cronRunsDays: 30,
  /** One-time password links, counted from their expiry. */
  authTokensDays: 7,
  /** Rate-limit counters. */
  rateLimitsDays: 1,
} as const

/** Cut-off instants: rows older than these are deleted. */
export function retentionCutoffs(now: Date) {
  const days = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()
  const emailLog = new Date(now)
  emailLog.setUTCMonth(emailLog.getUTCMonth() - RETENTION.emailLogMonths)
  return {
    emailLog: emailLog.toISOString(),
    cronRuns: days(RETENTION.cronRunsDays),
    authTokens: days(RETENTION.authTokensDays),
    rateLimits: days(RETENTION.rateLimitsDays),
  }
}
