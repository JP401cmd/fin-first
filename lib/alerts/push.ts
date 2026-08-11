/**
 * Duw-kanaal voor beheerdersmeldingen (ADR 0102).
 *
 * Kanaalkeuze: **ntfy** op een privétopic met access token. Motivering staat in
 * de ADR; kort: een alarmkanaal moet losstaan van de stack die het bewaakt en
 * mag niet STIL falen. Web Push/VAPID faalt stil (verlopen subscription, iOS
 * alleen bij een geïnstalleerde PWA) en vraagt een abonnementstabel + sleutel-
 * rotatie; ntfy is één server-side POST waarvan de leveringsfout in de HTTP-
 * respons zichtbaar is. Web Push blijft de eindvorm zodra we push naar
 * EINDGEBRUIKERS willen — dat is een productfeature, niet dit ops-alarm.
 *
 * Eigenschappen:
 * - **Geen configuratie → stille no-op.** Geen fout, geen rode cron.
 * - **Best-effort**: gooit nooit; een falend alarmkanaal mag geen taak breken.
 * - **Geen clientcode, geen tabel, geen migratie.**
 * - **Payload is inhoudsvrij** — de aanroeper levert alleen tellingen, tags en
 *   een deeplink aan (afgedwongen in lib/alerts/sweep.ts + zijn PII-test).
 */

const TIMEOUT_MS = 5000

export interface PushMessage {
  title: string
  body: string
  /** Korte trefwoorden; ntfy toont ze als emoji/label. */
  tags?: string[]
  /** Absolute URL waar de melding naartoe linkt. */
  click?: string
  priority?: 'default' | 'high'
}

export type PushResult = {
  sent: boolean
  skipped?: 'not-configured' | 'send-failed'
}

interface PushConfig {
  server: string
  topic: string
  token: string | null
}

function readConfig(): PushConfig | null {
  const topic = process.env.NTFY_TOPIC?.trim()
  if (!topic) return null
  const server = (process.env.NTFY_SERVER?.trim() || 'https://ntfy.sh').replace(/\/+$/, '')

  // Het token gaat als `Authorization: Bearer` mee; over http zou dat platte
  // tekst over het net zijn. Eén typo in een env-var mag dat niet veroorzaken.
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(server)
  if (!server.startsWith('https://') && !isLocal) {
    console.error('[alerts:push] NTFY_SERVER moet https zijn — kanaal uitgeschakeld')
    return null
  }

  return { server, topic, token: process.env.NTFY_TOKEN?.trim() || null }
}

/** Is er een duw-kanaal geconfigureerd? Bepaalt of een aanroeper moet melden. */
export function isPushConfigured(): boolean {
  return readConfig() !== null
}

/** Basis-URL voor deeplinks in meldingen (spiegelt de briefing-mail). */
export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

/**
 * Verstuurt één melding. Gebruikt de JSON-publish-vorm van ntfy (POST op de
 * server-root) i.p.v. de header-vorm: HTTP-headers zijn ASCII-only en onze
 * teksten zijn Nederlands (é, →, …) — via headers zou dat mojibake worden.
 */
export async function sendPush(
  message: PushMessage,
  deps?: { fetchImpl?: typeof fetch; config?: PushConfig | null },
): Promise<PushResult> {
  try {
    const cfg = deps?.config !== undefined ? deps.config : readConfig()
    if (!cfg) return { sent: false, skipped: 'not-configured' }

    const doFetch = deps?.fetchImpl ?? fetch
    const res = await doFetch(cfg.server, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
      },
      body: JSON.stringify({
        topic: cfg.topic,
        title: message.title,
        message: message.body,
        tags: message.tags ?? [],
        ...(message.click ? { click: message.click } : {}),
        priority: message.priority === 'high' ? 4 : 3,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!res.ok) {
      // Geen responsbody loggen: die kan het topic (≈ het geheim) echoën.
      console.error(`[alerts:push] ntfy antwoordde ${res.status}`)
      return { sent: false, skipped: 'send-failed' }
    }
    return { sent: true }
  } catch (err) {
    console.error('[alerts:push] versturen mislukt', err instanceof Error ? err.message : err)
    return { sent: false, skipped: 'send-failed' }
  }
}
