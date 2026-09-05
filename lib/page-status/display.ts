// lib/page-status/display.ts
//
// Pure weergave-logica voor de status-duiding-banner: bepaalt of de banner
// EXPANDED (volledig bovenaan) of MINIMIZED (ingeklapt tot een gekleurde dot
// naast de pagina-'i') getoond moet worden.
//
// De gebruiker kan een banner minimaliseren; dat wordt server-side onthouden op
// het LeverageStatus-NIVEAU waarop hij minimaliseerde (warn of bad). De banner
// klapt automatisch weer open bij ESCALATIE — als de huidige status erger is dan
// het opgeslagen niveau (warn → bad) — zodat een verergerende situatie nooit
// verborgen blijft achter een eerder ingeklapte dot.
//
// Pure module (géén 'use client') + geëxporteerd zodat de unit-test de matrix
// rechtstreeks kan afdekken.

import type { LeverageStatus } from '@/lib/leverage-status'
import type { PageStatusKind } from './types'

export type BannerDisplay = 'expanded' | 'minimized'

/**
 * Het niveau waarop de gebruiker een banner kan minimaliseren:
 *  - 'warn' / 'bad' — de stoplicht-niveaus van een leverage-banner (escaleert).
 *  - 'info'         — de informatieve vrijheidsbanner (severity 0, escaleert nooit;
 *    blijft ingeklapt tot de gebruiker 'm zelf weer opent).
 */
export type MinimizedLevel = 'warn' | 'bad' | 'info'

/**
 * Ernst-rangschikking: good/neutral/info = 0 (informatief/geen alarm), warn = 1,
 * bad = 2. Alleen warn/bad escaleren; good/neutral/info krijgen severity 0 voor
 * een totale ordening, zodat een eenmaal geminimaliseerde info-banner ingeklapt
 * blijft (severity(status:neutral)=0 ≤ severity('info')=0).
 */
function severity(status: LeverageStatus | MinimizedLevel): number {
  return status === 'bad' ? 2 : status === 'warn' ? 1 : 0
}

/**
 * Bepaalt de weergave van de banner voor één route.
 *
 * @param status De huidige LeverageStatus van de pagina (de nav-dot-status).
 * @param minimizedLevel Het opgeslagen niveau waarop de gebruiker eerder
 *   minimaliseerde, of `null` als hij nooit minimaliseerde.
 * @returns `'minimized'` ALLEEN wanneer er een opgeslagen niveau is én de
 *   huidige status NIET geëscaleerd is t.o.v. dat niveau
 *   (severity(status) <= severity(minimizedLevel)); anders `'expanded'`.
 */
export function resolveBannerDisplay(
  status: LeverageStatus,
  minimizedLevel: MinimizedLevel | null,
): BannerDisplay {
  if (minimizedLevel == null) return 'expanded'
  // Geëscaleerd (huidige status erger dan toen geminimaliseerd) → weer tonen.
  return severity(status) <= severity(minimizedLevel) ? 'minimized' : 'expanded'
}

/**
 * Op welk niveau slaat een klik op "Minimaliseren" deze banner op?
 *
 * De regel is één zin: **je minimaliseert op de ernst die je op dat moment
 * ziet.** Alleen iets ergers dan dát heropent de banner — dat is precies de
 * escalatie-garantie die `resolveBannerDisplay` hierboven afdwingt.
 *
 * ── WAAROM DIT EEN EIGEN HELPER IS (B-017) ─────────────────────────────────
 * Deze keuze zat als losse ternary in `PageStatusProvider` en ging daar mis:
 * een `freedom`-banner werd altijd op het vaste 'info' (severity 0) opgeslagen.
 * Dat klopte zolang die banner per definitie 'neutral' was, maar sinds ADR 0129
 * kan hij 'warn' zijn (het stop-anker met een tekort). `resolveBannerDisplay`
 * las die eigen 'warn' vervolgens als escalatie t.o.v. 'info' en klapte de
 * banner in hetzelfde renderpad weer uit: de knop deed zichtbaar niets. De keuze
 * hoort dus naast de helper die haar interpreteert, met een test op de KETEN —
 * niet los in een component waar geen test bij kan.
 *
 * @param kind Soort melding; bepaalt alleen nog wat er gebeurt zónder alarm.
 * @param status De status die de gebruiker op dat moment ziet.
 * @returns Het op te slaan niveau, of `null` als er niets te minimaliseren valt
 *   (een leverage-banner bestaat alleen bij warn/bad).
 */
export function minimizeLevelFor(
  kind: PageStatusKind,
  status: LeverageStatus,
): MinimizedLevel | null {
  // Alarm-niveaus minimaliseren op zichzelf: alleen verergering heropent.
  if (status === 'warn' || status === 'bad') return status
  // Geen alarm: de informatieve vrijheidsbanner klapt in op het vaste
  // 'info'-niveau (escaleert nooit); een leverage-banner bestaat hier niet.
  return kind === 'freedom' ? 'info' : null
}
