// Fetch helper with exponential-backoff retry on transient failures.
//
// Used by the global-sync orchestrator to wrap exchange/wallet/refresh-prices
// calls. Retries on:
//   - HTTP 429 (rate limited) — honours Retry-After header if present
//   - HTTP 502/503/504 (gateway/temporary upstream error)
//   - Network errors (TypeError from fetch, AbortError-via-timeout)
//
// Backoff: 1s, 2s, 4s with ±200ms jitter. Max 3 retries by default.
// Non-retriable HTTP statuses (4xx other than 429, 5xx other than 502/503/504)
// resolve immediately so the caller can branch on the response.

export interface FetchWithRetryOptions {
  retries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  /** Per-request timeout (default 60s). Aborts a single attempt — retries still apply. */
  timeoutMs?: number
  /** Outer signal that aborts ALL retries when the user navigates away or cancels. */
  signal?: AbortSignal
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504])

function jitter(delayMs: number): number {
  const spread = 200
  return delayMs + (Math.random() * 2 - 1) * spread
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  // HTTP-date format
  const date = Date.parse(header)
  if (Number.isFinite(date)) {
    const delta = date - Date.now()
    return delta > 0 ? delta : 0
  }
  return null
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

/**
 * Fetch with retry + per-attempt timeout. Always returns the final Response;
 * caller decides how to interpret 4xx/5xx that aren't retriable.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const {
    retries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 8000,
    timeoutMs = 60_000,
    signal: outerSignal,
  } = options

  let lastError: unknown = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (outerSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    // Compose per-attempt signal: outerSignal AND timeoutSignal both abort.
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const combinedSignal = outerSignal
      ? AbortSignal.any([outerSignal, timeoutSignal])
      : timeoutSignal

    try {
      const res = await fetch(url, { ...init, signal: combinedSignal })

      if (!RETRYABLE_STATUS.has(res.status) || attempt === retries) {
        return res
      }

      // Honour Retry-After if the server sent one; otherwise exponential backoff.
      const retryAfterMs = parseRetryAfter(res.headers.get('Retry-After'))
      const backoff = retryAfterMs ?? Math.min(baseDelayMs * 2 ** attempt, maxDelayMs)
      await sleep(jitter(backoff), outerSignal)
      continue
    } catch (err) {
      lastError = err

      // User-cancelled (outer signal aborted) — propagate immediately.
      if (outerSignal?.aborted) {
        throw err
      }

      // Last attempt — give up.
      if (attempt === retries) throw err

      // Network error or per-attempt timeout — backoff and retry.
      const backoff = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs)
      await sleep(jitter(backoff), outerSignal)
    }
  }

  // Unreachable — the loop returns or throws on every path. Keep TS happy.
  throw lastError ?? new Error('fetchWithRetry: exhausted retries')
}
