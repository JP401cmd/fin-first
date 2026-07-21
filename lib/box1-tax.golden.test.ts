import { describe, it, expect } from 'vitest'
import { computeBox1Tax, type Box1TaxYear } from './box1-tax'

/**
 * EXTERNE golden-tests Box 1 — Belastingdienst-rekenvoorbeelden per belastingjaar.
 * (Arch F6, bevinding #31 — enterprise-architectuurreview 3 jul 2026.)
 *
 * WAAROM DIT BESTAND BESTAAT
 * --------------------------
 * lib/box1-tax.test.ts toetst de rekenlogica, maar leidt zijn verwachte
 * bedragen deels áf uit dezelfde BOX1_PARAMS-constanten die de motor zelf
 * gebruikt (semi-self-referential). Dat vangt een regressie ná een fix, maar
 * niet een fout die al in de constanten zat toen de literal werd geschreven —
 * precies de heffingskortingen-2026-bug (2026-kortingen met 2025-knikpunten,
 * gefixt in juni 2026, ±€230 op het eindbedrag).
 *
 * Deze suite sluit dat gat: de verwachte waarden zijn LITERALE bedragen die
 * rechtstreeks uit gepubliceerde Belastingdienst-tabellen komen (headline-
 * maxima, knikpunt-bedragen, nihil-grenzen) of met de hand gereconstrueerd zijn
 * uit de officiële schijven + korting-formules. Er wordt BEWUST NIET uit
 * BOX1_PARAMS afgeleid — daarom importeert dit bestand `BOX1_PARAMS` niet.
 * Corrumpeer je één constante in box1-tax.ts, dan kleurt hier minstens één
 * golden rood (zie MUTATIETEST onderaan). Dat is het hele punt.
 *
 * TOLERANTIE — bewuste keuze: ABSOLUUT (euro), niet relatief.
 * ----------------------------------------------------------
 * - component-goldens (AHK / arbeidskorting): ±€1. De Belastingdienst-tabellen
 *   ronden op hele euro's af; de motor rekent in centen. ±€1 absorbeert die
 *   afronding maar valt bij een verkeerd TARIEF of KNIKPUNT direct om (dat
 *   verschuift het bedrag met tientallen/honderden euro's).
 * - eind-tot-eind-goldens (tax): ±€2. De officiële proefberekening rondt
 *   inkomen én tussenstappen af; ±€2 dekt de gestapelde afronding.
 * BEWUST absoluut i.p.v. relatief: de te vangen foutklasse (verkeerde constante)
 * verschuift het eindbedrag ~€100-500 (de juni-fix bewoog €230), ruim boven de
 * afrondingsruis. Een relatieve %-tolerantie zou juist bij bijna-nul-belasting-
 * inkomens verkeerd schalen. De tolerantie is nooit losser dan de kleinste
 * te vangen constante-fout.
 *
 * AOW-arbeidskorting is bewust NIET op euro-niveau golden-getest: de
 * belastingdeel-only-variant is in TriFinity gemodelleerd als "niet-AOW ×
 * (AOW-schijf-1-tarief / schijf-1-tarief)". Dat reproduceert de officiële
 * AOW-tabel tot ~€1,5 nauwkeurig, maar het exacte per-euro-bedrag is een
 * TriFinity-reconstructie i.p.v. een direct citeerbaar Belastingdienst-getal —
 * een exacte literal zou dán ons model toetsen i.p.v. een externe waarheid. De
 * AOW-dimensie wordt gedekt via de (wél exact gepubliceerde) AOW-AHK-maxima.
 *
 * 2027-JAARCHECKLIST: een nieuwe jaarlaag in BOX1_PARAMS = een nieuwe golden-
 * blok hier ophalen uit de dan-geldende Belastingdienst-tabellen.
 */

type Field = 'algemeneHeffingskorting' | 'arbeidskorting' | 'tax'

interface Box1Golden {
  label: string
  income: number
  aow?: boolean
  field: Field
  /** Literaal Belastingdienst-bedrag (of officiële handreconstructie). */
  expected: number
  /** Absolute euro-tolerantie (bewuste keuze; zie header). */
  tol: number
  /** Bron + verificatiedatum. */
  bron: string
}

// ── 2026 ──────────────────────────────────────────────────────
// Bronnen (geverifieerd 21 jul 2026):
//  - belastingdienst.nl › tabel-algemene-heffingskorting-2026
//  - belastingdienst.nl › tabel-arbeidskorting-2026
//  - belastingdienst.nl › box_1-tarieven-2026 (schijven 35,75% / 37,56% / 49,50%)
const BOX1_GOLDENS_2026: Box1Golden[] = [
  {
    label: 'AHK = maximum €3.115 onder de afbouwgrens (€25.000 < €29.737)',
    income: 25_000,
    field: 'algemeneHeffingskorting',
    expected: 3_115,
    tol: 1,
    bron: 'Tabel algemene heffingskorting 2026 — maximum €3.115 (inkomen ≤ €29.737).',
  },
  {
    label: 'AHK = €0 vanaf de nihil-grens (€78.427)',
    income: 78_427,
    field: 'algemeneHeffingskorting',
    expected: 0,
    tol: 1,
    bron: 'Tabel algemene heffingskorting 2026 — geen recht op AHK bij inkomen ≥ €78.427.',
  },
  {
    label: 'Arbeidskorting = €996 op 1e knikpunt €11.965 (8,324%)',
    income: 11_965,
    field: 'arbeidskorting',
    expected: 996,
    tol: 1,
    bron: 'Tabel arbeidskorting 2026 — €11.965 × 8,324% ≈ €996 (einde 1e opbouwtraject).',
  },
  {
    label: 'Arbeidskorting = €5.300 op 2e knikpunt €25.845',
    income: 25_845,
    field: 'arbeidskorting',
    expected: 5_300,
    tol: 1,
    bron: 'Tabel arbeidskorting 2026 — bedrag op knikpunt €25.845 = €5.300 (einde 2e opbouwtraject).',
  },
  {
    label: 'Arbeidskorting = maximum €5.685 op afbouwstart €45.592',
    income: 45_592,
    field: 'arbeidskorting',
    expected: 5_685,
    tol: 1,
    bron: 'Tabel arbeidskorting 2026 — maximum €5.685 bij inkomen €45.592 (start afbouw).',
  },
  {
    label: 'Arbeidskorting = €0 vanaf de nihil-grens (€132.921)',
    income: 132_921,
    field: 'arbeidskorting',
    expected: 0,
    tol: 1,
    bron: 'Tabel arbeidskorting 2026 — afgebouwd tot €0 bij inkomen ≥ €132.921.',
  },
  {
    label: 'Totale Box 1-heffing bij €60.000 (geen AOW/kind/woning) = €15.906',
    income: 60_000,
    field: 'tax',
    expected: 15_906,
    tol: 2,
    // Handreconstructie uit officiële 2026-tabellen (loon-only):
    //   heffing = 38.883·35,75% + (60.000−38.883)·37,56%          = €21.832,22
    //   AHK     = 3.115 − 6,398%·(60.000−29.737)                  ≈ €1.178,7
    //   arbeidsk.= 5.685 − 6,510%·(60.000−45.592)                 ≈ €4.747,0
    //   tax     = 21.832,22 − (1.178,7 + 4.747,0)                 ≈ €15.906
    bron: 'Belastingdienst 2026 schijven + korting-formules, handreconstructie loon-only.',
  },
  {
    label: 'AOW: AHK = maximum €1.556 onder de afbouwgrens',
    income: 25_000,
    aow: true,
    field: 'algemeneHeffingskorting',
    expected: 1_556,
    tol: 1,
    bron: 'Tabel algemene heffingskorting 2026 (AOW-gerechtigd) — maximum €1.556 (belastingdeel-only).',
  },
]

// ── 2025 ──────────────────────────────────────────────────────
// Bronnen (geverifieerd 21 jul 2026):
//  - belastingdienst.nl › tabel-algemene-heffingskorting-2025 (max €3.068)
//  - belastingdienst.nl › tabel-arbeidskorting-2025 (max €5.599)
//  - belastingdienst.nl › box_1-tarieven-2025 (schijven 35,82% / 37,48% / 49,50%)
const BOX1_GOLDENS_2025: Box1Golden[] = [
  {
    label: 'AHK = maximum €3.068 onder de afbouwgrens (€25.000 < €28.406)',
    income: 25_000,
    field: 'algemeneHeffingskorting',
    expected: 3_068,
    tol: 1,
    bron: 'Tabel algemene heffingskorting 2025 — maximum €3.068 (inkomen ≤ €28.406).',
  },
  {
    label: 'Arbeidskorting = €980 op 1e knikpunt €12.169 (8,053%)',
    income: 12_169,
    field: 'arbeidskorting',
    expected: 980,
    tol: 1,
    bron: 'Tabel arbeidskorting 2025 — €12.169 × 8,053% ≈ €980 (einde 1e opbouwtraject).',
  },
  {
    label: 'Arbeidskorting = €5.220 op 2e knikpunt €26.288',
    income: 26_288,
    field: 'arbeidskorting',
    expected: 5_220,
    tol: 1,
    bron: 'Tabel arbeidskorting 2025 — bedrag op knikpunt €26.288 = €5.220 (einde 2e opbouwtraject).',
  },
  {
    label: 'Arbeidskorting = maximum €5.599 op afbouwstart €43.071',
    income: 43_071,
    field: 'arbeidskorting',
    expected: 5_599,
    tol: 1,
    bron: 'Tabel arbeidskorting 2025 — maximum €5.599 bij inkomen €43.071 (start afbouw).',
  },
  {
    label: 'Totale Box 1-heffing bij €45.000 (geen AOW/kind/woning) = €8.738',
    income: 45_000,
    field: 'tax',
    expected: 8_738,
    tol: 2,
    // Handreconstructie uit officiële 2025-tabellen (loon-only):
    //   heffing = 38.441·35,82% + (45.000−38.441)·37,48%          = €16.227,9
    //   AHK     = 3.068 − 6,337%·(45.000−28.406)                  ≈ €2.016,4
    //   arbeidsk.= 5.599 − 6,510%·(45.000−43.071)                 ≈ €5.473,3
    //   tax     = 16.227,9 − (2.016,4 + 5.473,3)                  ≈ €8.738
    bron: 'Belastingdienst 2025 schijven + korting-formules, handreconstructie loon-only.',
  },
  {
    label: 'AOW: AHK = maximum €1.536 onder de afbouwgrens',
    income: 25_000,
    aow: true,
    field: 'algemeneHeffingskorting',
    expected: 1_536,
    tol: 1,
    bron: 'Tabel algemene heffingskorting 2025 (AOW-gerechtigd) — maximum €1.536 (belastingdeel-only).',
  },
]

function runGoldens(year: Box1TaxYear, goldens: Box1Golden[]) {
  describe(`Box 1 externe goldens ${year}`, () => {
    for (const g of goldens) {
      it(`${g.label} [bron: ${g.bron}]`, () => {
        const r = computeBox1Tax({ grossYearlyIncome: g.income, year, aow: g.aow })
        const actual = r[g.field]
        const diff = Math.abs(actual - g.expected)
        // Absolute euro-tolerantie (bewuste keuze; zie header).
        expect(
          diff,
          `${g.field} bij €${g.income}${g.aow ? ' (AOW)' : ''}: verwacht €${g.expected} ±${g.tol}, ` +
            `kreeg €${actual.toFixed(2)} (afwijking €${diff.toFixed(2)}). Bron: ${g.bron}`,
        ).toBeLessThanOrEqual(g.tol)
      })
    }
  })
}

runGoldens(2026, BOX1_GOLDENS_2026)
runGoldens(2025, BOX1_GOLDENS_2025)

/**
 * MUTATIETEST (acceptatiecriterium 4) — handmatig, NIET committen.
 * Verander tijdelijk één constante in lib/box1-tax.ts en draai deze suite:
 *   - BOX1_PARAMS[2026].algemeneHeffingskorting.max = 3_070
 *       → golden "AHK = maximum €3.115" (2026) wordt rood (afwijking €45 ≫ €1).
 *   - BOX1_PARAMS[2026].arbeidskorting.afbouwStart = 43_071 (de oude 2025-waarde)
 *       → golden "Arbeidskorting = maximum €5.685 op afbouwstart €45.592" wordt
 *         rood (op €45.592 zit de motor dan al in de afbouw) én de €60.000-
 *         eind-tot-eind-golden verschuift ~€165.
 * Terugdraaien → weer groen. Geverifieerd 21 jul 2026.
 */
