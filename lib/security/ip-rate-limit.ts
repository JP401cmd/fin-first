/**
 * IP-gebaseerde rate-limit voor het PUBLIEKE, niet-geauthenticeerde
 * schrijfpad van de Vrijheidscheck (`/api/check/submit`).
 *
 * Waarom een aparte limiter? De bestaande `lib/calculator/rate-limit.ts` is
 * user-scoped (PK = user_id + week_start) en dus onbruikbaar voor anonieme
 * bezoekers die geen `auth.uid()` hebben. Voor een publiek service-role-
 * schrijfpad is het IP het enige misbruik-anker dat we hebben.
 *
 * ── AVG / privacy ────────────────────────────────────────────────────────
 * Een ruw IP-adres is een persoonsgegeven. We slaan het daarom NOOIT plat op:
 * de tabel `intake_rate_limit` bevat alleen een `ip_hash` (HMAC-SHA256 over
 * het IP met een server-side salt). Zonder de salt is de hash niet terug te
 * rekenen naar een IP, en is hij ook niet te koppelen aan hashes uit een
 * ander systeem dat dezelfde IP's ziet. De salt staat enkel server-side in
 * een env-var en wordt nooit gelogd.
 *
 * Schema (aangemaakt door de migratie-stroom, NIET hier):
 *   intake_rate_limit(
 *     ip_hash      text,
 *     window_start timestamptz,
 *     count        int,
 *     primary key (ip_hash, window_start)
 *   )
 *   RLS dicht, service-role-only.
 *
 * Scheiding van zorgen: deze module weet niets van HTTP of auth — alleen van
 * de tabel via `getServiceClient()`. De route doet
 * `await checkIpRateLimit(getClientIp(req.headers))` vóór de write.
 *
 * ── Benodigde env-vars ───────────────────────────────────────────────────
 *   IP_HASH_SALT  (server-only) — stabiele salt voor de IP-HMAC. Mag een
 *                 willekeurige geheime string zijn; verander 'm niet zonder
 *                 reden (dan resetten alle lopende tellers, want oude hashes
 *                 matchen niet meer). Genereer met:
 *                   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *                 Fallback: als `IP_HASH_SALT` ontbreekt gebruiken we
 *                 `ENCRYPTION_KEY_V1` als salt (al verplicht in prod), zodat
 *                 de limiter ook zonder extra env-var veilig werkt. Ontbreken
 *                 beide, dan faalt de limiter GESLOTEN (zie onder).
 */

import { createHmac } from 'crypto'
import { getServiceClient } from '@/lib/supabase/service'

/** Standaard: 5 inzendingen per IP per uur. */
const DEFAULT_LIMIT = 5
const DEFAULT_WINDOW_MS = 60 * 60 * 1000 // 1 uur

export interface IpRateLimitOptions {
  /** Maximaal aantal toegestane calls binnen het venster. Default 5. */
  limit?: number
  /** Venstergrootte in milliseconden. Default 1 uur. */
  windowMs?: number
}

export interface IpRateLimitResult {
  /** False zodra de limiet voor dit venster bereikt is. */
  allowed: boolean
  /** Resterende calls in het huidige venster (>= 0). */
  remaining: number
}

/**
 * Hash een IP-adres met HMAC-SHA256 + server-side salt. Determinisch (zelfde
 * IP + salt → zelfde hash) zodat we op `ip_hash` kunnen tellen, maar niet
 * terug te rekenen zonder de salt.
 *
 * Gooit wanneer er géén salt beschikbaar is — de caller vangt dit en faalt
 * GESLOTEN (weigert), zodat een misconfiguratie nooit stilzwijgend de
 * rate-limit uitschakelt op het publieke pad.
 */
function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT || process.env.ENCRYPTION_KEY_V1
  if (!salt) {
    throw new Error(
      '[ip-rate-limit] Geen IP_HASH_SALT of ENCRYPTION_KEY_V1 gezet; ' +
        'kan IP niet veilig hashen. Configureer IP_HASH_SALT.',
    )
  }
  return createHmac('sha256', salt).update(ip).digest('hex')
}

/**
 * Bereken de start van het huidige venster door de epoch-tijd naar beneden af
 * te ronden op een veelvoud van `windowMs`. Zo valt elke call in hetzelfde
 * venster zolang die binnen hetzelfde uur-blok zit, en is `window_start` een
 * stabiele, deelbare sleutel (geen rolling window, wel race-bestendig).
 */
function getWindowStart(windowMs: number, now: number = Date.now()): Date {
  return new Date(Math.floor(now / windowMs) * windowMs)
}

/**
 * Check + increment de IP-rate-limit voor het huidige venster.
 *
 * Implementatie (atomair waar mogelijk):
 *   1) Lees de huidige `count` voor (ip_hash, window_start).
 *   2) Is die >= limit, dan weigeren zonder te schrijven (allowed:false).
 *   3) Anders upsert met count+1 op de PK (ip_hash, window_start).
 *
 * Net als `checkAndIncrement` in de user-scoped limiter accepteren we dat bij
 * gelijktijdige concurrente requests hooguit één extra call kan passeren — dit
 * is misbruik-rem, geen quota-billing. Wil je harde atomiciteit, dan kan
 * `supabase-db-specialist` een `security definer`-RPC toevoegen die de
 * increment server-side in één statement doet:
 *
 *   insert into intake_rate_limit (ip_hash, window_start, count)
 *   values (_ip_hash, _window_start, 1)
 *   on conflict (ip_hash, window_start)
 *   do update set count = intake_rate_limit.count + 1
 *   returning count;
 *
 * Deze module kan dan op die RPC overschakelen zonder dat de route verandert.
 *
 * Faalt GESLOTEN: als hashen niet kan (geen salt) of de DB-call gooit, wordt
 * de fout doorgegeven aan de route; die hoort dat als afwijzing te behandelen
 * (geen vrijbrief bij infra-fout op een publiek schrijfpad).
 *
 * @param ip   Het client-IP (eerste hop). Lever via `getClientIp(headers)`.
 * @param opts Optionele override van `limit` / `windowMs`.
 */
export async function checkIpRateLimit(
  ip: string,
  opts?: IpRateLimitOptions,
): Promise<IpRateLimitResult> {
  const limit = opts?.limit ?? DEFAULT_LIMIT
  const windowMs = opts?.windowMs ?? DEFAULT_WINDOW_MS

  const ipHash = hashIp(ip)
  const windowStart = getWindowStart(windowMs).toISOString()

  const supabase = getServiceClient()

  // 1) Huidige stand (of 0 als nog geen rij voor dit venster).
  const { data: existing, error: readError } = await supabase
    .from('intake_rate_limit')
    .select('count')
    .eq('ip_hash', ipHash)
    .eq('window_start', windowStart)
    .maybeSingle()

  if (readError) {
    // Faal gesloten: gooi door zodat de route weigert i.p.v. ongelimiteerd
    // doorlaat. Geen IP in de boodschap.
    throw new Error(`[ip-rate-limit] read mislukte: ${readError.message}`)
  }

  const current = existing?.count ?? 0

  // 2) Limiet bereikt → weigeren zonder te schrijven.
  if (current >= limit) {
    return { allowed: false, remaining: 0 }
  }

  // 3) Increment via upsert op de PK (ip_hash, window_start).
  const next = current + 1
  const { error: writeError } = await supabase
    .from('intake_rate_limit')
    .upsert(
      { ip_hash: ipHash, window_start: windowStart, count: next },
      { onConflict: 'ip_hash,window_start' },
    )

  if (writeError) {
    throw new Error(`[ip-rate-limit] increment mislukte: ${writeError.message}`)
  }

  return { allowed: true, remaining: Math.max(0, limit - next) }
}

/**
 * Haal het client-IP uit de request-headers. Neemt de EERSTE hop uit
 * `x-forwarded-for` (links = de oorspronkelijke client; rechtsere entries zijn
 * door tussenliggende proxies toegevoegd). Valt terug op `x-real-ip`.
 *
 * Let op: op Vercel/Cloudflare is `x-forwarded-for` betrouwbaar gezet door de
 * edge; rechtstreeks vanaf het publieke internet is het door de client te
 * spoofen. Voor een rate-limit is dat acceptabel (een spoofer kan hooguit zijn
 * eigen bucket variëren; de CAPTCHA is de tweede laag). Combineer dit nooit
 * met een autorisatiebeslissing.
 *
 * Geeft `'unknown'` terug als er geen header is, zodat alle header-loze
 * requests in één gedeelde bucket vallen (en dus samen gelimiteerd worden)
 * i.p.v. de limiter te omzeilen.
 *
 * @param headers De request-headers (Web `Headers` of een Map-achtige).
 */
export function getClientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  return 'unknown'
}
