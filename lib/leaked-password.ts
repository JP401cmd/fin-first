/**
 * Leaked-password-protection via HaveIBeenPwned "Pwned Passwords" (ADR 0057).
 *
 * Gratis alternatief voor Supabase's native leaked-password-protection (die het
 * Pro-plan vereist). Beschermt de accounthouder tegen (her)gebruik van een
 * bekend-gelekt wachtwoord — het reële risico bij credential stuffing.
 *
 * PRIVACY — k-anonimiteit (plaintext verlaat de browser NOOIT):
 *   1. De client hasht het wachtwoord lokaal met SHA-1 → 40 hex-tekens uppercase.
 *   2. De client stuurt ALLEEN de eerste 5 hex-tekens (de prefix) naar onze eigen
 *      proxy-route `/api/auth/password-check?prefix=XXXXX`.
 *   3. De route proxyt naar HIBP (`/range/{PREFIX}`, met privacy-padding) en geeft
 *      de rauwe `SUFFIX:COUNT`-lijst terug.
 *   4. De client vergelijkt lokaal of de resterende 35 hex-tekens (de suffix) in
 *      die lijst staan. Zo ja → gelekt (met count).
 * Onze server ziet dus nooit het plaintext-wachtwoord én nooit de volledige hash
 * — alleen de 5-tekens-prefix (net als HIBP zelf).
 *
 * FAIL-OPEN (hard): élke storing (crypto niet beschikbaar, fetch-throw, timeout,
 * non-200, parse-fout) wordt behandeld als "niet gelekt" → { pwned: false }.
 * Een beveiligingscheck die de gebruiker buitensluit bij een externe storing is
 * erger dan de check missen. Blauwdruk: `lib/nibud/api-client.ts`.
 */

export type LeakedPasswordResult = {
  pwned: boolean
  count: number
}

/** Injecteerbare fetch (tests geven een mock mee; runtime valt terug op global). */
type FetchImpl = typeof fetch

/**
 * SHA-1 van `text` als 40 hex-tekens UPPERCASE, via de Web Crypto API
 * (`crypto.subtle`). Beschikbaar in de browser én in Node/jsdom via webcrypto.
 * Gooit als `crypto.subtle` ontbreekt — de orkestrator vangt dat af (fail-open).
 */
export async function sha1HexUpper(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('crypto.subtle niet beschikbaar')
  }
  const digest = await subtle.digest('SHA-1', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

/**
 * Pure parser: staat `suffix` in de HIBP range-tekst (regels `SUFFIX:COUNT`)?
 *
 * - CRLF- én LF-tolerant (HIBP gebruikt CRLF; we splitsen op beide).
 * - Case-insensitief vergelijken (defensief; HIBP levert uppercase).
 * - Privacy-padding-regels hebben `COUNT = 0` — die tellen NIET als gelekt
 *   (`pwned` is alleen waar bij count > 0).
 */
export function isSuffixInRange(rangeText: string, suffix: string): LeakedPasswordResult {
  const target = suffix.trim().toUpperCase()
  for (const rawLine of rangeText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const sep = line.indexOf(':')
    if (sep === -1) continue
    if (line.slice(0, sep).toUpperCase() !== target) continue
    const count = Number.parseInt(line.slice(sep + 1), 10)
    const safeCount = Number.isFinite(count) ? count : 0
    return { pwned: safeCount > 0, count: safeCount }
  }
  return { pwned: false, count: 0 }
}

/**
 * Orkestreert de volledige check: hash → vraag onze proxy-route met alleen de
 * prefix → match de suffix lokaal. FAIL-OPEN bij élke throw/non-ok/ontbrekende
 * fetch → `{ pwned: false, count: 0 }`.
 *
 * @param password het te controleren wachtwoord (verlaat de browser NOOIT)
 * @param opts.fetchImpl injecteerbare fetch (tests); default = global fetch
 * @param opts.signal optioneel AbortSignal om de call af te breken
 */
export async function checkLeakedPassword(
  password: string,
  opts?: { fetchImpl?: FetchImpl; signal?: AbortSignal },
): Promise<LeakedPasswordResult> {
  const doFetch: FetchImpl | undefined = opts?.fetchImpl ?? globalThis.fetch
  if (!password || typeof doFetch !== 'function') {
    return { pwned: false, count: 0 }
  }

  try {
    const hash = await sha1HexUpper(password)
    const prefix = hash.slice(0, 5)
    const suffix = hash.slice(5)

    // ALLEEN de 5-tekens prefix gaat naar onze route (k-anonimiteit).
    const res = await doFetch(`/api/auth/password-check?prefix=${prefix}`, {
      signal: opts?.signal,
    })
    if (!res.ok) return { pwned: false, count: 0 }

    const text = await res.text()
    return isSuffixInRange(text, suffix)
  } catch {
    // Elke storing (netwerk, timeout, crypto, parse) → niet blokkeren.
    return { pwned: false, count: 0 }
  }
}
