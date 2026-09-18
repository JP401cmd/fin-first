// lib/horizon/haalbare-uitgave.ts
//
// DE HAALBARE UITGAVE NA PENSIOEN (spec 2026-09-18, ADR 0160)
// ───────────────────────────────────────────────────────────────────────────
// Onder een VAST stopmoment is de vraag niet "wanneer kan ik stoppen?" maar "reikt mijn
// geld tot mijn eindleeftijd?". Deze module beantwoordt de omgekeerde vraag: bij wélke
// uitgave na pensioen reikt het precies tot daar. Minder dan je nu rekent bij een tekort,
// méér bij een overschot.
//
// WAAROM EEN GEPATCHTE PROFIELRIJ EN NIET ÉÉN VELD OP DE KernelInput:
// `buildInkomenUitgaven` leidt bij actieve flex-spending óók `flexNiceFractiePerJaar` af
// uit `uitgaveNaPensioenPerJaar` (`deriveNiceFractie`). Alleen dat ene veld overschrijven
// laat de nice-fractie op de oude stand staan en trekt daarmee de must/nice-split stil
// scheef. Door per iteratie de KernelInput te herbouwen uit een profielrij met
// `retirement_expense_method: 'custom_amount'` herleidt de adapter alles consistent — en
// het is exact hetzelfde mechanisme als de draaiknop "Uitgave na pensioen", dus het
// beloofde getal en wat de slider doorrekent zijn dezelfde run.
//
// "GEDEKT" IS DE KERNEL Z'N EIGEN OORDEEL: we lezen `SolveFireResult.status` en herhalen
// de formule uit `computeStatusBlok` (`tekortLening > 0 ∥ gap < 0 ∥ doelbedrag < 0`) niet.

import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { LifeEvent } from '@/lib/horizon-data'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import {
  buildConvergentieAdapterProfile,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import { buildKernelInputFromApp, type KernelAdapterPartner } from '@/lib/horizon-kernel/adapter'
import { solveFire, type SolverStatus } from '@/lib/horizon-kernel/solver'

/** De drie statussen die de kern onder een vast anker zet bij een tekort. */
const SHORTFALL: ReadonlySet<SolverStatus> = new Set<SolverStatus>([
  'anchor_shortfall',
  'stop_now_shortfall',
  'pension_shortfall',
])

/** Bisectie-precisie in €/jaar — fijner dan de sliderstap, zodat het antwoord niet op de stap afrondt. */
const PRECISIE = 50
/** Bovengrens van de zoekruimte: 3 × wat je nu rekent. Daarboven klemmen we. */
const BOVENGRENS_FACTOR = 3
/** Eén stap van de draaiknop (€ 50/mnd) — de afstand waarop de vangrail toetst. */
const SLIDER_STAP = 600

/**
 * Verschil waaronder we geen richting meer claimen. Gespiegeld aan de € 500-regel van de
 * eindvermogen-badge (ADR 0145 M5): zonder drempel toont een plan dat feitelijk klopt een
 * rode of groene regel over een paar euro per jaar.
 */
export const HAALBARE_UITGAVE_DREMPEL = 250

export interface HaalbareUitgave {
  /** €/jaar waarbij het plan precies tot de eindleeftijd reikt (nominaal, jaar-0-euro's). */
  readonly perJaar: number
  /** De eindleeftijd waartegen gesolved is — de eind-vorm van het plan. */
  readonly eindleeftijd: number
  /** De uitgave na pensioen waarmee het plan vandaag rekent. */
  readonly huidigPerJaar: number
  /** Richting t.o.v. `huidigPerJaar`, ná de drempel. */
  readonly richting: 'minder' | 'meer' | 'gelijk'
}

export interface HaalbareUitgaveContext {
  profile: ConvergentieRawProfileRow
  assets: readonly Asset[]
  debts: readonly Debt[]
  lifeEvents: readonly LifeEvent[]
  aowRows?: readonly AowLeeftijdRow[]
  /** TPR-07 — partnerblok van de hoofdrun (huishoudperspectief); afwezig ⇒ solo. */
  partner?: KernelAdapterPartner
}

/** De KernelInput van deze context, met (optioneel) een afgedwongen uitgave na pensioen. */
function inputMet(ctx: HaalbareUitgaveContext, bedrag: number | null) {
  const profile =
    bedrag == null
      ? ctx.profile
      : {
          ...ctx.profile,
          retirement_expense_method: 'custom_amount',
          retirement_expense_custom_amount: bedrag,
        }
  return buildKernelInputFromApp({
    profile: buildConvergentieAdapterProfile(profile),
    assets: ctx.assets,
    debts: ctx.debts,
    lifeEvents: ctx.lifeEvents,
    aowRows: ctx.aowRows,
    ...(ctx.partner ? { partner: ctx.partner } : {}),
  })
}

/** Dekt het plan tot de eindleeftijd bij deze uitgave? Plus de eindleeftijd van die run. */
function dekking(ctx: HaalbareUitgaveContext, bedrag: number): { ok: boolean; eindleeftijd: number } {
  const solve = solveFire(inputMet(ctx, bedrag))
  return { ok: !SHORTFALL.has(solve.status), eindleeftijd: solve.eindleeftijd }
}

function maak(perJaar: number, huidigPerJaar: number, eindleeftijd: number): HaalbareUitgave {
  const delta = perJaar - huidigPerJaar
  const richting =
    Math.abs(delta) < HAALBARE_UITGAVE_DREMPEL ? 'gelijk' : delta < 0 ? 'minder' : 'meer'
  return { perJaar, eindleeftijd, huidigPerJaar, richting }
}

/**
 * De uitgave na pensioen (€/jaar) waarbij het plan precies tot de eindleeftijd reikt.
 *
 * `null` wanneer de vraag niet gesteld kan worden: geen vast stopmoment (dan ís de
 * hoofdrun het antwoord), geen uitgave-grondslag, een tekort dat al vóór het stopmoment
 * zit (ook € 0 uitgeven dekt niet — daar helpen alleen de bestaande drie hefbomen), of
 * een kern-fout. Zelfde degradatie als `solveWithoutAnchor`: liever geen getal dan een
 * getal dat niet klopt.
 *
 * KOSTEN: ~14 geankerde runs. Onder een vast anker kórtsluit `solveFire` (geen binnenste
 * bisectie), dus dit is een fractie van wat de scenario-batch toch al doet — en het
 * draait in diezelfde ene worker-oversteek (ADR 0129 D7).
 */
export function solveHaalbareUitgave(ctx: HaalbareUitgaveContext): HaalbareUitgave | null {
  try {
    const basis = inputMet(ctx, null)
    if (basis.stopAnker === undefined) return null
    const huidig = basis.inkomenUitgaven.uitgaveNaPensioenPerJaar
    if (!Number.isFinite(huidig) || huidig <= 0) return null

    // Ondergrens van de zoekruimte. Dekt zelfs € 0 niet, dan zit het tekort vóór het
    // stopmoment en is de uitgave na pensioen niet de knop die het oplost.
    const nul = dekking(ctx, 0)
    if (!nul.ok) return null
    const eindleeftijd = nul.eindleeftijd

    // Bovengrens. Dekt 3× ook nog, dan klemmen we daar — de slider-tekst meldt dat het
    // bedrag boven het bereik ligt; de regel doet geen belofte over de klem.
    const hoogBedrag = huidig * BOVENGRENS_FACTOR
    if (dekking(ctx, hoogBedrag).ok) return maak(Math.floor(hoogBedrag), huidig, eindleeftijd)

    let laag = 0
    let hoog = hoogBedrag
    while (hoog - laag > PRECISIE) {
      const mid = (laag + hoog) / 2
      if (dekking(ctx, mid).ok) laag = mid
      else hoog = mid
    }
    const gevonden = Math.floor(laag)

    // Monotonie-vangrail. De dekking hóórt monotoon af te nemen in de uitgave; is dat
    // door een discontinuïteit (woningverkoop, potregel) niet zo, dan zegt dit getal
    // niets. Eén extra run, precies de eigenschap die we beloven: één sliderstap hoger
    // dekt niet meer.
    if (dekking(ctx, gevonden + SLIDER_STAP).ok) return null

    return maak(gevonden, huidig, eindleeftijd)
  } catch {
    return null
  }
}
