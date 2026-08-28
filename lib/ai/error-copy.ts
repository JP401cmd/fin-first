/**
 * Canonieke foutcopy voor de AI-oppervlakken (H27).
 *
 * EEN BRON voor "welke AI-foutklasse is dit, wat leest de gebruiker, en wat mag
 * hij dan doen". Server-routes emitteren een `code` op de error-envelope
 * (ADR 0044, `lib/api/respond.ts` → `ErrorEnvelope.code`); de client vertaalt
 * die code hier naar tekst + affordance. Daarmee verdwijnt de oude opzet waarin
 * de chat op SUBSTRINGS van de rauwe responsbody classificeerde en de
 * server-tekst weggooide.
 *
 * HARDE REGEL — geen beheerderstaal richting de eindgebruiker. Geen enkele tekst
 * hier noemt een API-sleutel, een providernaam, een env-variabele of een
 * beheerpad. De gebruiker heeft geen beheerpaneel; een melding die hem een
 * handeling opdraagt die alleen de beheerder kan doen, legt de schuld bij de
 * verkeerde persoon. De echte reden hoort in het serverlog (`console.error` /
 * `serverError()`), niet in de body. `error-copy.test.ts` bewaakt dat als
 * vangrail tegen terugval.
 *
 * Merkstem: Nederlands, je/jij, kort, concreet, geen jargon, geen
 * schuldtoewijzing, geen emoji. Wft-neutraal — deze teksten doen geen enkele
 * uitspraak over geld of keuzes.
 *
 * CLIENT-VEILIG: dit bestand importeert bewust NIETS (geen next/server, geen
 * supabase) zodat zowel route-handlers als `'use client'`-componenten het kunnen
 * gebruiken zonder server-code de browser-bundle in te trekken.
 */

/** De stabiele, machineleesbare foutcodes op AI-paden. */
export const AI_ERROR_CODE = {
  /** 401 — sessie weg. Gedeeld met `unauthorized()` uit lib/api/respond.ts. */
  unauthorized: 'unauthorized',
  /** 403 — tier-gate: geen AI-abonnement. */
  subscription: 'ai_subscription',
  /** 403 — de gebruiker zette AI zelf uit (/mijn/privacy). */
  aiDisabled: 'ai_disabled',
  /** 403 — privé-modus: deze groep draait lokaal, niet in de cloud. */
  privacyGate: 'privacy_mode_active',
  /** 429 — maandelijks creditbudget op. */
  creditLimit: 'ai_credit_limit',
  /** 422 — platform-kill-switch staat uit (beheer). */
  disabledPlatform: 'ai_disabled_platform',
  /** 422 — AI kon niet worden geladen (configuratie/provider). */
  unavailable: 'ai_unavailable',
  /** 500 — de financiële context kon niet worden opgebouwd. */
  contextFailed: 'ai_context_failed',
  /** 503 — de sanitize-fail-safe blokkeerde de call. */
  safetyCheck: 'ai_safety_check',
  /** Providerfout tijdens het streamen. */
  streamFailed: 'ai_stream_failed',
  /** 504 — het antwoord duurde te lang. */
  timeout: 'ai_timeout',
  /** Client-side: geen verbinding met de server. */
  network: 'ai_network',
  /** Vangnet — onbekende of niet-geclassificeerde fout. */
  unknown: 'ai_unknown',
} as const

export type AiErrorCode = (typeof AI_ERROR_CODE)[keyof typeof AI_ERROR_CODE]

/**
 * Wat de gebruiker hierna mag doen. Bepaalt de knop onder de foutmelding:
 * - `opnieuw` — retry kán slagen (tijdelijke storing, netwerk, timeout)
 * - `geen`    — retry kan per definitie NIET slagen (kill-switch, limiet,
 *               privé-modus); toon dus geen knop die een lus start
 * - `upsell`  — abonnement nodig
 * - `link`    — de weg terug ligt in de instellingen (`href`)
 */
export type AiErrorAffordance = 'opnieuw' | 'geen' | 'upsell' | 'link'

export interface AiErrorCopy {
  code: AiErrorCode
  text: string
  affordance: AiErrorAffordance
  /** Alleen bij `affordance: 'link'`. */
  href?: string
  linkLabel?: string
}

/**
 * De 403-tekst bij een uitgezette AI-schakelaar. Woont hier (en niet in
 * privacy-gate.ts) omdat client én server hem delen; privacy-gate re-exporteert
 * hem voor de bestaande importeurs.
 */
export const AI_DISABLED_GATE_MESSAGE =
  'AI staat uit in je instellingen. Via Mijn → Privacy kun je AI weer aanzetten.'

interface CopyEntry {
  text: string
  affordance: AiErrorAffordance
  href?: string
  linkLabel?: string
  /**
   * True zodra de servertekst rijker is dan de tabeltekst (bevat cijfers of een
   * datum die hier niet bekend zijn). Alleen dán wint de servertekst — nooit
   * standaard, want een servertekst kan beheerderstaal bevatten.
   */
  preferServerText?: boolean
}

const COPY: Record<AiErrorCode, CopyEntry> = {
  [AI_ERROR_CODE.unauthorized]: {
    text: 'Je sessie is verlopen. Log opnieuw in.',
    affordance: 'geen',
  },
  [AI_ERROR_CODE.subscription]: {
    text: 'Fin is een betaalde functie. Sluit het AI-abonnement af om verder te chatten.',
    affordance: 'upsell',
  },
  [AI_ERROR_CODE.aiDisabled]: {
    text: AI_DISABLED_GATE_MESSAGE,
    affordance: 'link',
    href: '/mijn/privacy',
    linkLabel: 'Naar privacy-instellingen',
  },
  [AI_ERROR_CODE.privacyGate]: {
    text: 'Je gesprek met Fin draait op je eigen toestel. Er is niets naar onze servers gestuurd.',
    affordance: 'geen',
  },
  [AI_ERROR_CODE.creditLimit]: {
    // Vervangen door de servertekst zodra die er is: die noemt het aantal
    // credits en de resetdatum (lib/ai/credit-gate.ts → creditLimitMessage).
    text: 'Je maandelijkse AI-limiet is bereikt. Volgende maand kun je weer verder.',
    affordance: 'geen',
    preferServerText: true,
  },
  [AI_ERROR_CODE.disabledPlatform]: {
    text: 'Fin staat nu uit voor onderhoud. Je gegevens blijven ongewijzigd; probeer het later opnieuw.',
    affordance: 'geen',
  },
  [AI_ERROR_CODE.unavailable]: {
    text: 'Fin is nu even niet bereikbaar. Het ligt niet aan jou — probeer het straks opnieuw.',
    affordance: 'opnieuw',
  },
  [AI_ERROR_CODE.contextFailed]: {
    text: 'Fin kon je overzicht niet ophalen. Probeer het zo nog eens.',
    affordance: 'opnieuw',
  },
  [AI_ERROR_CODE.safetyCheck]: {
    text: 'Fin kon je vraag nu niet verwerken. Er is niets verstuurd; probeer het straks opnieuw.',
    affordance: 'opnieuw',
  },
  [AI_ERROR_CODE.streamFailed]: {
    text: 'Fin kreeg geen antwoord terug. Probeer het zo nog eens.',
    affordance: 'opnieuw',
  },
  [AI_ERROR_CODE.timeout]: {
    text: 'Het antwoord duurde te lang. Probeer het opnieuw met een kortere vraag.',
    affordance: 'opnieuw',
  },
  [AI_ERROR_CODE.network]: {
    text: 'Geen verbinding met de server. Controleer je internetverbinding en probeer het opnieuw.',
    affordance: 'opnieuw',
  },
  [AI_ERROR_CODE.unknown]: {
    text: 'Er ging iets mis bij het genereren van een antwoord. Probeer het opnieuw.',
    affordance: 'opnieuw',
  },
}

const KNOWN_CODES = new Set<string>(Object.values(AI_ERROR_CODE))

export function isAiErrorCode(value: unknown): value is AiErrorCode {
  return typeof value === 'string' && KNOWN_CODES.has(value)
}

/**
 * Vertaalt een foutcode naar tekst + affordance.
 *
 * `serverText` is de `error`-string uit de envelope; die wint alleen bij codes
 * die als `preferServerText` gemarkeerd staan (nu: het creditlimiet, dat het
 * aantal credits en de resetdatum bevat).
 */
export function describeAiError(code: unknown, serverText?: string | null): AiErrorCopy {
  const resolved: AiErrorCode = isAiErrorCode(code) ? code : AI_ERROR_CODE.unknown
  const entry = COPY[resolved]
  const trimmed = typeof serverText === 'string' ? serverText.trim() : ''
  return {
    code: resolved,
    text: entry.preferServerText && trimmed ? trimmed : entry.text,
    affordance: entry.affordance,
    ...(entry.href ? { href: entry.href } : {}),
    ...(entry.linkLabel ? { linkLabel: entry.linkLabel } : {}),
  }
}

/**
 * Laatste vangnet: leidt een code af uit vrije tekst.
 *
 * Blijft bestaan omdat de AI-SDK-transport `throw new Error(await
 * response.text())` doet: als een tussenlaag (edge, proxy) een niet-JSON-body
 * teruggeeft, is er geen code om op te lezen. Let op de 422-tak: die mapt
 * bewust op `ai_unavailable` (neutraal), NOOIT terug op de oude
 * beheerderstekst.
 */
export function classifyAiErrorText(raw: string | undefined | null): AiErrorCode {
  const msg = (raw ?? '').toLowerCase()
  if (!msg) return AI_ERROR_CODE.unknown
  if (msg.includes('abonnement')) return AI_ERROR_CODE.subscription
  if (msg.includes('limiet bereikt') || msg.includes('ai-limiet')) return AI_ERROR_CODE.creditLimit
  if (msg.includes('privé-modus') || msg.includes('prive-modus')) return AI_ERROR_CODE.privacyGate
  if (msg.includes('ai staat uit')) return AI_ERROR_CODE.aiDisabled
  if (msg.includes('uitgeschakeld door beheer')) return AI_ERROR_CODE.disabledPlatform
  if (msg.includes('timeout') || msg.includes('duurde te lang') || msg.includes('504')) {
    return AI_ERROR_CODE.timeout
  }
  if (msg.includes('unauthorized') || msg.includes('niet ingelogd') || msg.includes('401')) {
    return AI_ERROR_CODE.unauthorized
  }
  if (msg.includes('api key') || msg.includes('api-sleutel') || msg.includes('niet geconfigureerd') || msg.includes('422')) {
    return AI_ERROR_CODE.unavailable
  }
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('fetch')) {
    return AI_ERROR_CODE.network
  }
  return AI_ERROR_CODE.unknown
}

/**
 * Zet de fout die de AI-SDK-transport opgooit om in leesbare copy.
 *
 * De transport levert de RAUWE responsbody als `Error.message` (geverifieerd op
 * ai@6.0.230, `HttpChatTransport`: `throw new Error(await response.text())`).
 * We proberen die als envelope te lezen; lukt dat niet, dan valt hij terug op
 * `classifyAiErrorText`. In beide gevallen komt de zichtbare tekst uit de tabel
 * hierboven — de rauwe body wordt nooit gerenderd.
 */
export function describeAiThrown(err: { message?: string } | undefined | null): AiErrorCopy {
  const raw = err?.message
  if (!raw) return describeAiError(AI_ERROR_CODE.unknown)

  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: unknown; code?: unknown }
      if (isAiErrorCode(parsed.code)) {
        return describeAiError(parsed.code, typeof parsed.error === 'string' ? parsed.error : null)
      }
      // Envelope zonder (bekende) code: classificeer op de servertekst, niet op
      // de hele JSON — anders matcht `{"error":"…"}` op onbedoelde substrings.
      if (typeof parsed.error === 'string') {
        return describeAiError(classifyAiErrorText(parsed.error), parsed.error)
      }
    } catch {
      // Geen geldige JSON — val door naar de tekst-classificatie.
    }
  }

  return describeAiError(classifyAiErrorText(trimmed))
}
