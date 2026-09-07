/**
 * Stap 1 en stap 7 van de maand-check-in hangen aan dezelfde maand (UR3-23).
 *
 * WAT ER MISGING: de maandreparatie van 5 sep (commit 5778bbd64, B-016) haalde
 * stap 1 (Terugblik) van de lopende naar de afgesloten maand, via de nieuwe
 * module `lib/checkin/terugblik.ts`. Stap 7 (Reflectie) ging niet mee: die
 * bleef `overview.monthlySavings` lezen — het ongemarkeerde, dus LOPENDE
 * maandveld (ADR 0073). Op de 5e van de maand las een gebruiker daardoor
 * "Terugblik augustus" in stap 1 en, twee stappen verderop in dezelfde flow,
 * "je hebt deze maand € -3.529 gespaard": vaste lasten van september al
 * geboekt, salaris nog niet.
 *
 * DE KEUZE: de eigenaar koos optie A (besluit 6 sep 2026) — stap 7 gaat óók
 * over de afgesloten maand. Dat overruled een eerdere expliciete ontwerpkeuze
 * (de commit-boodschap van B-016 noemde het gedrag van stap 7 "TERECHT"), op de
 * grond dat twee verschillende gespaard-bedragen binnen één check-in voor de
 * gebruiker niet uit te leggen zijn.
 *
 * WAAROM EEN BRON-GRENDEL: de check-in is één client-component van ~2400 regels
 * dat zijn cijfers uit een API-bundel trekt; de twee stappen zijn geen
 * afzonderlijk aanroepbare eenheden. De rekenkant staat al vast in
 * `lib/checkin/terugblik.test.ts` — wat híér vastligt is de bedrading: dat
 * beide stappen aan diezelfde ene bron hangen, zodat een volgende
 * venster-wijziging niet opnieuw maar één van de twee raakt. Precedent:
 * `components/app/horizon/horizon-client.euro-view.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { terugblikCijfers } from '@/lib/checkin/terugblik'

const source = readFileSync(
  join(process.cwd(), 'app', '(app)', 'core', 'checkin', 'page.tsx'),
  'utf8',
)

/**
 * Knipt de body van een stap-component uit de pagina, zónder commentaar.
 *
 * Het commentaar erbij laten maakt de grendel vals: de toelichting bij deze fix
 * noemt `overview.monthlySavings` bij naam, en een verbod op die tekst zou dan
 * op zijn eigen uitleg afgaan in plaats van op de bedrading.
 */
function stapBron(naam: string, eindMarkering: string): string {
  const start = source.indexOf(`function ${naam}(`)
  expect(start, `${naam} bestaat in page.tsx`).toBeGreaterThan(-1)
  const eind = source.indexOf(eindMarkering, start)
  expect(eind, `eindmarkering na ${naam} gevonden`).toBeGreaterThan(start)
  return source
    .slice(start, eind)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const terugblikBron = stapBron('StepTerugblik', '\nfunction StepBezittingen(')
const reflectieBron = stapBron('StepReflectie', '\n/* ── Shared: AandachtspuntenSection')

describe('check-in: stap 1 en stap 7 delen één maand-grondslag (UR3-23)', () => {
  it('stap 1 (Terugblik) leest de maand via terugblikCijfers()', () => {
    expect(terugblikBron).toContain('terugblikCijfers(overview)')
  })

  it('stap 7 (Reflectie) leest diezelfde bron, niet de lopende maand', () => {
    expect(reflectieBron).toContain('terugblikCijfers(overview)')
    // De ongemarkeerde maandvelden = de lopende, onvolledige maand (ADR 0073).
    // Dat was precies het defect; ze mogen in deze stap onder géén enkele
    // schrijfvorm meer opduiken — ook niet als `overview!.x` of via destructie,
    // want dan glipt de regressie langs een grendel op één letterlijke vorm.
    expect(reflectieBron).not.toMatch(/monthly(Savings|Income|Expenses)/)
  })

  it('stap 7 benoemt de maand waar het bedrag over gaat, i.p.v. "deze maand"', () => {
    expect(reflectieBron).toMatch(/Je hebt in \{cijfers\.label\}/)
    expect(reflectieBron).not.toMatch(/Je hebt deze maand/)
  })

  it('stap 7 draagt dezelfde lege-maand-guard als stap 1 (ADR 0131)', () => {
    // Zonder deze guard verscheen het harde bedrag onvoorwaardelijk, ook over
    // een maand zonder boekingen — de openstaande bevinding uit UR3-22.
    expect(reflectieBron).toContain('cijfers?.heeftCijfers')
    expect(terugblikBron).toContain('cijfers.heeftCijfers')
  })

  it('geen enkele stap rekent het gespaard-bedrag zelf uit', () => {
    for (const bron of [terugblikBron, reflectieBron]) {
      expect(bron).not.toMatch(/monthlyIncome\s*-\s*monthlyExpenses/)
      expect(bron).not.toMatch(/prevMonthIncome\s*-\s*prevMonthExpenses/)
    }
  })
})

describe('check-in: de gedeelde bron levert de afgesloten maand (UR3-23, repro)', () => {
  // De gemelde situatie: begin september, augustus netjes afgesloten, september
  // pas half geboekt (vaste lasten wél, salaris nog niet).
  const overview = {
    prevMonthLabel: 'augustus',
    monthBeforePrevLabel: 'juli',
    prevMonthIncome: 6_200,
    prevMonthExpenses: 4_100,
    prevMonthSavings: 2_100,
    monthBeforePrevExpenses: 4_000,
  }

  it('toont het saldo van augustus, niet de half-geboekte lopende maand', () => {
    const cijfers = terugblikCijfers(overview)
    expect(cijfers.savings).toBe(2_100)
    expect(cijfers.label).toBe('augustus')
    // Het lopende-maandcijfer uit de melding (€ -3.529) hoort hier nergens uit
    // te kunnen komen: deze functie kent de lopende maand niet eens.
    expect(cijfers.savings).toBeGreaterThan(0)
  })

  it('zwijgt over een maand zonder boekingen in plaats van "€ 0 gespaard"', () => {
    const cijfers = terugblikCijfers({
      ...overview,
      prevMonthIncome: 0,
      prevMonthExpenses: 0,
      prevMonthSavings: 0,
    })
    expect(cijfers.heeftCijfers).toBe(false)
  })
})
