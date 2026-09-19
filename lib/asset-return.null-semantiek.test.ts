// lib/asset-return.null-semantiek.test.ts
// ---------------------------------------------------------------------------
// GRENDEL op de betekenis van `assets.expected_return = null` (ADR 0166).
//
// WAAROM DIT EEN BRON-SCAN IS EN GEEN TYPE-TEST — de kaartanalyse ging ervan uit
// dat één typewijziging (`Asset.expected_return: number` → `number | null`) de
// compiler elke lezer zou laten aanwijzen. Gemeten op 19-09-2026: dat is NIET zo.
// `npx tsc --noEmit` bleef groen (exit 0) na die wijziging, omdat vrijwel elke
// lezer zijn waarde door `Number(...)` haalt en `Number(null) === 0` volstrekt
// legaal is — géén NaN, géén typefout. De compile-gate bijt dus niet, en zónder
// deze test zou de volgende agent een nieuwe `Number(a.expected_return)` kunnen
// toevoegen die NULL stil als 0% leest, zonder dat één poort rood wordt.
//
// Dat is precies de stille divergentie die deze kaart wegneemt: dezelfde
// bezitting rekent 7% in /toekomst (de kern doet de terugval) en 0% in de
// bezittingenlijst.
//
// Zelfde idioom als de andere bron-scannende grendels in deze repo
// (lib/beheer/geen-inhoud.test.ts, components/app/horizon/horizon-client.euro-view.test.ts,
// scripts/check-client-data-reads.mjs): scan de bron, houd een expliciete
// residu-/uitzonderingslijst, en laat die lijst alleen KRIMPEN.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import {
  heeftEigenRendement,
  resolveExpectedReturnPct,
} from './asset-return'
import {
  ASSET_RENDEMENT_KEUZE_KOPIJ,
  keuzeUitWaarde,
  resolveKeuzeWaarde,
  type AssetRendementKeuze,
} from './asset-return-keuze'

const REPO = join(__dirname, '..')
const SCAN_DIRS = ['lib', 'app', 'components']

/**
 * Plekken waar een kale numerieke lezing van `expected_return` GEEN defect is,
 * elk met de reden. Deze lijst mag alleen krimpen; een entry die geen treffer
 * meer oplevert maakt de test hard rood (anders veroudert de lijst stil).
 */
const UITZONDERINGEN: ReadonlyArray<{ bestand: string; reden: string }> = [
  {
    bestand: 'components/app/cash-account-view.tsx',
    reden:
      'De `?? 0` vult alleen het (uitgeschakelde) getalveld; de null-betekenis wordt daar gedragen door `rendementKeuze` (keuzeUitWaarde/resolveKeuzeWaarde), niet door dit getal.',
  },
]

function tsBestanden(dir: string): string[] {
  const out: string[] = []
  const loop = (d: string) => {
    for (const naam of readdirSync(d)) {
      if (naam === 'node_modules' || naam === '.next' || naam.startsWith('.')) continue
      const pad = join(d, naam)
      if (statSync(pad).isDirectory()) loop(pad)
      else if (/\.tsx?$/.test(naam) && !/\.test\.tsx?$/.test(naam)) out.push(pad)
    }
  }
  loop(join(REPO, dir))
  return out
}

/**
 * Een kale numerieke lezing van de ASSET-kolom.
 *
 * De ontvanger is bewust vastgepind op `a` / `asset` / `bezit` / `bezitting`:
 * `profiles.expected_return` en `fire_assumptions.expected_return` zijn een
 * ÁNDERE kolom met een andere eenheid (decimaal jaarrendement van het profiel,
 * niet nullable in deze betekenis), en die mogen hier niet als overtreding
 * tellen. In deze repo heet een asset-rij consequent `a` of `asset`; een
 * profielrij heet `p`, `profile`, `row`, `body`, `match` of `data`.
 *
 * Bewust een simpele regel-scan: hij moet leesbaar zijn voor de volgende agent,
 * niet volledig. De vangrail vervangt het nadenken niet.
 */
const ASSET_ONTVANGER = '(?:a|asset|bezit|bezitting)'
const KALE_LEZING = new RegExp(
  `(?:Number\\(\\s*${ASSET_ONTVANGER}\\??\\.expected_return\\s*\\)|\\b${ASSET_ONTVANGER}\\??\\.expected_return\\s*(?:\\?\\?|\\|\\|)\\s*0)`,
)

/**
 * Staat er in dezelfde regel al een expliciete null-afhandeling, dan is de
 * lezing juist wél bewust — bijvoorbeeld
 * `a.expected_return == null ? null : Number(a.expected_return)`.
 */
const GEGUARD = /(?:==\s*null|!=\s*null|===\s*null|!==\s*null|heeftEigenRendement|resolveExpectedReturnPct|potRendement|keuzeUitWaarde)/

/**
 * DE TWEEDE STILLE ROUTE — een één-argument-aanroep van de resolver.
 *
 * `resolveExpectedReturnPct(x)` zonder terugval geeft bij NULL gewoon 0 terug.
 * Dat is precies de NULL→0%-lezing die deze kaart wegneemt, maar hij passeert
 * tsc (de parameter heeft een default) én `GEGUARD` (de helpernaam staat in de
 * regel). Dezelfde vorm bestaat voor elke helper die een `terugval… = 0`-default
 * kreeg: wie het argument weglaat, draagt stil het oude gedrag.
 *
 * De nul-basis mag nog steeds — maar dan expliciet, met `NUL_BASIS` als
 * argument, zodat het een zichtbare keuze is in plaats van een weglating.
 */
const EEN_ARGS_RESOLVER = /resolveExpectedReturnPct\(\s*[^,()]*(?:\([^()]*\))?[^,()]*\)/

describe('assets.expected_return — NULL betekent "geen eigen aanname" (ADR 0166)', () => {
  it('de compile-gate bijt niet, dus deze bron-scan doet het: geen kale numerieke lezingen buiten de uitzonderingen', () => {
    const toegestaan = new Set(UITZONDERINGEN.map((u) => u.bestand))
    const overtredingen: string[] = []
    const geraakteUitzonderingen = new Set<string>()

    for (const dir of SCAN_DIRS) {
      for (const pad of tsBestanden(dir)) {
        const rel = relative(REPO, pad).split(sep).join('/')
        const inhoud = readFileSync(pad, 'utf8')
        // Óók bestanden die de kolom alleen via de resolver aanraken: een
        // `resolveExpectedReturnPct(pct)` met een lokaal hernoemde variabele
        // draagt het woord `expected_return` niet, en zou anders ongezien de
        // één-argument-route nemen.
        if (!inhoud.includes('expected_return') && !inhoud.includes('resolveExpectedReturnPct')) continue

        inhoud.split('\n').forEach((regel, i) => {
          // Commentaar telt niet — de docblocks noemen de verboden vorm juist
          // om 'm te verbieden.
          const kaal = regel.trim()
          if (kaal.startsWith('//') || kaal.startsWith('*') || kaal.startsWith('/*') || kaal.startsWith('{/*')) return
          if (EEN_ARGS_RESOLVER.test(regel)) {
            overtredingen.push(`${rel}:${i + 1}  [1-arg resolver] ${kaal.slice(0, 110)}`)
            return
          }
          if (!KALE_LEZING.test(regel)) return
          if (GEGUARD.test(regel)) return
          if (toegestaan.has(rel)) {
            geraakteUitzonderingen.add(rel)
            return
          }
          overtredingen.push(`${rel}:${i + 1}  ${kaal.slice(0, 120)}`)
        })
      }
    }

    expect(
      overtredingen,
      [
        'Kale numerieke lezing van assets.expected_return gevonden.',
        '`Number(null) === 0`, dus dit leest "geen eigen rendement" stil als 0% —',
        'terwijl de kern terugvalt op het profielrendement. Gebruik',
        '`resolveExpectedReturnPct(waarde, terugvalPct)` uit lib/asset-return.ts',
        '(of `potRendement` op de decimale schaal).',
      ].join(' '),
    ).toEqual([])

    // De lijst mag alleen krimpen: een uitzondering zonder treffer is dood hout.
    for (const u of UITZONDERINGEN) {
      expect(
        geraakteUitzonderingen.has(u.bestand),
        `Uitzondering ${u.bestand} levert geen treffer meer op — haal 'm uit UITZONDERINGEN.`,
      ).toBe(true)
    }
  })

  it('de scan bijt aantoonbaar: een kale lezing wordt herkend, een veilige niet', () => {
    // Zonder deze proef zou een kapotte regex de suite stil groen houden.
    expect(KALE_LEZING.test('const r = Number(a.expected_return) / 100')).toBe(true)
    expect(KALE_LEZING.test('const r = Number(asset.expected_return)')).toBe(true)
    expect(KALE_LEZING.test('expected_return: a.expected_return ?? 0,')).toBe(true)
    expect(KALE_LEZING.test('const r = Number(expectedReturn) || 0')).toBe(false)
    expect(KALE_LEZING.test('resolveExpectedReturnPct(a.expected_return, terugvalPct)')).toBe(false)
    // De PROFIEL-kolom heet net zo maar is een andere grootheid — die mag hier
    // nooit als overtreding tellen, anders wordt de lijst onleesbaar van ruis.
    expect(KALE_LEZING.test('const er = Number(row.expected_return)')).toBe(false)
    expect(KALE_LEZING.test('expected_return: data?.expected_return ?? 0.07,')).toBe(false)
    expect(KALE_LEZING.test('const grossReturn = persona.profile.expected_return ?? 0.07')).toBe(false)
    // En een regel die zélf al op null toetst is juist goed.
    expect(GEGUARD.test('a.expected_return == null ? null : Number(a.expected_return)')).toBe(true)
    // De tweede stille route: één argument = stil de nul-basis.
    expect(EEN_ARGS_RESOLVER.test('resolveExpectedReturnPct(a.expected_return)')).toBe(true)
    expect(EEN_ARGS_RESOLVER.test('const r = resolveExpectedReturnPct(rij.expected_return) / 100')).toBe(true)
    expect(EEN_ARGS_RESOLVER.test('resolveExpectedReturnPct(a.expected_return, terugvalPct)')).toBe(false)
    expect(EEN_ARGS_RESOLVER.test('resolveExpectedReturnPct(a.expected_return, NUL_BASIS)')).toBe(false)
    // Een aanroep met een functie-aanroep als eerste argument telt nog steeds als één argument.
    expect(EEN_ARGS_RESOLVER.test('resolveExpectedReturnPct(Number(a.expected_return))')).toBe(true)
  })
})

describe('resolveExpectedReturnPct — de drie betekenissen blijven gescheiden', () => {
  it('een ingevuld getal wint altijd, ook een bewuste 0', () => {
    expect(resolveExpectedReturnPct(7, 5)).toBe(7)
    // DIT is de kern van de kaart: 0 is een KEUZE (betaalrekening, bitcoin),
    // geen ontbrekende waarde. Zou dit 5 teruggeven, dan gaan betaalrekeningen
    // renderen in ieders projectie.
    expect(resolveExpectedReturnPct(0, 5)).toBe(0)
    expect(resolveExpectedReturnPct(-20, 5)).toBe(-20)
  })

  it('null en undefined vallen terug op het profielrendement', () => {
    expect(resolveExpectedReturnPct(null, 7)).toBe(7)
    expect(resolveExpectedReturnPct(undefined, 7)).toBe(7)
  })

  it('zonder terugval blijft het de oude nul-basis', () => {
    expect(resolveExpectedReturnPct(null, 0)).toBe(0)
    expect(resolveExpectedReturnPct(null, undefined)).toBe(0)
    expect(resolveExpectedReturnPct(null)).toBe(0)
  })

  it('een corrupte waarde is GEEN "ontbreken" en erft het profielrendement niet', () => {
    // Asymmetrie met potRendement bewust identiek: een NaN uit een kapotte rij
    // mag nooit stil op 7% gaan groeien.
    expect(resolveExpectedReturnPct(Number.NaN, 7)).toBe(0)
    expect(resolveExpectedReturnPct(Number.POSITIVE_INFINITY, 7)).toBe(0)
    // Een niet-eindige TERUGVAL is net zo min bruikbaar.
    expect(resolveExpectedReturnPct(null, Number.NaN)).toBe(0)
  })

  it('heeftEigenRendement scheidt precies op null/undefined', () => {
    expect(heeftEigenRendement(0)).toBe(true)
    expect(heeftEigenRendement(-3)).toBe(true)
    expect(heeftEigenRendement(null)).toBe(false)
    expect(heeftEigenRendement(undefined)).toBe(false)
  })
})

describe('de keuze in het formulier is expliciet, nooit een leeg veld', () => {
  it('een leeg veld onder "eigen" wordt GEEN null-terugval', () => {
    // De valkuil van de kaart: zou dit `null` opleveren, dan krijgt elke
    // onvoltooide invoer stil een profielrendement-aanname op bv. een auto.
    // `resolveKeuzeWaarde` geeft hier `null` terug als SIGNAAL, en de twee hosts
    // laten hun veldvalidatie daarvóór al blokkeren.
    expect(resolveKeuzeWaarde('eigen', 7)).toBe(7)
    expect(resolveKeuzeWaarde('eigen', 0)).toBe(0)
  })

  it('"profiel" slaat null op, ongeacht een achtergebleven getal in het veld', () => {
    expect(resolveKeuzeWaarde('profiel', 7)).toBeNull()
    expect(resolveKeuzeWaarde('profiel', null)).toBeNull()
  })

  it('de keuze leidt zich correct af uit een opgeslagen waarde', () => {
    expect(keuzeUitWaarde(null)).toBe('profiel')
    expect(keuzeUitWaarde(undefined)).toBe('profiel')
    expect(keuzeUitWaarde(0)).toBe('eigen')
    expect(keuzeUitWaarde(7)).toBe('eigen')
  })

  it('heen en terug is verliesvrij voor elke opgeslagen waarde', () => {
    for (const opgeslagen of [null, 0, 7, -20] as const) {
      const keuze = keuzeUitWaarde(opgeslagen)
      expect(resolveKeuzeWaarde(keuze, opgeslagen ?? 999)).toBe(opgeslagen)
    }
  })

  it('elke optie draagt keuze, effect én waarom (formulier-uitleg-norm)', () => {
    const opties: AssetRendementKeuze[] = ['eigen', 'profiel']
    for (const o of opties) {
      const k = ASSET_RENDEMENT_KEUZE_KOPIJ[o]
      expect(k.keuze.length).toBeGreaterThan(10)
      expect(k.effect.length).toBeGreaterThan(20)
      expect(k.waarom.length).toBeGreaterThan(20)
    }
  })
})
