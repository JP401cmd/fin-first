/**
 * De variantensweep — bewijst de zes claims waarop deze laag staat of valt:
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
 *  6. De resterende PENSIOENPOT komt mee, op de kern-categorie 'Pensioen'
 *     (`retirement` én `levensverzekering`). Zonder dat getal toont katern IV
 *     alleen het belegbaar vermogen — dat de pensioenpot per definitie overslaat —
 *     en oogt de winnaar van een pensioen-uitstel-variant miljoenen armer.
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
  EINDVERMOGEN_GRONDSLAGEN,
  type VariantId,
  type VariantUitkomst,
  type VariantenSweepSnapshot,
} from './varianten-sweep'
import { spendablePortfolio } from '@/lib/horizon/coverage-strip'
import { pensioenPortfolio } from '@/lib/horizon/pensioen-pot'
import { ASSET_TYPE_TO_CATEGORIE } from '@/lib/horizon-kernel/adapter/potten'
import type { AssetType } from '@/lib/asset-data'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
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

/**
 * Minimale variant-uitkomst voor de pure rangschik-tests.
 *
 * `totaal: null` = KERN-FOUT, en dan spiegelt deze helper `runVariant`'s `leeg()`:
 * élk getal staat op `null`, óók `fireAgeFractional`. Anders zou hij een staat
 * fabriceren die de sweep nooit produceert (een gefaalde run mét FIRE-leeftijd) —
 * precies de staat waarin de FIRE-tak stilletjes goed leek te gaan.
 */
function uitkomst(p: {
  id: VariantId
  totaal: number | null
  fire?: number | null
  buffer?: number | null
}): VariantUitkomst {
  const kernFout = p.totaal === null
  return {
    id: p.id,
    label: p.id,
    onttrekkingOverlay: p.id === REFERENTIE_VARIANT_ID ? null : { Pensioen: 5 },
    isReferentie: p.id === REFERENTIE_VARIANT_ID,
    levenslangeBox3Nominaal: p.totaal,
    levenslangeBox1NietVerrekendNominaal: kernFout ? null : 0,
    levenslangeTotaleDrukNominaal: p.totaal,
    fireAgeFractional: kernFout ? null : p.fire === undefined ? 60 : p.fire,
    eindvermogenNettoNominaal: kernFout ? null : 100_000,
    eindvermogenBelegbaarNominaal: kernFout ? null : 80_000,
    eindvermogenPensioenNominaal: kernFout ? null : 40_000,
    laagsteBuffer:
      kernFout || p.buffer === undefined || p.buffer === null
        ? null
        : { bedrag: p.buffer, age: 70 },
    diskwalificatie: null,
    kernelFout: kernFout ? 'kern-fout' : null,
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

  it('een uitgeputte laagste buffer diskwalificeert — óók de referentie', () => {
    const gefinaliseerd = finaliseerVarianten(
      [
        // €0 = uitgeput. Dít is de stand die de kern écht kan produceren; de oude
        // drempel (`< 0`) liet 'm ongemoeid.
        uitkomst({ id: 'huidige-volgorde', totaal: 100_000, buffer: 0 }),
        uitkomst({ id: 'pensioen-laatst', totaal: 200_000, buffer: 10_000 }),
        uitkomst({ id: 'pensioen-eerst', totaal: 150_000, buffer: -1 }),
      ],
      CURRENT_TAX_YEAR,
    )
    expect(gefinaliseerd.winnaarId).toBe('pensioen-laatst')
    expect(gefinaliseerd.varianten[0].diskwalificatie).toBe('buffer-uitgeput')
    expect(gefinaliseerd.varianten[2].diskwalificatie).toBe('buffer-uitgeput')
  })

  it('bij beide overtredingen wint de uitgeputte buffer als reden', () => {
    const ref = uitkomst({ id: 'huidige-volgorde', totaal: 100_000, fire: 58, buffer: 10_000 })
    const beide = uitkomst({ id: 'pensioen-laatst', totaal: 1, fire: 62, buffer: 0 })
    expect(bepaalDiskwalificatie(beide, ref)).toBe('buffer-uitgeput')
  })

  it('de uitputtingsdrempel is een ruisband, geen bufferminimum', () => {
    const ref = uitkomst({ id: 'huidige-volgorde', totaal: 100_000, fire: 58, buffer: 10_000 })
    // Een cent restant leest als "op"; een euro is gewoon vermogen.
    expect(
      bepaalDiskwalificatie(uitkomst({ id: 'pensioen-laatst', totaal: 1, fire: 58, buffer: 0.005 }), ref),
    ).toBe('buffer-uitgeput')
    expect(
      bepaalDiskwalificatie(uitkomst({ id: 'pensioen-laatst', totaal: 1, fire: 58, buffer: 1 }), ref),
    ).toBeNull()
  })

  /**
   * Z1 — een variant die niet DRAAIDE mag geen inhoudelijke reden krijgen. Zonder
   * de kern-fout-uitgang valt `bepaalDiskwalificatie` door naar de FIRE-tak (waar
   * `fireAgeFractional: null` als "later" telt) en zet de kop twee tegenstrijdige
   * boodschappen naast elkaar: "je FIRE-moment valt later dan nu" én "niet
   * doorgerekend voor jouw plan". Het eerste is een uitspraak over een run die
   * nooit heeft plaatsgevonden. Bestond alleen als álle varianten faalden.
   */
  it('Z1 — een kern-fout naast een geslaagde referentie krijgt GEEN diskwalificatie-reden', () => {
    const gefinaliseerd = finaliseerVarianten(
      [
        uitkomst({ id: 'huidige-volgorde', totaal: 200_000, fire: 58, buffer: 10_000 }),
        uitkomst({ id: 'pensioen-laatst', totaal: null }), // kern-fout: alles null
        uitkomst({ id: 'pensioen-eerst', totaal: 190_000, fire: 58, buffer: 10_000 }),
      ],
      CURRENT_TAX_YEAR,
    )
    const gefaald = gefinaliseerd.varianten[1]
    expect(gefaald.kernelFout).toBe('kern-fout')
    expect(gefaald.fireAgeFractional).toBeNull()
    expect(gefaald.diskwalificatie).toBeNull()
    // …en hij blijft buiten de ranking, precies zoals daarvoor.
    expect(gefinaliseerd.winnaarId).toBe('pensioen-eerst')
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
        { ...uitkomst({ id: 'pensioen-laatst', totaal: 1 }), diskwalificatie: 'buffer-uitgeput' },
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

// ── 5b. De resterende pensioenpot komt mee (katern IV, "Wat er overblijft") ──

/**
 * Katern IV vergelijkt drie PLEKKEN VOOR DE PENSIOENPOT, maar de enige vermogensrij
 * was `eindvermogenBelegbaarNominaal` = `spendablePortfolio`, en die slaat de
 * pensioenpot bewust over (`NON_SPENDABLE_ASSET_TYPES`). De winnaar oogde daardoor
 * miljoenen armer — precies de kant die de weglating voorspelt — en het scherm kon
 * zijn eigen vraag niet beantwoorden.
 *
 * De grondslag van het nieuwe veld is de KERN-categorie 'Pensioen', niet het app-type
 * `retirement`: de kernel-adapter mapt `retirement` ÉN `levensverzekering` op die ene
 * categorie (`ASSET_TYPE_TO_CATEGORIE`), en dát is de categorie waar de
 * onttrekkings-overlay van deze sweep op stuurt. Een veld dat alleen `retirement`
 * telt zou de pot onderschatten met precies het deel dat de lever óók verschuift.
 *
 * Tolerantie-keuze: de som-identiteit wordt EXACT vergeleken (`toBe`). Het is geen
 * meting maar dezelfde optelling van dezelfde twee floats; een tolerantie zou hier
 * precies de foutklasse verbergen die de test moet vangen (een ontbrekende term).
 */
describe('resterende pensioenpot per variant', () => {
  const resultaat = runVariantenSweep(snapshot)
  const [referentie, laatst, eerst] = resultaat.varianten

  it('elke variant levert de resterende pensioenpot mee', () => {
    for (const v of resultaat.varianten) {
      expect(v.kernelFout).toBeNull()
      expect(Number.isFinite(v.eindvermogenPensioenNominaal as number)).toBe(true)
      expect(v.eindvermogenPensioenNominaal as number).toBeGreaterThanOrEqual(0)
    }
  })

  it('VOLGT DE KERN-CATEGORIE — retirement ÉN levensverzekering, niet alleen retirement', () => {
    const direct = computeConvergentieProjection({ rawContext: snapshot.rawContext })
    expect(direct.ok).toBe(true)
    if (!direct.ok) return
    const laatsteRij = direct.result.rows[direct.result.rows.length - 1]

    const retirementEind = laatsteRij.assetBuckets.retirement?.endValue ?? 0
    const levensverzekeringEind = laatsteRij.assetBuckets.levensverzekering?.endValue ?? 0

    // Zonder een levensverzekering-restant bewijst deze test niets: dan zou een
    // retirement-only implementatie er net zo goed doorheen komen.
    expect(levensverzekeringEind).toBeGreaterThan(0)

    expect(referentie.eindvermogenPensioenNominaal).toBe(retirementEind + levensverzekeringEind)
    expect(referentie.eindvermogenPensioenNominaal as number).toBeGreaterThan(retirementEind)
  })

  it('de pensioen-lever verschuift de pot aantoonbaar (laatst > huidig > eerst)', () => {
    expect(laatst.eindvermogenPensioenNominaal as number).toBeGreaterThan(
      referentie.eindvermogenPensioenNominaal as number,
    )
    expect(referentie.eindvermogenPensioenNominaal as number).toBeGreaterThan(
      eerst.eindvermogenPensioenNominaal as number,
    )
  })

  /**
   * Het gemelde defect, als anker. "Pensioen zo laat mogelijk" wint de belasting-as
   * én houdt het MEESTE vermogen over, maar staat op de belegbare rij het LAAGST —
   * omdat z'n vermogen in de pensioenpot zit die die rij overslaat.
   *
   * De optelling hieronder is uitsluitend een RICHTINGSTOETS, geen getoonde
   * grondslag. De twee termen zijn sinds 10 aug 2026 wél disjunct
   * (`levensverzekering` is uit `NON_SPENDABLE_ASSET_TYPES` gehaald), maar hun som
   * mist nog altijd woning/auto/fysiek bezit en staat vóór schulden — het is dus
   * geen bestaande grootheid. De twee rijen op het scherm blijven apart; zie
   * `EINDVERMOGEN_GRONDSLAGEN` en de rem-suite hieronder.
   */
  it('BUG-ANKER — de winnaar oogt armer op de belegbare rij, maar houdt het meeste over', () => {
    expect(laatst.eindvermogenBelegbaarNominaal as number).toBeLessThan(
      referentie.eindvermogenBelegbaarNominaal as number,
    )
    expect(laatst.eindvermogenPensioenNominaal as number).toBeGreaterThan(
      referentie.eindvermogenPensioenNominaal as number,
    )
    const samen = (v: VariantUitkomst) =>
      (v.eindvermogenBelegbaarNominaal as number) + (v.eindvermogenPensioenNominaal as number)
    expect(samen(laatst)).toBeGreaterThan(samen(referentie))
  })

  it('een kern-fout levert null, geen 0 (de leeg()-tak)', () => {
    const stuk = runVariantenSweep({
      ...snapshot,
      rawContext: {
        ...snapshot.rawContext,
        profile: { ...basisProfiel, date_of_birth: null },
      },
    })
    for (const v of stuk.varianten) {
      expect(v.kernelFout).not.toBeNull()
      expect(v.eindvermogenPensioenNominaal).toBeNull()
    }
  })
})

// ── 5c. De NIET-OPTELLEN-REM, op de laag waar de velden wonen ────────────────

/**
 * VANGRAIL bij de kaart "Levensverzekering telt als pensioenpot én als belegbaar
 * vermogen — kies één van beide" (eigenaarsbesluit optie A).
 *
 * De rem hing tot 10 aug 2026 uitsluitend op het scherm
 * (`optimizer-levenslang.test.tsx`) en was daar waarde-gekoppeld: hij ving exact de
 * geformatteerde som vóór één fixture, dus een afgeronde of afgekorte som glipte
 * erdoor en een tweede consument — widget, export, briefing — had geen enkele rem.
 * Deze suite zet 'm in de laag waar de velden wonen, waarde-onafhankelijk.
 *
 * Toleranties zijn hier bewust gekozen, niet geërfd:
 *  - de disjunctheids- en registratieproeven zijn EXACT/boolean — geen meting;
 *  - de "som ≠ netto"-proef gebruikt een ABSOLUTE band van €1 op bedragen in de
 *    miljoenen. Dat is bewust ruim genoeg om float-ruis te negeren en bewust
 *    absoluut: de claim is "deze twee grootheden vallen niet samen", niet "ze
 *    verschillen relatief zoveel procent". Een relatieve band zou bij een fixture
 *    zonder woning én zonder schulden juist de foutklasse verbergen.
 */
describe('grondslag-rem — de eindvermogens zijn drie grondslagen, geen optelbare termen', () => {
  const resultaat = runVariantenSweep(snapshot)
  const referentie = resultaat.varianten.find((v) => v.isReferentie)!

  it('elk eindvermogen-veld staat geregistreerd met zijn grondslag', () => {
    const velden = Object.keys(referentie).filter((k) => k.startsWith('eindvermogen'))
    expect(velden.length).toBeGreaterThan(0)
    for (const veld of velden) {
      expect(
        Object.prototype.hasOwnProperty.call(EINDVERMOGEN_GRONDSLAGEN, veld),
        `${veld} heeft geen grondslag-omschrijving in EINDVERMOGEN_GRONDSLAGEN`,
      ).toBe(true)
    }
    // …en andersom: geen registratie voor een veld dat niet (meer) bestaat.
    expect(Object.keys(EINDVERMOGEN_GRONDSLAGEN).sort()).toEqual(velden.sort())
  })

  /**
   * De eigenschap waar het defect over ging. Vóór optie A telde
   * `levensverzekering` in béide grondslagen; op de gemeten fixture was dat 87% van
   * de belegbare cel van de winnaar. Per app-type geprobeerd, dus
   * fixture-onafhankelijk.
   */
  it('DISJUNCT — geen enkel app-type telt in zowel belegbaar als pensioenpot', () => {
    const enkel = (type: string): UnifiedProjectionRow =>
      ({ assetBuckets: { [type]: { endValue: 1_000 } } }) as unknown as UnifiedProjectionRow

    let pensioenTypen = 0
    for (const type of Object.keys(ASSET_TYPE_TO_CATEGORIE) as AssetType[]) {
      const row = enkel(type)
      const belegbaar = spendablePortfolio(row) > 0
      const pensioen = pensioenPortfolio(row) > 0
      if (pensioen) pensioenTypen++
      expect(belegbaar && pensioen, `${type} telt in beide grondslagen`).toBe(false)
    }
    // Zonder minstens twee pensioen-typen bewijst de proef niets: het defect zát
    // juist in het tweede type.
    expect(pensioenTypen).toBeGreaterThanOrEqual(2)
  })

  /**
   * Disjunct is niet optelbaar. De som van belegbaar + pensioen is aantoonbaar NIET
   * het netto vermogen — hij mist het niet-liquide bezit en staat vóór schulden —
   * dus een consument die de twee optelt produceert een vierde getal dat nergens is
   * gedefinieerd. Deze fixture (persona `compleet`) heeft zowel een woning als
   * schulden, dus het verschil is echt en niet toevallig nul.
   */
  it('de som van belegbaar + pensioen is GEEN netto vermogen', () => {
    for (const v of resultaat.varianten) {
      const som = (v.eindvermogenBelegbaarNominaal as number) + (v.eindvermogenPensioenNominaal as number)
      const netto = v.eindvermogenNettoNominaal as number
      expect(Math.abs(netto - som)).toBeGreaterThan(1)
    }
  })

  /**
   * BIJT-PROEF op de kaart zelf: de fixture heeft een levensverzekering-restant, en
   * dat restant zit in de pensioenpot en NIET in het belegbaar vermogen.
   */
  it('BUG-ANKER — het levensverzekering-restant zit alleen nog in de pensioenpot', () => {
    const direct = computeConvergentieProjection({ rawContext: snapshot.rawContext })
    expect(direct.ok).toBe(true)
    if (!direct.ok) return
    const laatste = direct.result.rows[direct.result.rows.length - 1]

    const polis = laatste.assetBuckets.levensverzekering?.endValue ?? 0
    expect(polis, 'zonder polis-restant bewijst deze proef niets').toBeGreaterThan(0)

    const alleBuckets = Object.values(laatste.assetBuckets).reduce(
      (s, d) => s + (d?.endValue ?? 0),
      0,
    )
    // De polis zit in de pensioenpot…
    expect(pensioenPortfolio(laatste)).toBeGreaterThanOrEqual(polis)
    // …en niet in het belegbaar vermogen: hem weglaten verandert daar niets.
    const zonderPolis = {
      ...laatste,
      assetBuckets: { ...laatste.assetBuckets, levensverzekering: undefined },
    } as unknown as UnifiedProjectionRow
    expect(spendablePortfolio(zonderPolis)).toBe(referentie.eindvermogenBelegbaarNominaal)
    expect(alleBuckets).toBeGreaterThan(referentie.eindvermogenBelegbaarNominaal as number)
  })
})

// ── 6. Het buffer-veto is BEREIKBAAR (de reden dat de drempel verschoof) ─────

/**
 * De oorspronkelijke drempel was `laagsteBuffer.bedrag < 0`. Die kon per
 * constructie nooit afgaan: `computeLaagsteBuffer` minimaliseert
 * `spendablePortfolio`, een SOM van bucket-`endValue`s die nooit met schulden
 * wordt verrekend — een tekort landt als Tekort-lening (schuld), niet als negatief
 * bezit. Een variant die de portefeuille volledig leegtrekt haalde daardoor
 * `bedrag === 0`, passeerde het veto, en kon met de minste Box 3 de badge "laagste
 * druk" krijgen: precies het geval dat het veto moest afvangen.
 *
 * De pure test hierboven (die de buffer met de hand op 0 zet) bewijst alleen dat
 * de VERGELIJKING werkt. Deze proef bewijst dat de kern die stand ook echt
 * OPLEVERT, en dat de oude drempel hem aantoonbaar zou hebben gemist.
 *
 * De leegtrek-fixture is dezelfde persona zónder inkomen en met een structureel
 * hogere uitgave: een permanent tekort dat de kern jaar na jaar uit de potten
 * dekt. Louter de uitgaven verhogen volstond NIET — dat duwt FIRE alleen maar
 * verder weg, waarna de persona blijft werken en de buffer juist nooit daalt.
 */
const leegtrekAssets = [
  { ...fx.assets.find((a) => a.asset_type === 'savings')!, current_value: 50_000, monthly_contribution: 0 },
  { ...fx.assets.find((a) => a.asset_type === 'retirement')!, current_value: 300_000, monthly_contribution: 0 },
]

const leegtrekSnapshot: VariantenSweepSnapshot = {
  ...snapshot,
  rawContext: {
    ...snapshot.rawContext,
    // Alleen spaargeld + de pensioenpot. De volledige persona heeft óók bezit dat
    // wél als belegbaar telt maar in de praktijk nooit wordt aangesproken (een
    // deelneming, een vordering, een levensverzekering); dat groeit harder dan het
    // tekort het leegtrekt, waardoor de som nooit de bodem raakt. Voor een proef
    // op de BEREIKBAARHEID van het veto is die ruis alleen maar afleiding.
    assets: leegtrekAssets,
    debts: [],
    profile: {
      ...basisProfiel,
      net_monthly_income: 0,
      estimated_monthly_expenses: 15_000,
      yearly_essential_expenses: 180_000,
    },
    yearlyExpenses: 180_000,
  },
}

describe('buffer-veto is bereikbaar op een echte kernel-run', () => {
  const leeg = runVariantenSweep(leegtrekSnapshot)
  const ref = leeg.varianten.find((v) => v.isReferentie)!

  it('de kern levert een UITGEPUTTE (niet negatieve) laagste buffer', () => {
    expect(ref.kernelFout).toBeNull()
    expect(ref.laagsteBuffer).not.toBeNull()
    const bedrag = ref.laagsteBuffer!.bedrag
    // De bodem van deze grootheid is nul: er wordt niets met schulden verrekend.
    expect(bedrag).toBeGreaterThanOrEqual(0)
    expect(bedrag).toBeLessThanOrEqual(0.01)
  })

  it('BIJT-PROEF — de oude drempel (< 0) had dit plan laten passeren', () => {
    const bedrag = ref.laagsteBuffer!.bedrag
    expect(bedrag < 0).toBe(false) // ← wat het oude veto testte
    expect(ref.diskwalificatie).toBe('buffer-uitgeput') // ← wat het nu doet
  })

  it('een leeggetrokken plan kan de winnaar niet zijn', () => {
    const winnaar = leeg.varianten.find((v) => v.id === leeg.winnaarId) ?? null
    if (winnaar !== null) expect(winnaar.diskwalificatie).toBeNull()
    for (const v of leeg.varianten) {
      if ((v.laagsteBuffer?.bedrag ?? Number.POSITIVE_INFINITY) <= 0.01) {
        expect(v.id).not.toBe(leeg.winnaarId)
      }
    }
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
