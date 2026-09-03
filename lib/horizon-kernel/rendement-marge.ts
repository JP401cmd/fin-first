/**
 * Horizon-kernel — **de rendement-marge**: hoeveel mag het rendement per jaar
 * tegenvallen voordat het plan omvalt?
 *
 * ## Waarom dit getal er is (en de kans verving)
 * De marktcheck toonde tot 2026-08-09 een *slaagkans*: het aandeel verstoorde
 * marktverlopen met `gap ≥ 0`, geëvalueerd op de door de solver GEVONDEN
 * FIRE-leeftijd. Die leeftijd is per definitie de vroegste maand waarop het plan
 * bij het VERWACHTE rendement precies opgaat (`gap ≈ 0`). De vraag verwordt
 * daarmee tot "haalt de markt exact je eigen aanname?" — een muntworp. Gemeten
 * over dezelfde persona met alleen andere uitgaven: 0,77 · 0,51 · 0,52 · 0,51 ·
 * 0,51. Structureel ~51%, ongeacht het plan.
 *
 * De marge stelt dezelfde vraag met de rollen omgedraaid: **de stopleeftijd
 * staat vast, het rendement is de onbekende**. Vind de verschuiving Δr waarbij
 * `computeGap(...)` door nul gaat; de marge is `−Δr`. Positief = speling
 * (het rendement mag zoveel tegenvallen), negatief = tekort (er is zoveel méér
 * rendement nodig).
 *
 * ## Het anker — en waarom het NIET de opgeloste FIRE-leeftijd is
 * Los je de marge op bij de opgeloste FIRE-leeftijd, dan is het antwoord per
 * constructie ≈ 0 — dezelfde val als de 50%-kans. Gemeten over zeven sterk
 * verschillende plannen: 0,00–0,03 procentpunt op de opgeloste leeftijd en
 * −0,06…+0,10 op de afgeronde. Het anker is daarom een VASTE, voor de gebruiker
 * betekenisvolle leeftijd:
 *
 *  0. **het VASTE stopmoment van het plan** (`KernelInput.stopAnker`, ADR 0129 D3) —
 *     staat het stopmoment vast (AOW · nu · zelfgekozen leeftijd), dan is dát het
 *     anker en wint een sliderwaarde er niet van.
 *  1. **de gekozen stopleeftijd** (`stopAge`, de stop-slider van /toekomst — ook
 *     de bron van de stop-marge-band en de doel-lijn). Dan meet de marge precies
 *     het plan dat de gebruiker maakt, en beweegt hij mee met de slider.
 *  2. **anders de AOW-leeftijd** (`ES!C15` = `persoon.aowLeeftijd`) — altijd
 *     bekend, komt niet uit de solver, en is de leeftijd waarop je "sowieso"
 *     stopt met werken. De copy benoemt dit anker expliciet.
 *
 * BEWUST NIET: de eindleeftijd van het plan. Daar is er geen onttrekkingsfase
 * meer om te toetsen — gemeten verzadigde de marge op ≥15pp voor vijf van de
 * zeven plannen.
 *
 * ## Degeneratie (zelfde regel als de vorige ronde, op het nieuwe anker)
 * Ligt het anker op of voorbij de eindleeftijd (P!B35), dan wordt er vóór het
 * meetpunt nooit onttrokken en is `gap ≥ 0` triviaal waar. De toets zegt dan
 * niets → `null`, en het oppervlak toont geen getal. Ligt het anker vóór de
 * startleeftijd, dan bestaat de run niet → ook `null`.
 *
 * ## Grondslag
 * Identiek aan de gap-toets die de marktcheck altijd al gebruikte: Prognose!J
 * (besteedbaar) voor deplete/perpetual, Prognose!I bij legacy met
 * "niet-liquide meetellen = Ja". De band eronder staat op Prognose!I (netto
 * vermogen, incl. eigen woning) — dat verschil is bestaand en wordt in de copy
 * met "(zonder huis)" benoemd, precies zoals bij het percentage.
 *
 * ## Oracle-pariteit
 * Volledig ADDITIEF: dit bestand raakt `engine`/`solver`/`gap`/`tables`/
 * `wrappers` niet aan en wordt door het fixture-pad nooit aangeroepen. De
 * verstoring loopt over hetzelfde invoer-pad als de scenarioband en de MC-ruis:
 * het rendement van de marktgevoelige potten, sinds ADR 0117 geschaald met de
 * markt-risicofactor van de pot. Geen tabel-wijziging.
 *
 * Pure module: geen fs/Supabase/Date.now/Math.random.
 */

import { RENDEMENT_MARGE_GRENS } from '@/lib/constants'
import { runKernelProjection } from './engine'
import { computeEs, type EsRow } from './tables/es'
import { computeGap, eindleeftijdVan } from './gap'
import { resolveVastAnker } from './solver'
import { potRisicoFactor } from './wrappers/risico'
import type { KernelInput } from './types'

/**
 * Aantal bisectie-stappen na het bepalen van het halve zoekinterval
 * (`[−GRENS, 0]` of `[0, +GRENS]`).
 *
 * **Tolerantie = ABSOLUUT, bewust.** De gezochte grootheid is zelf een
 * rendementsVERSCHIL; een relatieve tolerantie zou rond een marge van nul nooit
 * convergeren (en juist dáár zit het interessante gebied). De restonzekerheid is
 * `GRENS / 2^n` = 0,15/4096 ≈ 3,7·10⁻⁵ ≈ **0,004 procentpunt** — twee ordes
 * onder de weergaveprecisie van één decimaal (0,1pp), dus de getoonde waarde is
 * niet zoekruis-gevoelig. Kosten: `2 + n` volledige kernel-projecties (14 stuks,
 * ~0,2–0,35 s) tegenover 200 voor de band eromheen.
 */
export const RENDEMENT_MARGE_ITERATIES = 12

/**
 * Waar de vaste toets-leeftijd vandaan komt.
 *
 *  - `'nu'`/`'aow'`/`'anker'` — het plan heeft een VAST stopmoment (ADR 0129 D3):
 *    respectievelijk het `nu`-anker, het AOW-anker en een zelfgekozen stopleeftijd.
 *    Een meegegeven sliderwaarde wint daar NIET van; zie `resolveMargeAnker`.
 *  - `'stopkeuze'` — geen vast anker, maar de gebruiker verkent een stopmoment met
 *    de slider.
 *  - `'aow'` is óók de TERUGVAL zonder anker en zonder sliderwaarde (altijd bekend,
 *    komt niet uit de solver). Anker en terugval delen bewust één lid: de copy zegt
 *    in beide gevallen hetzelfde ("op je AOW-leeftijd"), en het onderscheid is voor
 *    de lezer betekenisloos.
 */
export type MargeAnker = 'stopkeuze' | 'aow' | 'nu' | 'anker'

/** De uitkomst van één marge-bepaling. */
export interface RendementMarge {
  /**
   * Decimaal per jaar (0,018 = 1,8 procentpunt). **Positief** = het rendement
   * mag zoveel tegenvallen voordat het plan omvalt; **negatief** = het plan valt
   * nú al om en er is zoveel méér rendement voor nodig.
   */
  readonly marge: number
  /** De vaste leeftijd waarop de toets is uitgevoerd. */
  readonly ankerLeeftijd: number
  /** Welk anker die leeftijd leverde (stuurt de copy). */
  readonly anker: MargeAnker
  /**
   * `'boven'`/`'onder'` wanneer de zoektocht `±RENDEMENT_MARGE_GRENS` raakte —
   * de echte marge ligt dan buiten het zoekbereik en de copy zegt "meer dan"
   * i.p.v. een schijnprecies getal. `null` = exact bepaald binnen het bereik.
   */
  readonly begrensd: 'boven' | 'onder' | null
}

/**
 * De vaste toets-leeftijd + zijn herkomst, of `null` bij degeneratie (anker op/
 * voorbij de eindleeftijd, of vóór de startleeftijd). Zie de moduledoc.
 */
export function resolveMargeAnker(
  input: KernelInput,
  stopAge: number | null | undefined,
  es: EsRow = computeEs(input),
): { readonly leeftijd: number; readonly anker: MargeAnker } | null {
  const eindleeftijd = eindleeftijdVan(es)

  // ── Ligt het stopmoment VAST? Dan is dát het anker (ADR 0129 D3) ─────────────
  // Een meegegeven sliderwaarde wint hier NIET van: de slider is een verkenning,
  // het anker is het plan. Vóór dit besluit overschreef de stop-slider het anker
  // van een pensioen-plan, waardoor de marge een ánder plan doorrekende dan de
  // hoofdlijn ernaast (bevinding 5 van het onderzoek van 3 sep 2026). Voor het
  // `nu`-anker bestond die bescherming al (ADR 0127 D6); nu geldt ze voor alle drie.
  const vastAnker = resolveVastAnker(input, es)
  if (vastAnker !== null) {
    if (vastAnker < input.startLeeftijd) return null
    if (vastAnker >= eindleeftijd) return null
    const soort = input.stopAnker?.soort
    return { leeftijd: vastAnker, anker: soort === 'nu' ? 'nu' : soort === 'aow' ? 'aow' : 'anker' }
  }

  // Legacy-staart (ADR 0127-selector 'Nu stoppen' zónder anker-blok); F4 verwijdert 'm.
  if (es.interneCode === 'nu') {
    const leeftijd = input.startLeeftijd
    if (leeftijd >= eindleeftijd) return null
    return { leeftijd, anker: 'nu' }
  }
  const gekozen = stopAge != null && Number.isFinite(stopAge)
  const leeftijd = gekozen ? stopAge : es.pensioenleeftijd
  if (!Number.isFinite(leeftijd)) return null
  if (leeftijd < input.startLeeftijd) return null
  if (leeftijd >= eindleeftijd) return null
  return { leeftijd, anker: gekozen ? 'stopkeuze' : 'aow' }
}

/**
 * P!B38 op de anker-leeftijd, met het rendement van élke marktgevoelige pot
 * verschoven met `delta · f` — dezelfde hefboom en dezelfde per-pot-schaling als de
 * scenarioband sinds ADR 0117 (`wrappers/risico.ts#potRisicoFactor`).
 *
 * De verstoring wordt PER POT in `pot.rendement` gebakken i.p.v. als scalar in
 * `onzekerheid.shift`, want een scalar kan de per-pot-factor niet dragen. Zonder
 * overlay is dat identiek: de factor is dan `investering ? 1 : 0`, en op elk pad dat
 * deze functie bereikt is `onzekerheid.shift` 0 (de app-adapter zet 'm op 0 en de
 * marktcheck raakt 'm niet), zodat `rendement + delta` precies het oude
 * `rendement + (shift + delta)` is.
 *
 * BETEKENIS van het getal na ADR 0117: de marge is de tegenvaller op een pot met
 * beta 1 — een MARKTbrede verschuiving, die per pot met zijn eigen risico
 * doorwerkt. Dat maakt band en marge weer dezelfde vraag over hetzelfde plan:
 * bleef de marge op de uniforme Δr staan, dan zou de band de pensioenpot wél
 * meenemen en de marge niet.
 */
function gapBijShift(input: KernelInput, es: EsRow, ankerLeeftijd: number, delta: number): number {
  const verschoven: KernelInput = {
    ...input,
    assetPotten: input.assetPotten.map((p) => {
      const factor = potRisicoFactor(p)
      return factor === 0 ? p : { ...p, rendement: p.rendement + delta * factor }
    }),
  }
  const proj = runKernelProjection(verschoven, { fireAge: ankerLeeftijd })
  // Het doelblok leest alleen start-/inflatie-parameters uit `input` (die de
  // shift niet raakt) plus de VERSCHOVEN projectie — identiek aan hoe
  // `wrappers/mc.ts` de MC-gap evalueert.
  return computeGap(input, es, proj, ankerLeeftijd)
}

/**
 * Bepaal de rendement-marge van dit plan op een vaste stopleeftijd. Zie de
 * moduledoc voor het anker, de degeneratie-regel en de grondslag.
 *
 * `null` = geen zinnige uitspraak (degeneratie) → het oppervlak toont niets.
 */
export function computeRendementMarge(
  input: KernelInput,
  stopAge?: number | null,
): RendementMarge | null {
  const es = computeEs(input)
  const anker = resolveMargeAnker(input, stopAge, es)
  if (anker === null) return null

  const gap = (delta: number) => gapBijShift(input, es, anker.leeftijd, delta)
  const basis = { ankerLeeftijd: anker.leeftijd, anker: anker.anker } as const

  // Houdt het plan het bij het verwachte rendement? Dat bepaalt in welke helft
  // van het zoekbereik de omslag ligt — en scheelt de helft van de bisectie.
  let lo: number
  let hi: number
  if (gap(0) >= 0) {
    if (gap(-RENDEMENT_MARGE_GRENS) >= 0) {
      return { ...basis, marge: RENDEMENT_MARGE_GRENS, begrensd: 'boven' }
    }
    lo = -RENDEMENT_MARGE_GRENS // gap < 0
    hi = 0 // gap ≥ 0
  } else {
    if (gap(RENDEMENT_MARGE_GRENS) < 0) {
      return { ...basis, marge: -RENDEMENT_MARGE_GRENS, begrensd: 'onder' }
    }
    lo = 0 // gap < 0
    hi = RENDEMENT_MARGE_GRENS // gap ≥ 0
  }

  // Invariant: gap(lo) < 0 ≤ gap(hi). `hi` convergeert naar de kleinste
  // verschuiving waarbij het plan nog net standhoudt; de marge is het spiegelbeeld.
  for (let i = 0; i < RENDEMENT_MARGE_ITERATIES; i++) {
    const mid = (lo + hi) / 2
    if (gap(mid) >= 0) hi = mid
    else lo = mid
  }

  return { ...basis, marge: -hi, begrensd: null }
}
