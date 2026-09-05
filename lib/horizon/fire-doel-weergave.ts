// lib/horizon/fire-doel-weergave.ts
//
// ÉÉN bron voor de ANDERE helft van het kernantwoord van /toekomst: het
// FIRE-doelbedrag in de hero-KPI, het label rechts van de voortgangsbalk en het
// onderschrift eronder. De tweelingbroer van `lib/horizon/hero-fire-age.ts`, die
// het MOMENT bewaakt — en die daar zelf al over zegt: "het moment en het doel
// zijn twee helften van hetzelfde kernantwoord".
//
// AANLEIDING (UR3-07 defect 3, 05-09-2026): een gebruiker zag eerst
// "€ 140.000 · voorlopig" en ~15 seconden later "ca. € 620.000". Niet omdat de
// gegevens wijzigden en niet omdat er een tweede MOTOR meerekende — de server-
// en de clientrun krijgen dezelfde context — maar omdat de tegel vóór en ná de
// worker-run een ánder KERNELVELD las:
//
//   • eerste paint : Prognose!J = de benodigde LIQUIDE portefeuille (zónder huis)
//   • na de run    : Prognose!I = het benodigde NETTO VERMOGEN (MÉT huis)
//
// en `I = J + (niet-liquide bezit − niet-liquide schuld)`. Bij `include_full`
// is dat verschil nul (I ≡ J), maar zodra de woonstrategie de woning niet-
// liquide maakt (`exclude_from_fire`, `downsize`, `reverse_mortgage`) loopt het
// op: gemeten 1,31× op een gewone fixture en 15× op een huis-zware
// `downsize/on_depletion` (J € 54.429 → I € 620.050).
//
// Het is dus dezelfde fout als de vermogensgrafiek-regel uit CLAUDE.md ("meng
// `nettoVermogen` en de liquide/FIRE-eligible portefeuille nooit op één as"),
// alleen langs de TIJD-as in plaats van de ruimte-as: één tegel, twee
// grootheden, een kwartier ertussen.
//
// DE REGEL DIE DEZE MODULE AFDWINGT: er is precies één plek die kiest wélke van
// de twee grootheden op het scherm komt, die keuze hangt uitsluitend aan de
// WOONSTRATEGIE (niet aan de vraag of de worker al geland is), en het
// onderschrift benoemt de grootheid die er wérkelijk staat — óók tijdens de
// eerste paint. Een terugval die stil van grondslag wisselt bestaat hier niet:
// wisselt de grondslag, dan wisselt het onderschrift mee.

/** Wélke grootheid het getoonde bedrag IS. */
export type FireDoelGrondslag =
  /** Prognose!I — benodigd netto vermogen MÉT de eigen woning. */
  | 'incl-huis'
  /** Prognose!J — benodigde liquide portefeuille ZONDER de eigen woning. */
  | 'excl-huis'

/** Uit wélke run het bedrag komt. `null` als er geen bedrag is. */
export type FireDoelBron =
  /** De client-kernelrun (`simResult`) — canoniek, async via de web worker. */
  | 'kernel'
  /** De server-kernelrun (`HorizonPageData`) — dezelfde motor, al bij de eerste paint. */
  | 'server-kernel'

/** Hoe hard is het getoonde bedrag? Zelfde woordenschat als `HeroAnswerStatus`. */
export type FireDoelStatus =
  /** De client-kernelrun heeft geantwoord; dit bedrag verandert niet meer vanzelf. */
  | 'definitief'
  /** De server-kernelrun — dezelfde motor en dezelfde grondslag, maar de clientrun kan nog verfijnen. */
  | 'voorlopig'
  /** Geen van beide runs leverde een doel (o.a. onder een vast anker, ADR 0129 D4). */
  | 'onbekend'

export interface FireDoelWeergave {
  /**
   * Het NOMINALE doelbedrag zoals de tegel en het balk-label het tonen; `0`
   * wanneer er geen doel te noemen is (`guardFireTarget` maakt daar dan een
   * gegevensmelding van — dat is bewust niet de taak van deze module).
   */
  bedrag: number
  /**
   * Wélke grootheid `bedrag` IS — nadrukkelijk niet welke er gevráágd werd.
   * Voedt het onderschrift, zodat label en getal niet uit elkaar kunnen lopen.
   */
  grondslag: FireDoelGrondslag
  bron: FireDoelBron | null
  status: FireDoelStatus
  /**
   * Het doel MÉT eigen woning (Prognose!I), client-kernel vóór server-kernel.
   * `null` = geen van beide runs leverde het. Eén home, zodat de dubbele-
   * doelweergave (`showDualFireTarget`) dezelfde paar-samenvoeging gebruikt als
   * het enkelvoudige bedrag hierboven — en dus óók al bij de eerste paint kan
   * verschijnen in plaats van de tegel van vórm te laten verspringen.
   */
  inclHuis: number | null
  /** Het doel ZONDER eigen woning (Prognose!J), client-kernel vóór server-kernel. */
  exclHuis: number | null
}

export interface FireDoelWeergaveInput {
  /**
   * Staat de eigen woning volledig BUITEN de FIRE-grondslag? (`hasEigenHuis &&
   * isHomeExcludedFromFire(...)`) — dezelfde vlag die de noemer van
   * `computeFreedomProgressWithBasis` kiest, zodat de balk-vulling en het
   * balk-label per constructie dezelfde grondslag dragen.
   */
  homeExcludedFromProgress: boolean
  /** `simResult.requiredFireNetWorth` — Prognose!I uit de CLIENT-kernelrun. */
  kernelRequiredNetWorthInclHome?: number | null
  /** `simResult.requiredFirePortfolio` — Prognose!J uit de CLIENT-kernelrun. */
  kernelRequiredPortfolioExclHome?: number | null
  /** `HorizonPageData.requiredNetWorthInclHome` — Prognose!I uit de SERVER-kernelrun. */
  serverRequiredNetWorthInclHome?: number | null
  /** `HorizonPageData.requiredPortfolioExclHome` — Prognose!J uit de SERVER-kernelrun. */
  serverRequiredPortfolioExclHome?: number | null
}

/**
 * Het onderschrift per grondslag — de woorden staan bewust náást de keuze die
 * ze beschrijven. Zou de tegel ze zelf uitschrijven, dan kan een latere terugval
 * het bedrag verzetten zonder het label mee te nemen; precies het tweede,
 * verzwarende deel van UR3-07 defect 3 (het J-bedrag stond onder het bijschrift
 * "benodigd — met je huis").
 */
export const FIRE_DOEL_ONDERSCHRIFT: Record<FireDoelGrondslag, string> = {
  'incl-huis': 'benodigd — met je huis',
  'excl-huis': 'benodigd — zonder je huis',
}

/** Kernel wint van server; `null`/`undefined` telt als "niet geleverd". */
function kies(
  kernel: number | null | undefined,
  server: number | null | undefined,
): { waarde: number; bron: FireDoelBron } | null {
  if (kernel != null) return { waarde: kernel, bron: 'kernel' }
  if (server != null) return { waarde: server, bron: 'server-kernel' }
  return null
}

const STATUS_VAN_BRON: Record<FireDoelBron, FireDoelStatus> = {
  kernel: 'definitief',
  'server-kernel': 'voorlopig',
}

/**
 * Bepaalt welk doelbedrag de /toekomst-tegel toont, uit wélke grootheid het
 * komt en hoe hard het is.
 *
 * De volgorde is bewust en in beide takken dezelfde: eerst de client-kernelrun,
 * dan de SERVER-kernelrun (dezelfde motor, expliciet voorlopig), dan niets.
 * Wat er NIET meer gebeurt is per grondslag naar de ándere grootheid uitwijken:
 * in de excl.-huis-tak komt nooit een incl.-huis-bedrag te staan, en in de
 * incl.-huis-tak wijkt hij pas naar Prognose!J uit als geen van beide runs een
 * Prognose!I leverde — en dán verhuist het onderschrift mee.
 */
export function resolveFireDoelWeergave(input: FireDoelWeergaveInput): FireDoelWeergave {
  const incl = kies(input.kernelRequiredNetWorthInclHome, input.serverRequiredNetWorthInclHome)
  const excl = kies(input.kernelRequiredPortfolioExclHome, input.serverRequiredPortfolioExclHome)
  const paar = { inclHuis: incl?.waarde ?? null, exclHuis: excl?.waarde ?? null }

  // EXCL.-tak (`exclude_from_fire`): de woning telt niet mee, dus het liquide
  // doel is het antwoord — en er is geen incl.-huis-terugval, want die zou een
  // grotere grootheid onder hetzelfde label zetten.
  if (input.homeExcludedFromProgress) {
    if (excl == null) return { bedrag: 0, grondslag: 'excl-huis', bron: null, status: 'onbekend', ...paar }
    return {
      bedrag: excl.waarde,
      grondslag: 'excl-huis',
      bron: excl.bron,
      status: STATUS_VAN_BRON[excl.bron],
      ...paar,
    }
  }

  // INCL.-tak (de standaard: `include_full`, `downsize`, `reverse_mortgage`) —
  // het volle netto vermogen bij FIRE, want de woning wordt uiteindelijk ingezet.
  if (incl != null) {
    return {
      bedrag: incl.waarde,
      grondslag: 'incl-huis',
      bron: incl.bron,
      status: STATUS_VAN_BRON[incl.bron],
      ...paar,
    }
  }
  // Geen enkele Prognose!I in de hand: liever het liquide doel MET het
  // bijpassende onderschrift dan een "met je huis"-belofte bij een bedrag dat
  // het huis niet bevat.
  if (excl != null) {
    return {
      bedrag: excl.waarde,
      grondslag: 'excl-huis',
      bron: excl.bron,
      status: STATUS_VAN_BRON[excl.bron],
      ...paar,
    }
  }
  return { bedrag: 0, grondslag: 'incl-huis', bron: null, status: 'onbekend', ...paar }
}
