import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/supabase/service'
import { logError } from '@/lib/log-error'
import { shouldPersistErrorLog } from '@/lib/observability/runtime-environment'

/**
 * Persisteert een AFGEVANGEN 500 uit `serverError()` (lib/api/respond.ts) in
 * `error_logs`, zodat hij op /beheer/errors verschijnt. Tweeling van
 * `captureRequestError` (lib/observability/request-error.ts), die alleen de
 * ONafgevangen fouten ziet — een route die netjes `serverError()` teruggeeft
 * bereikt `onRequestError` nooit, en bleef daardoor onzichtbaar.
 *
 * AVG — wat er WEL en NIET wordt opgeslagen. `err.message` kan
 * gebruikersdata dragen: Postgres zet waarden in de melding
 * (`invalid input syntax for type uuid: "…"`) en vooral in `details`
 * (`Key (email)=(…) already exists`). Daarom bewust smal:
 *   - context  `serverError:<tag>` — de route (`domein:METHOD`);
 *   - message  `<foutklasse>[ <pg-code>] · <status> · <gemaskeerde melding>`,
 *              max 300 tekens van de melding; `details`/`hint` NOOIT;
 *   - stack    alleen de `at …`-frames (de kopregel herhaalt de melding);
 *   - GEEN user_id, GEEN url, GEEN request-body of headers.
 * Retentie: `error_logs` valt onder de retentie-cron (lib/retention.ts, 12 mnd).
 *
 * De maskering is een denylist en dus geen garantie: tekst zonder quotes
 * (`Budget Boodschappen Jan bestaat al`) komt er ongemaskeerd door. Gooi daarom
 * nooit een Error met gebruikersinvoer in de melding; de negatieve tests in
 * server-error-log.test.ts leggen vast wat wél gevangen wordt.
 */

const MAX_MESSAGE = 300

/** Woorden waarna een aangehaalde naam een schema-identifier is, geen waarde. */
const IDENTIFIER_PREFIX =
  /\b(column|relation|constraint|table|function|index|type|schema|policy|trigger|view|sequence|extension|role)\s*$/i

/** Foutklasse: `Error`-subklasse, anders de vorm van een PostgREST-fout. */
export function errorClassOf(err: unknown): string {
  if (err instanceof Error) return err.name || 'Error'
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code
    if (typeof code === 'string') return 'PostgrestError'
    return 'Object'
  }
  return typeof err
}

function pgCodeOf(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null
  const code = (err as { code?: unknown }).code
  return typeof code === 'string' && /^[0-9A-Z]{5}$|^PGRST\d{3}$/.test(code) ? code : null
}

function rawMessageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const m = (err as { message?: unknown }).message
    return typeof m === 'string' ? m : ''
  }
  return typeof err === 'string' ? err : ''
}

/**
 * Haalt waarden uit een foutmelding en laat de structuur staan. Wat blijft:
 * de zin zelf, schema-namen na `column`/`relation`/`constraint`/…, korte
 * getallen (statuscodes). Wat gaat: e-mail, IBAN, uuid, getallen van vier
 * tekens of meer (bedragen, rekeningnummers, jaartallen), `=(…)`-waarden en
 * elke andere aangehaalde tekst.
 */
export function maskErrorMessage(message: string): string {
  let out = message
    .replace(/[\w.+-]+(@|%40)[\w-]+(\.[\w-]+)+/gi, '[email]')
    .replace(/\b[A-Z]{2}\d{2}(\s?[A-Z0-9]{4}){2,7}(\s?[A-Z0-9]{1,4})?\b/g, '[iban]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]')
    .replace(/=\([^)]*\)/g, '=(…)')

  // Aangehaalde tekst: ", ', `, “…” en ‘…’. Een waarde blijft alleen staan als
  // hij na een schema-woord staat ÉN de vorm van een identifier heeft — anders
  // lekt `Onbekend type "Salaris Jan de Vries"` gewoon door.
  const src = out
  out = src.replace(/(["'`])((?:(?!\1).)*)\1|“([^”]*)”|‘([^’]*)’/g, (match, quote: string | undefined, plain: string | undefined, dubbel: string | undefined, enkel: string | undefined, offset: number) => {
    const inner = plain ?? dubbel ?? enkel ?? ''
    if (IDENTIFIER_PREFIX.test(src.slice(0, offset)) && /^[a-z_][a-z0-9_.]*$/.test(inner)) return match
    if (quote) return `${quote}…${quote}`
    return dubbel !== undefined ? '“…”' : '‘…’'
  })
  // Een niet-afgesloten quote (afgekapte upstream-body): de staart gaat weg.
  // Herkenbaar aan een oneven aantal van dat quote-teken na het paren hierboven.
  // Bij “…” en ‘…’: meer openings- dan sluittekens.
  const aantal = (s: string, q: string) => s.split(q).length - 1
  for (const [open, dicht] of [['"', '"'], ["'", "'"], ['`', '`'], ['“', '”'], ['‘', '’']] as const) {
    const onaf = open === dicht ? aantal(out, open) % 2 === 1 : aantal(out, open) > aantal(out, dicht)
    if (onaf) out = `${out.slice(0, out.lastIndexOf(open) + 1)}…`
  }

  out = out.replace(/\d[\d.,]{2,}\d/g, '[n]')
  return out.length > MAX_MESSAGE ? `${out.slice(0, MAX_MESSAGE)}…` : out
}

/**
 * Alleen echte V8-frames (`at fn (pad:regel:kolom)`, `(native)`, `<anonymous>`):
 * de eerste stackregel herhaalt de (ongemaskeerde) melding, en een meerregelige
 * melding kan zelf een regel bevatten die met "    at " begint.
 */
export function stackFramesOnly(stack: string | undefined): string | undefined {
  if (!stack) return undefined
  const frames = stack
    .split('\n')
    .filter((line) => /^\s+at\s/.test(line) && /(:\d+:\d+\)?|\(native\)|<anonymous>\)?)\s*$/.test(line))
  return frames.length ? frames.join('\n') : undefined
}

// ── Throttle ────────────────────────────────────────────────────────────────
// Per serverinstantie hooguit THROTTLE_MAX rijen per tag per minuut. Een route
// die herhaald faalt (of die iemand herhaald laat falen) spoelt de inbox van
// /beheer/errors anders dicht; één soort is na de eerste rijen al zichtbaar.
const THROTTLE_MAX = 20
const THROTTLE_WINDOW_MS = 60_000
const throttle = new Map<string, { start: number; count: number }>()

export function allowServerErrorLog(tag: string, now = Date.now()): boolean {
  const slot = throttle.get(tag)
  if (!slot || now - slot.start >= THROTTLE_WINDOW_MS) {
    if (throttle.size > 500) throttle.clear() // begrenst het geheugen bij veel tags
    throttle.set(tag, { start: now, count: 1 })
    return true
  }
  slot.count++
  return slot.count <= THROTTLE_MAX
}

/** Alleen voor tests. */
export function resetServerErrorThrottle(): void {
  throttle.clear()
}

export function buildServerErrorLog(err: unknown, tag: string, status: number) {
  const code = pgCodeOf(err)
  const klasse = code ? `${errorClassOf(err)} ${code}` : errorClassOf(err)
  return {
    context: `serverError:${tag}`,
    message: `${klasse} · ${status} · ${maskErrorMessage(rawMessageOf(err))}`,
    stack: stackFramesOnly(err instanceof Error ? err.stack : undefined),
  }
}

export async function captureServerError(
  err: unknown,
  tag: string,
  status: number,
  deps?: { getClient?: () => SupabaseClient },
): Promise<void> {
  try {
    // Lokaal (`next dev`, vitest) niet schrijven; zelfde guard als request-error.
    if (!shouldPersistErrorLog()) return
    if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return
    if (!allowServerErrorLog(tag)) return
    const client = (deps?.getClient ?? getServiceClient)()
    await logError(client, buildServerErrorLog(err, tag, status))
  } catch {
    // Observability mag een response nooit breken.
  }
}
