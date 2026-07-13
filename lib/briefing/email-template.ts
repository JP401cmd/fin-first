// ── Wekelijkse briefing-e-mail — template (puur) ─────────────────────
//
// Rendert de BEVROREN weeksnapshot (lib/briefing/snapshot.ts) tot een e-mail.
// Puur en unit-testbaar: geen DB, geen env, geen recompute van kerngetallen.
// De vrijheidstijd komt uit dezelfde canonieke helper als /overzicht
// (buildFreedomHeroProps → computeFreedomTotal → formatFreedomTimeString);
// hier wordt niets financieels opnieuw berekend, alleen geformatteerd.
//
// PRIVACY (harde regel): e-mail is een onbeveiligd kanaal (via Resend). De mail
// is bewust een TEASER: elk briefje degradeert naar een neutrale categorie-teaser
// — de ruwe entry.text gaat NOOIT verbatim mee. Dat sluit niet alleen euro's uit
// maar ook gebruiker-geschreven vrije tekst (check-in-reflecties, doel-/event-
// namen) die anders het onbeveiligde kanaal in zou lekken (security-review jul
// 2026). Alleen vrijheidstijd (jaren/maanden/dagen, géén bedrag) en een euro-
// gestripte kop gaan mee; het volledige detail zit achter de CTA in de app.

import type { BriefingSnapshot } from './snapshot'
import type { BriefingEntry } from '@/components/overview/briefing-panel'
import { buildFreedomHeroProps } from './overview-briefing'

export interface BriefingEmailInput {
  snapshot: BriefingSnapshot
  /** Origin zonder trailing slash, bv. "https://trifinity.app". */
  baseUrl: string
  /** Getekend unsubscribe-token (lib/briefing/email-token.ts). */
  unsubscribeToken: string
  /** Max. aantal briefjes in de mail (default 5). */
  maxEntries?: number
}

export interface BriefingEmailOutput {
  subject: string
  html: string
  /** Kant-en-klare unsubscribe-URL — óók voor de List-Unsubscribe-header. */
  unsubscribeUrl: string
}

// ── PII-guards ───────────────────────────────────────────────────────

const EURO_PATTERNS: RegExp[] = [
  /€\s?\d[\d.,\s]*/g, // €1.234 / € 1 234
  /\bEUR\s?\d[\d.,\s]*/gi, // EUR 1234
  /\d[\d.,]*\s?euro\b/gi, // 1234 euro
]

/** Bevat de tekst een eurobedrag? (bepaalt of we naar een teaser degraderen) */
export function containsEuroAmount(text: string): boolean {
  return EURO_PATTERNS.some((re) => {
    re.lastIndex = 0
    return re.test(text)
  })
}

/** Sluitstuk-sanitisatie: verwijder elk eurobedrag uit een string. */
export function stripEuroAmounts(text: string): string {
  let out = text
  for (const re of EURO_PATTERNS) out = out.replace(re, '…')
  // Dubbele spaties / spatie-voor-leesteken opruimen na verwijdering.
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim()
}

/**
 * Neutrale teaser per categorie — bevat per constructie geen bedragen en geen
 * gebruiker-geschreven vrije tekst. De mail toont UITSLUITEND deze teasers, nooit
 * de ruwe entry.text (die kan naast euro's ook een check-in-citaat of doelnaam
 * bevatten — te persoonlijk voor het onbeveiligde e-mailkanaal).
 */
const CATEGORY_TEASER: Record<BriefingEntry['category'], string> = {
  observation: 'Een observatie over je week',
  tip: 'Een tip om vrijheid te winnen',
  upcoming: 'Iets dat eraan komt',
  heads_up: 'Iets om op te letten',
  milestone: 'Een mijlpaal die je bereikte',
  market: 'Nieuws uit de markt',
}

/**
 * Vertaal de briefjes naar een compacte, ontdubbelde lijst categorie-teasers
 * (volgorde van eerste voorkomen). Geen entry.text gaat mee — de teaser trekt de
 * klik, het detail staat veilig in de app.
 */
function buildTeasers(entries: BriefingEntry[], max: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of entries) {
    const teaser = CATEGORY_TEASER[e.category]
    if (!teaser || seen.has(teaser)) continue
    seen.add(teaser)
    out.push(teaser)
    if (out.length >= max) break
  }
  return out
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])
}

// ── Template ─────────────────────────────────────────────────────────

/**
 * Bouw de briefing-e-mail uit een bevroren snapshot. Geeft `null` terug wanneer
 * er niets zinvols te melden is (geen briefjes én geen vrijheidsmeetpunt) — de
 * cron slaat die gebruiker dan over i.p.v. een lege mail te sturen.
 */
export function buildBriefingEmail(input: BriefingEmailInput): BriefingEmailOutput | null {
  const { snapshot, baseUrl, unsubscribeToken, maxEntries = 5 } = input
  const origin = baseUrl.replace(/\/+$/, '')

  const hasEntries = snapshot.entries.length > 0
  const hasFreedom = Boolean(snapshot.freedomSnapshot)
  if (!hasEntries && !hasFreedom) return null

  const appUrl = `${origin}/overzicht#briefing`
  const willUrl = `${origin}/overzicht?prompt=briefing-week`
  const unsubscribeUrl = `${origin}/api/briefing/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`

  // ── Vrijheidstijd-hero (canoniek geformatteerd, geen recompute) ──
  let heroLabel = ''
  let deltaLine = ''
  if (snapshot.freedomSnapshot) {
    const hero = buildFreedomHeroProps(
      snapshot.freedomSnapshot,
      snapshot.previousFreedomSnapshot ?? null,
      [], // sparkline niet nodig in de mail
    )
    heroLabel = hero.totalLabel
    if (hero.deltaDays !== null && hero.deltaDays !== 0) {
      const gained = hero.deltaDays > 0
      const n = Math.abs(hero.deltaDays)
      const dayWord = n === 1 ? 'dag' : 'dagen'
      deltaLine = gained
        ? `Deze week ${n} ${dayWord} vrijheid erbij.`
        : `Deze week ${n} ${dayWord} vrijheid eraf.`
    } else if (hero.isFirstWeek) {
      deltaLine = 'Je eerste vrijheidsmeting — vanaf nu volgen we je weekwinst.'
    }
  }

  // ── Kop + briefjes (euro-vrij) ──
  const headline = snapshot.headline ? stripEuroAmounts(snapshot.headline) : ''
  const teasers = buildTeasers(snapshot.entries, maxEntries)

  const subject = heroLabel
    ? `Je week in vrijheid: ${heroLabel}`
    : 'Je wekelijkse briefing staat klaar'

  // ── HTML (sobere editorial-stijl, spiegel householdInviteEmail) ──
  const heroBlock = heroLabel
    ? `
      <p style="margin:0 0 4px;font-size:13px;color:#78716c;text-transform:uppercase;letter-spacing:0.08em;">Je opgeslagen tijd</p>
      <p style="margin:0 0 6px;font-size:26px;font-weight:700;color:#1c1917;">${escapeHtml(heroLabel)}</p>
      ${deltaLine ? `<p style="margin:0 0 20px;font-size:14px;color:#57534e;">${escapeHtml(deltaLine)}</p>` : '<div style="height:12px"></div>'}
    `
    : ''

  const headlineBlock = headline
    ? `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#1c1917;font-weight:600;">${escapeHtml(headline)}</p>`
    : ''

  const teaserBlock =
    teasers.length > 0
      ? `<ul style="margin:0 0 24px;padding:0 0 0 18px;color:#292524;font-size:15px;line-height:1.6;">${teasers
          .map((t) => `<li style="margin:0 0 6px;">${escapeHtml(t)}</li>`)
          .join('')}</ul>`
      : ''

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; color:#1c1917; line-height:1.6; max-width:520px; margin:0 auto;">
      <p style="margin:0 0 20px;font-size:12px;color:#a8a29e;text-transform:uppercase;letter-spacing:0.12em;">TriFinity · Weekbriefing</p>
      ${heroBlock}
      ${headlineBlock}
      ${teaserBlock}
      <p style="margin:0 0 8px;font-size:14px;color:#57534e;">Het volledige overzicht — met alle cijfers — staat veilig in de app.</p>
      <p style="margin:0 0 28px;">
        <a href="${appUrl}" style="display:inline-block;background:#1c1917;color:#fff;padding:11px 20px;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;margin:0 8px 8px 0;">Bekijk in de app</a>
        <a href="${willUrl}" style="display:inline-block;background:#f5f5f4;color:#1c1917;padding:11px 20px;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;border:1px solid #e7e5e4;">Bespreek met Will</a>
      </p>
      <hr style="border:none;border-top:1px solid #e7e5e4;margin:24px 0;">
      <p style="font-size:12px;color:#a8a29e;font-family:Helvetica,Arial,sans-serif;">
        Je ontvangt deze e-mail omdat je de wekelijkse briefing hebt aangezet.
        <a href="${unsubscribeUrl}" style="color:#78716c;">Afmelden</a>.
      </p>
    </div>`

  return { subject, html, unsubscribeUrl }
}
