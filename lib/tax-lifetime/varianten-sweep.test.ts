/**
 * De variantensweep — bewijst de vijf claims waarop deze laag staat of valt:
 *
 *  1. **De V1-val.** De vier `WITHDRAWAL_ORDER_PRESETS` zijn GEEN geldige sweep-as:
 *     `liquide-eerst` en `pensioen-sparen` vallen ná de kernel-mapping samen op één
 *     prio-vector (`Math.min(i+1, 4)`). De drie prio-overlays doen dat aantoonbaar
 *     NIET. Zonder deze test zou de feature "pensioen als laatste bespaart € 0"
 *     kunnen tonen — een mapping-artefact dat als fiscale waarheid leest.
 *  2. De referentievariant draait op de ONGEWIJZIGDE `pot_rules`.
 *  3. De rangschik-regel, inclusief béide diskwalificaties en hun onderlinge
 *     voorrang.
 *  4. Het eindvermogen komt mee (harde eis: zonder dat getal beloont een nominale
 *     belasting-ranking "eerder door je geld heen zijn").
 *  5. End-to-end op een echte persona-fixture: drie kernel-runs, een volledig
 *     ingevuld contract, en de pensioen-knop die echt BIJT.
 *
 * Tolerantie-keuze: waar de claim een IDENTITEIT is (referentie ≡ ongewijzigde
 * run, prio-vectoren gelijk/ongelijk) wordt EXACT vergeleken — een tolerantie zou
 * daar precies de foutklasse verbergen die de test moet vangen.
 */

import { describe, expect, it } from 'vitest'
import { CURRENT_TAX_YEAR } from '@/lib/box3-data'
import {
  WITHDRAWAL_ORDER_PRESETS,
  potRulesToRaw,
  resolvePotRules,
  POT_RULES_DEFAULTS,
  type PotRulesConfig,
} from '@/lib/pot-rules'
import { buildTsParams } from '@/lib/horizon-kernel/adapter/prio-overgang'
import type { AssetPot, DebtPot, TsBezitCategorie } from '@/lib/horizon-kernel/types'
import {
  computeConvergentieProjection,
  type ConvergentieRawContext,
  type ConvergentieRawProfileRow,
} from '@/lib/horizon-kernel/convergentie-router'
import { computeLifetimeTax } from './lifetime-tax'
import {
  VARIANT_SPECS,
  REFERENTIE_VARIANT_ID,
  buildVariantProfile,
  bepaalDiskwalificatie,
  kiesWinnaar,
  finaliseerVarianten,
  runVariantenSweep,
  variantenSweepInputHash,
  type VariantId,
  type VariantUitkomst,
  type VariantenSweepSnapshot,
} from './varianten-sweep'
import {
  buildCompleetHorizonFixture,
  buildCompleetKernelProfileBase,
} from '@/lib/regression-tests/horizon-strategie/persona-fixture'

// ── Hulpjes ──────────────────────────────────────────────────────────────────

/** Gepinde leeftijd van de persona-fixture (deterministisch, zie persona-fixture). */
const PINNED_AGE = 42

const GEEN_POTTEN: readonly AssetPot[] = []
const GEEN_SCHULDEN: readonly DebtPot[] = []

/** Prio-vector voor de onttrekking, zoals de kern hem ziet (categorie → prio). */
function onttrekkingsPrios(potRules: PotRulesConfig): Record<string, number> {
  const params = buildTsParams(potRules, GEEN_POTTEN, GEEN_SCHULDEN, true)
  const out: Record<string, number> = {}
  for (const c of params.bezitCategorien as readonly TsBezitCategorie[]) {
    out[c.categorie] = c.prioOnttrekking
  }
  return out
}

/** Profiel met een gegeven pot-regel-config in de rauwe jsonb-vorm. */
function profielMet(potRules: PotRulesConfig): ConvergentieRawProfileRow {
  return { ...buildCompleetKernelProfileBase(PINNED_AGE), pot_rules: potRulesToRaw(potRules) }
}

/** Minimale variant-uitkomst voor de pure rangschik-tests. */
function uitkomst(p: {
  id: VariantId
  totaal: number | null
  fire?: number | null
  buffer?: number | null
}): VariantUitkomst {
  return {
    id: p.id,
    label: p.id,
    onttrekkingOverlay: p.id === REFERENTIE_VARIANT_ID ? null : { Pensioen: 5 },
    isReferentie: p.id === REFERENTIE_VARIANT_ID,
    levenslangeBox3Nominaal: p.totaal,
    levenslangeBox1NietVerrekendNominaal: 0,
    levenslangeTotaleDrukNominaal: p.totaal,
    fireAgeFractional: p.fire === undefined ? 60 : p.fire,
    eindvermogenNettoNominaal: 100_000,
    eindvermogenBelegbaarNominaal: 80_000,
    laagsteBuffer: p.buffer === undefined || p.buffer === null ? null : { bedrag: p.buffer, age: 70 },
    diskwalificatie: null,
    kernelFout: p.totaal === null ? 'kern-fout' : null,
  }
}

// ── 1. De V1-val: waaróm dit geen preset-sweep is ────────────────────────────

describe('de V1-val — presets zijn geen geldige sweep-as', () => {
  it('liquide-eerst en pensioen-sparen leveren ná de mapping een IDENTIEKE prio-vector', () => {
    const liquideEerst = WITHDRAWAL_ORDER_PRESETS.find((p) => p.id === 'liquide-eerst')
    const pensioenSparen = WITHDRAWAL_ORDER_PRESETS.find((p) => p.id === 'pensioen-sparen')
    expect(liquideEerst).toBeDefined()
    expect(pensioenSparen).toBeDefined()

    // De volgordes verschillen wél degelijk: pensioen staat 4e vs. 5e.
    expect(liquideEerst!.order).not.toEqual(pensioenSparen!.order)
    expect(liquideEerst!.order.indexOf('pensioen')).toBe(3)
    expect(pensioenSparen!.order.indexOf('pensioen')).toBe(4)

    // …maar `orderedGroupsToPrio` klemt op min(i+1, 4), dus positie 4 en 5 vallen
    // samen. De kern ziet TWEE KEER exact dezelfde onttrekkingsvolgorde.
    const a = onttrekkingsPrios({ ...POT_RULES_DEFAULTS, withdrawalOrderGroups: liquideEerst!.order })
    const b = onttrekkingsPrios({ ...POT_RULES_DEFAULTS, withdrawalOrderGroups: pensioenSparen!.order })
    expect(a).toEqual(b)
    expect(a.Pensioen).toBe(4)
    expect(b.Pensioen).toBe(4)
  })

  it('de drie sweep-varianten leveren wél aantoonbaar verschillende prio-vectoren', () => {
    // Bewust via het ECHTE pad: buildVariantProfile → resolvePotRules (incl.
    // `sanitizeCategoriePrios`, die 1..5 valideert) → buildTsParams. Een overlay
    // die onderweg wordt weggesaneerd zou hier zichtbaar worden.
    const profiel = profielMet({ ...POT_RULES_DEFAULTS })
    const vectoren = VARIANT_SPECS.map((spec) =>
      onttrekkingsPrios(resolvePotRules(buildVariantProfile(profiel, spec))),
    )

    // Variant 2 (reserve) en variant 3 (eerst) zijn de fiscale uitersten.
    expect(vectoren[1].Pensioen).toBe(5)
    expect(vectoren[2].Pensioen).toBe(1)
    expect(vectoren[1]).not.toEqual(vectoren[2])
    // …en beide wijken af van de referentie (die op de orde-afleiding blijft).
    expect(vectoren[0].Pensioen).toBe(4)
    expect(vectoren[0]).not.toEqual(vectoren[1])
    expect(vectoren[0]).not.toEqual(vectoren[2])

    // De overlay raakt UITSLUITEND Pensioen — de rest van de volgorde blijft staan.
    for (const cat of ['Spaargeld', 'Beleggingen', 'Vastgoed', 'Overig', 'Eigen huis']) {
      expect(vectoren[1][cat]).toBe(vectoren[0][cat])
      expect(vectoren[2][cat]).toBe(vectoren[0][cat])
    }
  })
})

// ── 2. De referentie draait op de ongewijzigde pot_rules ─────────────────────

describe('referentievariant', () => {
  it('krijgt het profiel ONAANGERAAKT terug (dezelfde objectreferentie)', () => {
    const profiel = profielMet({ ...POT_RULES_DEFAULTS, surplusGroup: 'spaargeld' })
    const spec = VARIANT_SPECS.find((s) => s.id === REFERENTIE_VARIANT_ID)!
    expect(spec.onttrekkingOverlay).toBeNull()
    expect(buildVariantProfile(profiel, spec)).toBe(profiel)
  })

  it('een variant merget de overlay ÍN de bestaande categorie-prio’s', () => {
    const profiel = profielMet({
      ...POT_RULES_DEFAULTS,
      categoriePrios: { onttrekking: { Spaargeld: 2 }, toename: { Beleggingen: 1 } },
    })
    const laatst = VARIANT_SPECS.find((s) => s.id === 'pensioen-laatst')!
    const gemuteerd = buildVariantProfile(profiel, laatst)

    expect(gemuteerd).not.toBe(profiel)
    const raw = gemuteerd.pot_rules as { categorie_prios?: Record<string, Record<string, number>> }
    expect(raw.categorie_prios?.onttrekking).toEqual({ Spaargeld: 2, Pensioen: 5 })
    // Andere onderwerpen blijven ongemoeid.
    expect(raw.categorie_prios?.toename).toEqual({ Beleggingen: 1 })
    // Het bron-profiel is niet gemuteerd.
    expect((profiel.pot_rules as { categorie_prios?: unknown }).categorie_prios).toEqual({
      onttrekking: { Spaargeld: 2 },
      toename: { Beleggingen: 1 },
    })
  })
})

// ── 3. Rangschikking + beide diskwalificaties ────────────────────────────────

describe('rangschikking', () => {
  it('kiest de laagste levenslange totale druk', () => {
    const gefinaliseerd = finaliseerVarianten(
      [
        uitkomst({ id: 'huidige-volgorde', totaal: 200_000, buffer: 10_000 }),
        uitkomst({ id: 'pensioen-laatst', totaal: 180_000, buffer: 10_000 }),
        uitkomst({ id: 'pensioen-eerst', totaal: 190_000, buffer: 10_000 }),
      ],
      CURRENT_TAX_YEAR,
    )
    expect(gefinaliseerd.winnaarId).toBe('pensioen-laatst')
    expect(gefinaliseerd.referentieId).toBe(REFERENTIE_VARIANT_ID)
    expect(gefinaliseerd.varianten.every((v) => v.diskwalificatie === null)).toBe(true)
  })

  it('ADR 0040 — een latere FIRE-leeftijd dan de referentie kan nooit winnen, maar wordt wél getoond', () => {
    const gefinaliseerd = finaliseerVarianten(
      [
        uitkomst({ id: 'huidige-volgorde', totaal: 200_000, fire: 58, buffer: 10_000 }),
        // Goedkoopst, maar 2 jaar later vrij → veto.
        uitkomst({ id: 'pensioen-laatst', totaal: 100_000, fire: 60, buffer: 10_000 }),
        uitkomst({ id: 'pensioen-eerst', totaal: 190_000, fire: 58, buffer: 10_000 }),
      ],
      CURRENT_TAX_YEAR,
    )
    expect(gefinaliseerd.winnaarId).toBe('pensioen-eerst')
    const laatst = gefinaliseerd.varianten.find((v) => v.id === 'pensioen-laatst')!
    expect(laatst.diskwalificatie).toBe('fire-later-dan-referentie')
    // "Wel tonen": de getallen blijven volledig ingevuld.
    expect(laatst.levenslangeTotaleDrukNominaal).toBe(100_000)
    expect(laatst.eindvermogenNettoNominaal).toBe(100_000)
  })

  it('FIRE-veto: float-ruis diskwalificeert niet, een echte maand wél', () => {
    const ruis = uitkomst({ id: 'pensioen-laatst', totaal: 1, fire: 58 + 1e-9, buffer: 1 })
    const maand = uitkomst({ id: 'pensioen-laatst', totaal: 1, fire: 58 + 1 / 12, buffer: 1 })
    const ref = uitkomst({ id: 'huidige-volgorde', totaal: 2, fire: 58, buffer: 1 })
    expect(bepaalDiskwalificatie(ruis, ref)).toBeNull()
    expect(bepaalDiskwalificatie(maand, ref)).toBe('fire-later-dan-referentie')
  })

  it('FIRE-veto: onbereikbare FIRE telt als later; een onbereikbare REFERENTIE geeft geen ijkpunt', () => {
    const ref = uitkomst({ id: 'huidige-volgorde', totaal: 2, fire: 58, buffer: 1 })
    const nooit = uitkomst({ id: 'pensioen-laatst', totaal: 1, fire: null, buffer: 1 })
    expect(bepaalDiskwalificatie(nooit, ref)).toBe('fire-later-dan-referentie')

    const refZonderFire = uitkomst({ id: 'huidige-volgorde', totaal: 2, fire: null, buffer: 1 })
    const haaltFire = uitkomst({ id: 'pensioen-laatst', totaal: 1, fire: 70, buffer: 1 })
    expect(bepaalDiskwalificatie(haaltFire, refZonderFire)).toBeNull()
  })

  it('een negatieve laagste buffer diskwalificeert — óók de referentie', () => {
    const gefinaliseerd = finaliseerVarianten(
      [
        uitkomst({ id: 'huidige-volgorde', totaal: 100_000, buffer: -5_000 }),
        uitkomst({ id: 'pensioen-laatst', totaal: 200_000, buffer: 10_000 }),
        uitkomst({ id: 'pensioen-eerst', totaal: 150_000, buffer: -1 }),
      ],
      CURRENT_TAX_YEAR,
    )
    expect(gefinaliseerd.winnaarId).toBe('pensioen-laatst')
    expect(gefinaliseerd.varianten[0].diskwalificatie).toBe('negatieve-buffer')
    expect(gefinaliseerd.varianten[2].diskwalificatie).toBe('negatieve-buffer')
  })

  it('bij beide overtredingen wint de negatieve buffer als reden', () => {
    const ref = uitkomst({ id: 'huidige-volgorde', totaal: 100_000, fire: 58, buffer: 10_000 })
    const beide = uitkomst({ id: 'pensioen-laatst', totaal: 1, fire: 62, buffer: -1 })
    expect(bepaalDiskwalificatie(beide, ref)).toBe('negatieve-buffer')
  })

  it('gelijkspel binnen de ruisband gaat naar de referentie', () => {
    const gefinaliseerd = finaliseerVarianten(
      [
        uitkomst({ id: 'huidige-volgorde', totaal: 200_000, buffer: 10_000 }),
        uitkomst({ id: 'pensioen-laatst', totaal: 200_000 - 0.2, buffer: 10_000 }),
      ],
      CURRENT_TAX_YEAR,
    )
    expect(gefinaliseerd.winnaarId).toBe(REFERENTIE_VARIANT_ID)
  })

  it('geen enkele kandidaat → winnaar null (eerlijke lege uitkomst)', () => {
    expect(
      kiesWinnaar([
        uitkomst({ id: 'huidige-volgorde', totaal: null }),
        { ...uitkomst({ id: 'pensioen-laatst', totaal: 1 }), diskwalificatie: 'negatieve-buffer' },
      ]),
    ).toBeNull()
  })

  it('een kern-fout telt niet mee in de ranking', () => {
    const gefinaliseerd = finaliseerVarianten(
      [
        uitkomst({ id: 'huidige-volgorde', totaal: 200_000, buffer: 10_000 }),
        uitkomst({ id: 'pensioen-laatst', totaal: null }),
      ],
      CURRENT_TAX_YEAR,
    )
    expect(gefinaliseerd.winnaarId).toBe(REFERENTIE_VARIANT_ID)
    expect(gefinaliseerd.varianten[1].kernelFout).toBe('kern-fout')
  })
})

// ── 4 + 5. End-to-end op een echte kernel-run ────────────────────────────────

const fx = buildCompleetHorizonFixture(PINNED_AGE)

/**
 * De persona houdt maar ~€4,5k pensioen aan — te weinig om de onttrekkingsprio van
 * 'Pensioen' fiscaal te laten bijten. We tillen die pot naar een realistisch
 * opgebouwd bedrag zodat de knop waarvoor deze sweep bestaat DAADWERKELIJK iets
 * doet; blijft de proef groen op de originele fixture, dan test hij niets.
 */
const assetsMetPensioen = fx.assets.map((a) =>
  a.asset_type === 'retirement' ? { ...a, current_value: 300_000 } : a,
)

/**
 * `deplete` t/m 90 is hier BEWUST: de persona is op de gepinde leeftijd al FIRE, dus
 * de projectie is bijna volledig afbouw-fase — precies waar een onttrekkings-
 * volgorde iets doet. Een opbouw-zware fixture zou de knop nauwelijks raken.
 */
const basisProfiel: ConvergentieRawProfileRow = {
  ...buildCompleetKernelProfileBase(PINNED_AGE),
  fire_end_strategy: 'deplete',
  fire_end_age: 90,
  housing_strategy_config: { mode: 'include_full' },
}

const snapshot: VariantenSweepSnapshot = {
  rawContext: {
    profile: basisProfiel,
    assets: assetsMetPensioen,
    debts: fx.debts,
    lifeEvents: fx.lifeEvents,
    aowRows: [],
    yearlyExpenses: fx.financialInput.yearlyMustExpenses,
  },
  aowLeeftijd: 67,
}

describe('variantensweep end-to-end (echte kernel-runs)', () => {
  const resultaat = runVariantenSweep(snapshot)

  it('levert drie varianten in vaste volgorde met de referentie vooraan', () => {
    expect(resultaat.varianten.map((v) => v.id)).toEqual([
      'huidige-volgorde',
      'pensioen-laatst',
      'pensioen-eerst',
    ])
    expect(resultaat.varianten[0].isReferentie).toBe(true)
    expect(resultaat.box1Jaar).toBe(CURRENT_TAX_YEAR)
    expect(resultaat.varianten.every((v) => v.kernelFout === null)).toBe(true)
  })

  it('de referentie is IDENTIEK aan een directe run op de ongewijzigde context', () => {
    const direct = computeConvergentieProjection({ rawContext: snapshot.rawContext })
    expect(direct.ok).toBe(true)
    if (!direct.ok) return
    const reeks = computeLifetimeTax(direct.result.rows, { aowLeeftijd: snapshot.aowLeeftijd })
    const ref = resultaat.varianten[0]
    expect(ref.levenslangeBox3Nominaal).toBe(reeks.cumulatiefBox3)
    expect(ref.levenslangeBox1NietVerrekendNominaal).toBe(reeks.cumulatiefBox1NietVerrekend)
    expect(ref.levenslangeTotaleDrukNominaal).toBe(reeks.cumulatiefTotaal)
    expect(ref.fireAgeFractional).toBe(direct.result.fireAgeFractional)
  })

  it('de drie belastingtotalen tellen per variant exact op', () => {
    for (const v of resultaat.varianten) {
      expect(v.levenslangeTotaleDrukNominaal).toBe(
        (v.levenslangeBox3Nominaal as number) + (v.levenslangeBox1NietVerrekendNominaal as number),
      )
    }
  })

  it('HARDE EIS — het eindvermogen komt per variant mee, op beide grondslagen', () => {
    for (const v of resultaat.varianten) {
      expect(Number.isFinite(v.eindvermogenNettoNominaal as number)).toBe(true)
      expect(Number.isFinite(v.eindvermogenBelegbaarNominaal as number)).toBe(true)
      // Netto vermogen telt óók het niet-liquide bezit; belegbaar nooit méér.
      expect(v.eindvermogenNettoNominaal as number).toBeGreaterThanOrEqual(
        (v.eindvermogenBelegbaarNominaal as number) - 1,
      )
      expect(v.laagsteBuffer).not.toBeNull()
    }
  })

  it('BIJT-PROEF — de pensioenknop verschuift de druk aantoonbaar tussen Box 3 en Box 1', () => {
    const referentie = resultaat.varianten[0]
    const laatst = resultaat.varianten[1]
    const eerst = resultaat.varianten[2]

    // Harde eis: de drie plannen zijn niet hetzelfde plan. Vielen ze samen, dan
    // bewaakt deze sweep niets (precies de V1-val, één laag dieper).
    expect(laatst.levenslangeTotaleDrukNominaal).not.toBe(referentie.levenslangeTotaleDrukNominaal)
    expect(eerst.levenslangeTotaleDrukNominaal).not.toBe(laatst.levenslangeTotaleDrukNominaal)

    // …en de verschuiving loopt de FISCAAL JUISTE kant op: pensioen vroeg
    // onttrekken haalt vermogen uit de (Box 3-vrije) pensioenpot naar de Box
    // 3-grondslag — meer Box 3, minder Box 1. Pensioen als reserve doet het
    // omgekeerde. Een tekenomkering hier betekent dat de overlay iets ánders
    // aanstuurt dan de onttrekkingsvolgorde.
    expect(eerst.levenslangeBox3Nominaal as number).toBeGreaterThan(
      laatst.levenslangeBox3Nominaal as number,
    )
    expect(eerst.levenslangeBox1NietVerrekendNominaal as number).toBeLessThan(
      laatst.levenslangeBox1NietVerrekendNominaal as number,
    )
  })

  it('de winnaar is een niet-gediskwalificeerde variant met de laagste druk', () => {
    const kandidaten = resultaat.varianten.filter(
      (v) => v.diskwalificatie === null && v.levenslangeTotaleDrukNominaal !== null,
    )
    if (resultaat.winnaarId === null) {
      expect(kandidaten).toHaveLength(0)
      return
    }
    const winnaar = resultaat.varianten.find((v) => v.id === resultaat.winnaarId)!
    expect(winnaar.diskwalificatie).toBeNull()
    for (const k of kandidaten) {
      expect(k.levenslangeTotaleDrukNominaal as number).toBeGreaterThanOrEqual(
        (winnaar.levenslangeTotaleDrukNominaal as number) - 0.5,
      )
    }
  })

  it('de uitkomst is structured-clone-veilig (worker-grens)', () => {
    expect(() => structuredClone(resultaat)).not.toThrow()
    expect(() => structuredClone(snapshot)).not.toThrow()
  })
})

describe('memo-sleutel', () => {
  it('is stabiel voor dezelfde snapshot en verschilt bij een andere invoer', () => {
    const a = variantenSweepInputHash(snapshot)
    expect(variantenSweepInputHash(snapshot)).toBe(a)
    const anders: VariantenSweepSnapshot = {
      ...snapshot,
      rawContext: { ...snapshot.rawContext, yearlyExpenses: snapshot.rawContext.yearlyExpenses + 1 },
    }
    expect(variantenSweepInputHash(anders)).not.toBe(a)
  })
})

/** Type-anker: de sweep-context is een volwaardige `ConvergentieRawContext`. */
const _contextContract: ConvergentieRawContext = snapshot.rawContext
void _contextContract
