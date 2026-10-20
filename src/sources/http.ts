import { BudgetExhaustedError, SourceHttpError, type HttpFn, type RateLimit } from "./types";

const DEFAULT_UA = "FINALS-COMPETE-bot/0.1 (set SOURCE_USER_AGENT with contact details)";

/**
 * Tracks requests against a source's limit. The log is persisted between runs so
 * hourly budgets (e.g. Liquipedia LPDB: 60/h) hold even when cron runs often.
 * When the budget is used up the run stops; we never wait out or bypass a limit.
 */
export class RequestBudget {
  private log: number[];
  private lastAt = 0;
  public used = 0;

  constructor(
    private limit: RateLimit,
    previousLog: number[],
    private clock: () => number = Date.now,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    const cutoff = clock() - limit.windowMs;
    this.log = previousLog.filter((t) => t > cutoff);
  }

  remaining() {
    const cutoff = this.clock() - this.limit.windowMs;
    this.log = this.log.filter((t) => t > cutoff);
    return this.limit.limit - this.log.length;
  }

  async acquire() {
    if (this.remaining() <= 0) {
      throw new BudgetExhaustedError(`Request budget exhausted (${this.limit.limit} per ${this.limit.windowMs / 60000} min).`);
    }
    const wait = this.lastAt + this.limit.minIntervalMs - this.clock();
    if (wait > 0) await this.sleep(wait);
    this.lastAt = this.clock();
    this.log.push(this.lastAt);
    this.used++;
  }

  snapshot() {
    return [...this.log];
  }
}

export function createHttp(budget: RequestBudget, userAgent: string | undefined, fetchImpl: typeof fetch = fetch): HttpFn {
  return async (url, init) => {
    await budget.acquire();
    const headers = new Headers(init?.headers);
    headers.set("User-Agent", userAgent || DEFAULT_UA);
    headers.set("Accept-Encoding", "gzip");
    const res = await fetchImpl(url, { ...init, headers });
    if (res.status === 429) {
      throw new BudgetExhaustedError(`Source answered 429 Too Many Requests for ${new URL(url).host}; stopping this run.`);
    }
    if (!res.ok) {
      throw new SourceHttpError(res.status, `HTTP ${res.status} from ${new URL(url).host}${new URL(url).pathname}`);
    }
    return res;
  };
}
