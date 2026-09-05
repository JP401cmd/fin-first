/**
 * `FinFacts` is de ÉNE canonieke cijferbron voor beide Fins. Deze suite bewaakt dat
 * er ook daadwerkelijk uít gelezen wordt.
 *
 * AANLEIDING (UR3-06, testadvies van het onderzoek): `FinFacts.dagtarief` bestaat
 * specifiek om Fin hetzelfde €/dag te laten citeren als de widget — de docstring
 * zegt dat letterlijk. De twee LOKALE bouwers lazen het veld ook; de CLOUD-bouwer
 * `shared-context.ts` niet, en rekende ondertussen zijn eigen `yearlyExpenses / 365`.
 * Resultaat: de cashflowpagina zei €105/dag, cloud-Fin €135/dag en €3.500 werd 26
 * i.p.v. 33 vrijheidsdagen. Het veld was dus niet globaal dood — het was dood op de
 * plek waar het het hardst nodig was.
 *
 * Vandaar twee scans met verschillende scherpte:
 *  A. geen enkel `FinFacts`-veld zonder consument (vangt een veld dat wordt
 *     toegevoegd en vervolgens nooit getoond);
 *  B. de kerncijfers worden door de CLOUD-bouwer gelezen — de scan die het gemelde
 *     defect wél had gevangen.
 *
 * Beide bewijzen alleen dát er gelezen wordt, niet dat het juist wordt getoond; dat
 * doen `shared-context.canoniek.test.ts` en `fin-financial-facts.test.ts`.
 */

import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'

const ROOT = join(__dirname, '..', '..', '..')

const CLOUD_BOUWER = 'lib/ai/context/shared-context.ts'

/** Alle bouwers die `buildWillFinancialFacts` aanroepen (cloud-Fin + lokale Fin). */
const CONSUMENTEN = [
  CLOUD_BOUWER,
  'lib/ai/local/local-chat-context.ts',
  'lib/ai/local/local-tips-context.ts',
]

/**
 * De velden die een cijfer dragen dat óók op een scherm staat, en die de cloud-Fin
 * daarom uit de canonieke extractor MOET halen in plaats van zelf af te leiden.
 * Groeit deze lijst, dan verschuift de grens bewust — nooit stilzwijgend.
 */
const CLOUD_VERPLICHT = [
  'nettoVermogen',
  'freedomYears',
  'freedomMonths',
  'vrijheidsPct',
  'displayFireGoal',
  'fireDoelUitKernel',
  'dagtarief',
] as const

/** Veldnamen uit de `FinFacts`-interface, zonder commentaarregels. */
function finFactsVelden(): string[] {
  const src = readSourceLF(join(ROOT, 'lib/ai/context/fin-financial-facts.ts'))
  const block = src.match(/export interface FinFacts \{([\s\S]*?)\n\}/)
  if (!block) throw new Error('FinFacts-interface niet gevonden in fin-financial-facts.ts')
  const zonderCommentaar = block[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
  const velden = [...zonderCommentaar.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1])
  if (velden.length === 0) throw new Error('Geen FinFacts-velden gevonden — is de vorm van de interface gewijzigd?')
  return velden
}

/**
 * Bronbestand zonder commentaar. Elke scan hieronder toetst CODE: deze bestanden
 * lichten in commentaar juist toe wélke oude afleiding is vervangen, en zo'n
 * toelichting mag noch als leesplek (vals-positief) noch als overtreding tellen.
 */
function codeVan(pad: string): string {
  return readSourceLF(join(ROOT, pad))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

/** Leesplek: `facts.<veld>` of een destructurering van het veld. */
function leestVeld(src: string, veld: string): boolean {
  return new RegExp(`facts\\.${veld}\\b|(?:\\{|,)\\s*${veld}\\s*(?:,|\\}|:)`).test(src)
}

describe('FinFacts — geen veld zonder consument', () => {
  const velden = finFactsVelden()
  const bronnen = CONSUMENTEN.map((p) => codeVan(p))

  it('vindt de interface en de bouwers (zelftoets van de scan)', () => {
    expect(velden).toContain('dagtarief')
    expect(velden.length).toBeGreaterThanOrEqual(10)
    for (const src of bronnen) expect(src).toContain('buildWillFinancialFacts')
    // De verplichte-lijst mag geen veld noemen dat niet (meer) bestaat.
    for (const veld of CLOUD_VERPLICHT) expect(velden).toContain(veld)
  })

  it.each(velden)('veld "%s" wordt door minstens één contextbouwer gelezen', (veld) => {
    const gevonden = CONSUMENTEN.filter((_, i) => leestVeld(bronnen[i], veld))
    expect(gevonden.length, `FinFacts.${veld} heeft geen consument in ${CONSUMENTEN.join(', ')}`).toBeGreaterThan(0)
  })
})

describe('FinFacts — de cloud-Fin leest de kerncijfers zelf uit de extractor', () => {
  const cloudCode = codeVan(CLOUD_BOUWER)

  it.each(CLOUD_VERPLICHT)('shared-context.ts consumeert "%s"', (veld) => {
    expect(
      leestVeld(cloudCode, veld),
      `${CLOUD_BOUWER} leest FinFacts.${veld} niet — dat is precies het gat waar UR3-06 doorheen viel.`,
    ).toBe(true)
  })

  it('leidt het dagtarief niet meer zelf af uit de jaaruitgaven', () => {
    // De naïeve extrapolatie die €135/dag opleverde waar het scherm €105 toonde.
    expect(cloudCode).not.toMatch(/yearlyExpenses\s*\/\s*365/)
  })

  it('leest de FIRE-datum niet meer uit de eigen projectie van core-metrics', () => {
    expect(cloudCode).not.toContain('expectedFireDate')
  })
})
