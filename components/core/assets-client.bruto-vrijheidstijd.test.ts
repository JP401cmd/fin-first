/**
 * Bron-grendel op de BRUTO TELLER van /overzicht/bezittingen (UR3-19).
 *
 * De bevinding: onder "Totale waarde € 1.586.288" stond "41 jaar 4 maanden
 * vrijheid". Die teller is `totalValue` — Σ over alle actieve bezittingen, de
 * eigen woning voor de volle marktwaarde, en er gaat GEEN enkele schuld af (de
 * assets-loader kent alleen hypotheken, en die alleen voor de overwaarde-regel
 * in het detailvenster). Op het gemelde account was dat €453.620 aan schuld die
 * niet in de teller zat: ~41 jaar getoond waar ~29 jaar het netto-equivalent is.
 *
 * De NOEMER was hier nooit het probleem — `initialData.dailyExpenses` komt uit
 * `getRecentDailyExpenseRate` (12-mnd rolling, gezuiverde consumptie, ADR 0126
 * PR A). Dit is dus een tweede, losse fout naast de dagtarief-vervuiling:
 * die zat in de noemer, deze in de teller.
 *
 * En er zit een laag onder: "vermogen ÷ dagtarief" stelt een TOTALE vraag met
 * het MARGINALE instrument. ADR 0126 D1 kent precies twee vrijheidstijd-
 * grootheden — dagtarief (marginaal) en runway (totaal) — en verbiedt een
 * derde. De platte deling `computeFreedomTotal` is in PR C uit de app
 * verwijderd; hier leefde ze handgerold voort. Daarom is "netto maken" geen
 * oplossing en is de weergave vervallen (eigenaarsbesluit, optie A), met één
 * runway-zin in de deck als geldig totaal-antwoord.
 *
 * WAAROM EEN BRON-TEST: dit is een compositie-eigenschap van de bron ("welke
 * identifier gaat er als teller in de conversie"), niet van een gerenderde
 * waarde. Het gedrag van de conversie zelf is volledig afgedekt op
 * `lib/format.ts`; dat opnieuw bewijzen via `AssetsPage` zou een
 * supabase-fetchende client-component van 4.000 regels moeten optuigen.
 * Precedent: `assets-client.figures-strip.test.ts` en
 * `assets-client.wisselkoers-voetnoot.test.ts`.
 *
 * VERHOUDING TOT DE LINT-GATE: `scripts/check-freedom-time-basis.mjs` draagt
 * sinds UR3-19 dezelfde regel app-breed (regel 5, tellerregel) en draait in
 * pre-push. Deze test dekt bovendien de vórm die de gate niet ziet — de
 * gerenderde terugvallen die in de plaats kwamen.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const clientSource = readFileSync(
  join(process.cwd(), 'components', 'core', 'assets-client.tsx'),
  'utf8',
)
const pageSource = readFileSync(
  join(process.cwd(), 'app', '(app)', 'overzicht', 'bezittingen', 'page.tsx'),
  'utf8',
)

/** Alleen echte code tellen: commentaarregels leggen het besluit juist vást. */
function codeLines(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .join('\n')
}

const code = codeLines(clientSource)

describe('/overzicht/bezittingen — geen vrijheidstijd op een bruto teller (UR3-19)', () => {
  // De zes aanroepen die de kaart opheft, elk met de identifier die de
  // grondslagfout draagt. `total` (de donut) staat er apart bij: dat is de
  // parameternaam waaronder `totalValue` de AllocationPie in gaat.
  it.each([
    ['calculateFreedomTime(totalValue', 'figures-strip "Totale waarde" + donut-bron'],
    ['calculateFreedomTime(totalValueExclHome', 'subtotaal "excl. eigen woning"'],
    ['calculateFreedomTime(futureValue', 'figures-strip "Waarde over N jaar" + projectie-onderschrift'],
    ['calculateFreedomTime(total,', 'midden van de allocatie-donut'],
    ['formatWithFreedom(totalValue', 'variant via de gecombineerde helper'],
    ['formatWithFreedom(futureValue', 'variant via de gecombineerde helper'],
  ])('bevat geen %s (%s)', (fragment) => {
    expect(
      code,
      `een bruto bezittingentotaal als teller in de €→vrijheidstijd-conversie — ` +
        `dat is precies wat UR3-19 opheft (grondslag én grootheid, ADR 0126 D1)`,
    ).not.toContain(fragment)
  })

  it('geeft de allocatie-donut geen dagtarief meer mee', () => {
    expect(
      code,
      'zolang AllocationPie een dailyExpenses-prop draagt, staat de deling één regel verwijderd',
    ).not.toContain('<AllocationPie byType={byType} total={totalValue} dailyExpenses=')
  })

  it('houdt de terugvallen die in de plaats kwamen — geen lege cellen', () => {
    // Cel 1 telt bezittingen, cel 4 noemt de verwachte groei; het SubtotalLine
    // draagt alleen nog het bedrag.
    expect(code).toContain("sub: `${activeAssets.length} bezitting${activeAssets.length === 1 ? '' : 'en'}`")
    expect(code).toContain('sub: `+${fc(projectedGrowth)} verwacht`')
    expect(code).toContain('<SubtotalLine label="excl. eigen woning" amount={totalValueExclHome} />')
  })

  it('laat een ONBEZWAARD bezit zijn tijdvertaling houden, maar onderdrukt haar zodra er een schuld aan hangt', () => {
    // Het enige genuanceerde geval van de zes: `value` van één bezit is pas een
    // bruto teller als er een hypotheek/DGA-lening aan gekoppeld is — en dan
    // staat de overwaarde verderop op ditzelfde scherm.
    expect(code).toContain('const heeftGekoppeldeSchuld = mortgage != null || linkedDebts.length > 0')
    expect(code).toContain('dailyExpenses > 0 && value > 0 && !heeftGekoppeldeSchuld')
  })
})

describe('/overzicht/bezittingen — de deck draagt de runway, niet een deling (UR3-19, optie C)', () => {
  it('bouwt de zin server-side uit de canonieke motor en formuleert hem niet zelf', () => {
    expect(pageSource).toContain('computeHorizonRunway(supabase, perspective)')
    expect(pageSource).toContain('ankerReachFromRunway(runway)')
    expect(pageSource).toContain('ankerZin(reach, stop)')
  })

  it('zwijgt bij een onbekende uitkomst in plaats van een terugval te verzinnen', () => {
    expect(pageSource).toContain("runway.kind === 'unavailable'")
    expect(pageSource).toContain("reach.kind === 'onbekend'")
  })

  it('rendert de zin in de deck — nooit als `sub` onder een KPI-bedrag', () => {
    const deck = code.indexOf('deck={')
    const strip = code.indexOf('<FiguresStrip')
    const zin = code.indexOf('{runwayZin && (')
    expect(zin, 'runwayZin niet gevonden in de client — de deck-zin ontbreekt').toBeGreaterThan(-1)
    expect(zin).toBeGreaterThan(deck)
    expect(
      zin,
      'de runway volgt niet uit het bedrag in de strip; onder een KPI gezet suggereert hij het omgekeerde',
    ).toBeLessThan(strip)
  })
})
