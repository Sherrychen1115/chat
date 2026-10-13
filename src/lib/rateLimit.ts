// 限速:3 秒內最多 5 則。階段一由前端和假通訊層各算一份,階段二由資料庫判斷。

export const RATE_LIMIT_MAX = 5
export const RATE_LIMIT_WINDOW_MS = 3000

export class RateLimiter {
  private stamps: number[] = []

  /** 還要等幾毫秒才能再送。0 代表現在可以送 */
  waitMs(now = Date.now()): number {
    this.stamps = this.stamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
    if (this.stamps.length < RATE_LIMIT_MAX) return 0
    return this.stamps[0] + RATE_LIMIT_WINDOW_MS - now
  }

  record(now = Date.now()): void {
    this.stamps.push(now)
  }
}
