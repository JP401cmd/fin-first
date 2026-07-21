/**
 * Nederlandse schenk- & erfbelasting (jaargelaagd). Pure functions.
 * Afgesplitst van lib/horizon-data.ts (pure move, geen gedragswijziging).
 */
import type { CatalogFieldOption } from './life-events-catalog'

export interface SchenkErfRate {
  /** Tarief schijf 1 (t/m de schijfgrens) */
  laag: number
  /** Tarief schijf 2 (boven de schijfgrens) */
  hoog: number
}

export interface SchenkErfYearParams {
  /** Schijfgrens (tariefgrens schijf 1 → 2) — identiek voor schenk- én erfbelasting binnen een jaar */
  grens: number
  schenking: {
    /** Jaarlijkse vrijstelling per ontvanger-relatie */
    vrijstelling: Record<string, number>
    /** Eenmalig verhoogde vrijstelling kind 18-40 (vrij besteedbaar) */
    eenmaligVerhoogdKind: number
  }
  erfbelasting: {
    /** Vrijstelling per relatie tot de erflater */
    vrijstelling: Record<string, number>
  }
}

/** Schenkbelasting tariefpercentages per tariefgroep (jaaronafhankelijk). */
export const SCHENK_TARIEVEN_RATES: Record<string, SchenkErfRate> = {
  kind: { laag: 0.10, hoog: 0.20 },
  kleinkind: { laag: 0.18, hoog: 0.36 },
  overig: { laag: 0.30, hoog: 0.40 },
}

/** Erfbelasting tariefpercentages per tariefgroep (jaaronafhankelijk). */
export const ERF_TARIEVEN_RATES: Record<string, SchenkErfRate> = {
  partner: { laag: 0.10, hoog: 0.20 },
  kind: { laag: 0.10, hoog: 0.20 },
  kleinkind: { laag: 0.18, hoog: 0.36 },
  overig: { laag: 0.30, hoog: 0.40 },
}

/**
 * Jaargelaagde schenk- & erfbelastingparameters (Belastingdienst).
 *
 * Per jaar geverifieerd tegen de officiële tariefbladen:
 *  - 2024: schenk kind €6.633 / overig €2.658; eenmalig verhoogd €31.813;
 *          erf partner €795.156 / kind €25.187 / overig €2.658; schijfgrens €152.368.
 *  - 2025: schenk kind €6.713 / overig €2.690; eenmalig verhoogd €32.195;
 *          erf partner €804.698 / kind €25.490 / overig €2.690; schijfgrens €154.197.
 *  - 2026: schenk kind €6.908 / overig €2.769; eenmalig verhoogd €33.129;
 *          erf partner €828.035 / kind €26.230 / overig €2.769; schijfgrens €158.669.
 */
export const SCHENK_ERF_PARAMS: Record<number, SchenkErfYearParams> = {
  2024: {
    grens: 152_368,
    schenking: { vrijstelling: { kind: 6_633, kleinkind: 2_658, overig: 2_658 }, eenmaligVerhoogdKind: 31_813 },
    erfbelasting: { vrijstelling: { partner: 795_156, kind: 25_187, kleinkind: 25_187, overig: 2_658 } },
  },
  2025: {
    grens: 154_197,
    schenking: { vrijstelling: { kind: 6_713, kleinkind: 2_690, overig: 2_690 }, eenmaligVerhoogdKind: 32_195 },
    erfbelasting: { vrijstelling: { partner: 804_698, kind: 25_490, kleinkind: 25_490, overig: 2_690 } },
  },
  2026: {
    grens: 158_669,
    schenking: { vrijstelling: { kind: 6_908, kleinkind: 2_769, overig: 2_769 }, eenmaligVerhoogdKind: 33_129 },
    erfbelasting: { vrijstelling: { partner: 828_035, kind: 26_230, kleinkind: 26_230, overig: 2_769 } },
  },
}

/**
 * Kies de schenk-/erfbelastingparameters voor een jaar. Default = lopend jaar.
 * Fallback bij onbekend/toekomstig jaar: het dichtstbijzijnde bekende jaar ≤ het
 * gevraagde jaar (en anders het vroegst bekende jaar). Zo blijft 2027 op 2026-
 * niveau tot er een 2027-laag wordt toegevoegd.
 */
export function resolveSchenkErfParams(jaar: number = new Date().getFullYear()): SchenkErfYearParams {
  const exact = SCHENK_ERF_PARAMS[jaar]
  if (exact) return exact
  const years = Object.keys(SCHENK_ERF_PARAMS).map(Number).sort((a, b) => a - b)
  const eerdere = years.filter((y) => y <= jaar)
  const gekozen = eerdere.length > 0 ? eerdere[eerdere.length - 1] : years[0]
  return SCHENK_ERF_PARAMS[gekozen]
}

/** Bereken schenkbelasting per ontvanger (jaar default = lopend jaar). */
export function berekenSchenkbelasting(bedrag: number, relatie: string, jaar: number = new Date().getFullYear()): { vrijstelling: number; belastbaar: number; belasting: number } {
  const params = resolveSchenkErfParams(jaar)
  const vrijstelling = params.schenking.vrijstelling[relatie] ?? params.schenking.vrijstelling.overig
  const rate = SCHENK_TARIEVEN_RATES[relatie] ?? SCHENK_TARIEVEN_RATES.overig
  const belastbaar = Math.max(0, bedrag - vrijstelling)
  if (belastbaar <= 0) return { vrijstelling, belastbaar: 0, belasting: 0 }
  const laagDeel = Math.min(belastbaar, params.grens)
  const hoogDeel = Math.max(0, belastbaar - params.grens)
  const belasting = Math.round(laagDeel * rate.laag + hoogDeel * rate.hoog)
  return { vrijstelling, belastbaar, belasting }
}

/** Bereken erfbelasting op basis van bruto erfenis en relatie tot erflater (jaar default = lopend jaar). */
export function berekenErfbelasting(brutoBedrag: number, relatie: string, jaar: number = new Date().getFullYear()): {
  vrijstelling: number; belastbaar: number; belastingLaag: number; belastingHoog: number; totaalBelasting: number; netto: number; effectiefTarief: number
} {
  const params = resolveSchenkErfParams(jaar)
  const vrijstelling = params.erfbelasting.vrijstelling[relatie] ?? params.erfbelasting.vrijstelling.overig
  const rate = ERF_TARIEVEN_RATES[relatie] ?? ERF_TARIEVEN_RATES.overig
  const belastbaar = Math.max(0, brutoBedrag - vrijstelling)
  if (belastbaar <= 0) {
    return { vrijstelling, belastbaar: 0, belastingLaag: 0, belastingHoog: 0, totaalBelasting: 0, netto: brutoBedrag, effectiefTarief: 0 }
  }
  const laagDeel = Math.min(belastbaar, params.grens)
  const hoogDeel = Math.max(0, belastbaar - params.grens)
  const belastingLaag = Math.round(laagDeel * rate.laag)
  const belastingHoog = Math.round(hoogDeel * rate.hoog)
  const totaalBelasting = belastingLaag + belastingHoog
  const netto = brutoBedrag - totaalBelasting
  const effectiefTarief = brutoBedrag > 0 ? Math.round((totaalBelasting / brutoBedrag) * 1000) / 10 : 0
  return { vrijstelling, belastbaar, belastingLaag, belastingHoog, totaalBelasting, netto, effectiefTarief }
}

// ── Generator-functies voor UI-teksten (uit SCHENK_ERF_PARAMS, geen losse literals) ──

/** Formatteer een vrijstellingsbedrag als "€25.490" (nl-NL, geen decimalen). */
function formatVrijstellingEuro(n: number): string {
  return '€' + n.toLocaleString('nl-NL')
}

/** Tip-tekst voor de erfenis-prefab, samengesteld uit SCHENK_ERF_PARAMS. */
export function formatErfenisTipTekst(jaar: number = new Date().getFullYear()): string {
  const p = resolveSchenkErfParams(jaar).erfbelasting.vrijstelling
  return `Negatieve kosten = je ontvangt geld. Erfbelasting ${jaar}: 10–20% (kinderen), 30–40% (overig). Vrijstellingen: kind ${formatVrijstellingEuro(p.kind)}, partner ${formatVrijstellingEuro(p.partner)} (Belastingdienst).`
}

/** Select-opties (relatie tot erflater) met vrijstelling in het label, uit SCHENK_ERF_PARAMS. */
export function formatErfenisRelatieOpties(jaar: number = new Date().getFullYear()): CatalogFieldOption[] {
  const p = resolveSchenkErfParams(jaar).erfbelasting.vrijstelling
  return [
    { value: 'kind', label: `Kind (vrijstelling ${formatVrijstellingEuro(p.kind)})` },
    { value: 'partner', label: `Partner (vrijstelling ${formatVrijstellingEuro(p.partner)})` },
    { value: 'kleinkind', label: `Kleinkind (vrijstelling ${formatVrijstellingEuro(p.kleinkind)})` },
    { value: 'overig', label: 'Overig familielid / geen familie' },
  ]
}

/** Tip-tekst voor de relatie-select, samengesteld uit SCHENK_ERF_PARAMS. */
export function formatErfenisRelatieTip(jaar: number = new Date().getFullYear()): string {
  const p = resolveSchenkErfParams(jaar).erfbelasting.vrijstelling
  return `Kind/kleinkind: vrijstelling ${formatVrijstellingEuro(p.kind)}, tarief 10–20%. Partner: vrijstelling ${formatVrijstellingEuro(p.partner)}, tarief 10–20%. Overig: vrijstelling ${formatVrijstellingEuro(p.overig)}, tarief 30–40% (Belastingdienst, ${jaar}).`
}
