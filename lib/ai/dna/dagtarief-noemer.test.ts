import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { WIL_PROMPT } from './wil'
import { RECOMMENDATIONS_SYSTEM_PROMPT } from './recommendations'

/**
 * Eén wisselkoers van euro's naar vrijheidsdagen — nu ook in de PROMPT-DNA.
 *
 * AANLEIDING (nasleep B-040, 12 sep 2026). B-040 maakte het dagtarief uit
 * `getRecentDailyExpenseRate` (12 maanden gerealiseerde consumptie, ADR 0126 D1)
 * de énige €→vrijheidsdagen-koers: de `freedomCalc`-tool leest dat tarief
 * server-side (`strictObject`, het model mag geen noemer meer meesturen) en de
 * must-regel in `buildSharedContext` is neutraal gemaakt.
 *
 * Twee prompt-plekken bleven daarbij achter en instrueerden het model om zélf
 * met een ándere noemer te rekenen:
 *   • WIL_PROMPT stap 4 — "freedom_days_impact = jaarlijkse besparing /
 *     dagelijkse must-uitgaven"
 *   • RECOMMENDATIONS_SYSTEM_PROMPT § REKENREGELS — "Dagelijkse must-uitgaven =
 *     yearlyMustExpenses / 365" plus "Dagelijkse totale uitgaven =
 *     maanduitgaven × 12 / 365"
 *
 * Die velden landen ONGEKLEMD op het scherm: `suggestRecommendation` schrijft
 * `freedom_days_per_year`/`freedom_days_impact` rechtstreeks in de
 * `recommendations`-tabel en de chatkaart toont ze ("+N dagen vrijheid"). Een
 * tweede noemer is daar dus direct zichtbare drift t.o.v. /overzicht/budget.
 *
 * WAT BEWUST BLIJFT STAAN: de claim-poort (alleen vrijheidsdagen claimen bij een
 * [essentieel] budget én retirement_expense_method = 'essential_budgets'). Die
 * poort gaat niet over de noemer maar over de vraag of de besparing het FIRE-doen
 * überhaupt verkort; hij wordt server-side gespiegeld in
 * app/api/ai/recommendations/route.ts en lib/ai/local/local-tips-context.ts
 * (`resolveTipFreedomDays`). Alleen de NOEMER is vervangen.
 */

describe('WIL_PROMPT — één noemer voor freedom_days_impact (B-040-nasleep)', () => {
  it('laat het model geen eigen noemer meer kiezen', () => {
    expect(WIL_PROMPT).toMatch(/Kies NOOIT zelf een noemer/i)
    expect(WIL_PROMPT).toMatch(/gebruik NOOIT de must-uitgaven, het maandinkomen of de maanduitgaven als noemer/i)
  })

  it('draagt de oude must-grondslag niet meer als formule', () => {
    expect(WIL_PROMPT).not.toMatch(/\/\s*dagelijkse must-uitgaven/i)
    expect(WIL_PROMPT).not.toMatch(/yearlyMustExpenses/i)
  })

  it('wijst het canonieke dagtarief uit het overzicht aan als de enige koers', () => {
    expect(WIL_PROMPT).toMatch(/Dagtarief \(uitgaven per dag\)/)
    expect(WIL_PROMPT).toMatch(/freedom_days_impact = jaarlijkse besparing \/ dagtarief/)
    expect(WIL_PROMPT).toMatch(/freedom_days_impact = \(eindbedrag × SWR\) \/ dagtarief/)
  })

  it('verwijst voor twijfelgevallen naar de freedomCalc-tool, die het tarief server-side leest', () => {
    expect(WIL_PROMPT).toMatch(/freedomCalc-tool/)
    expect(WIL_PROMPT).toMatch(/server-side/)
  })

  it('valt bij een ontbrekend dagtarief terug op 0 dagen — niet op een eigen som', () => {
    expect(WIL_PROMPT).toMatch(/Staat er geen dagtarief in het overzicht, dan freedom_days_impact = 0/i)
  })

  it('behoudt de claim-poort (essentieel budget + essential_budgets)', () => {
    expect(WIL_PROMPT).toMatch(/retirement_expense_method = 'essential_budgets'/)
    expect(WIL_PROMPT).toMatch(/freedom_days_impact = 0\. Verwoord: "€X\/jaar richting FIRE-doel"/)
  })
})

describe('RECOMMENDATIONS_SYSTEM_PROMPT — één noemer (B-040-nasleep)', () => {
  it('definieert geen eigen dagbasis meer', () => {
    expect(RECOMMENDATIONS_SYSTEM_PROMPT).not.toMatch(/Dagelijkse must-uitgaven\s*=/i)
    expect(RECOMMENDATIONS_SYSTEM_PROMPT).not.toMatch(/Dagelijkse totale uitgaven\s*=/i)
    expect(RECOMMENDATIONS_SYSTEM_PROMPT).not.toMatch(/yearlyMustExpenses/i)
    expect(RECOMMENDATIONS_SYSTEM_PROMPT).not.toMatch(/\/\s*dagelijkse must-uitgaven/i)
  })

  it('rekent vrijheidsdagen uitsluitend tegen het dagtarief uit het overzicht', () => {
    expect(RECOMMENDATIONS_SYSTEM_PROMPT).toMatch(/Dagtarief \(uitgaven per dag\)/)
    expect(RECOMMENDATIONS_SYSTEM_PROMPT).toMatch(/Vrijheidsdagen per jaar = jaarlijkse besparing \/ dagtarief/)
    expect(RECOMMENDATIONS_SYSTEM_PROMPT).toMatch(/\(eindbedrag × SWR\) \/ dagtarief/)
    expect(RECOMMENDATIONS_SYSTEM_PROMPT).toMatch(/Leid NOOIT zelf een noemer af/i)
  })

  it('valt bij een ontbrekend dagtarief terug op 0 dagen', () => {
    expect(RECOMMENDATIONS_SYSTEM_PROMPT).toMatch(/Staat er geen dagtarief in het overzicht, dan noem je geen vrijheidsdagen/i)
  })

  it('behoudt de claim-poort en de niet-veroordelende framing', () => {
    expect(RECOMMENDATIONS_SYSTEM_PROMPT).toMatch(/retirement_expense_method = 'essential_budgets'/)
    expect(RECOMMENDATIONS_SYSTEM_PROMPT).toMatch(/Zeg NOOIT "win je N vrijheidsdagen per jaar"/)
    expect(RECOMMENDATIONS_SYSTEM_PROMPT).toMatch(/Nooit veroordelend/i)
  })

  it('vraagt niet langer ALTIJD om euro én vrijheidsdagen — dat dwong dagen af waar de poort dicht staat', () => {
    // Oude regel: "Altijd zowel euro's als vrijheidsdagen noemen". Die stond
    // haaks op de VRIJHEIDSDAGEN-voorwaarden twintig regels hoger en is precies
    // de druk waaronder een model een noemer verzint.
    expect(RECOMMENDATIONS_SYSTEM_PROMPT).not.toMatch(/Altijd zowel euro's als vrijheidsdagen noemen/)
    expect(RECOMMENDATIONS_SYSTEM_PROMPT).toMatch(/verzin nooit dagen om het paar compleet te maken/i)
  })
})

/**
 * Koppeling PROMPT ↔ CONTEXTBOUWER (breekbaar, dus expliciet — zelfde patroon als
 * de `Vrijheidsdagen:`-koppeling in lib/ai/local/local-recommendations-prompt.ts).
 * Beide prompts verwijzen het model naar een regel die LETTERLIJK zo in
 * `buildSharedContext` wordt gerenderd. Hernoemt iemand dat label, dan wijzen de
 * prompts naar een regel die niet bestaat en kiest het model alsnog een eigen noemer.
 */
describe('het label waar de prompts naar verwijzen bestaat echt in de context', () => {
  it('buildSharedContext rendert de regel "Dagtarief (uitgaven per dag)"', () => {
    const bron = readFileSync(join(process.cwd(), 'lib/ai/context/shared-context.ts'), 'utf8')
    expect(bron).toContain('Dagtarief (uitgaven per dag)')
  })
})
