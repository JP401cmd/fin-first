/**
 * UAT-acceptatiecriteria — getypeerde data per domein (Given/When/Then).
 *
 * Doel: een acceptatiecriterium per WF-<ZONE>-NN workflow (lib/uat/catalog.ts
 * is de bron-van-waarheid voor WELKE scenario's bestaan; dit bestand legt VAST
 * wat "geslaagd" betekent per workflow, in een vorm die zowel leesbaar is voor
 * een UAT-tester als machine-toetsbaar voor een engine-niveau vitest).
 *
 * `assertion.kind`:
 * - 'exact'       — een deterministisch cijfer, herleidbaar uit persona-brondata
 *                    (lib/test-personas.ts) via een echte rekenfunctie. `expected`
 *                    is het onafhankelijk narekende cijfer; `source` wijst naar de
 *                    functie die het moet reproduceren.
 * - 'consistency' — een "A = B"-toets (bv. lijstwaarde = detailwaarde) zonder één
 *                    hard te verifiëren cijfer, of een cijfer dat deels op
 *                    niet-deterministische input leunt (live koersen).
 * - 'direction'   — alleen de richting is toetsbaar (bv. "stijgt bij hoger bedrag").
 * - 'ui-only'     — pure interactie/weergave zonder cijfermatige uitkomst.
 */

export type AcceptanceAssertionKind = 'exact' | 'consistency' | 'direction' | 'ui-only'

export interface AcceptanceCriterion {
  /** 'WF-BEZIT-01' — de workflow uit Deel 1 (docs/uat/.../bezit.md-achtig bronbestand). */
  workflow: string
  /** 'UAT-BEZIT-01' — het bijbehorende scenario-id uit lib/uat/catalog.ts (of een
   *  verwijzing naar een ander scenario-id wanneer de workflow daar wordt gedekt). */
  scenarioId: string
  titel: string
  kriticiteit: 'KERN' | 'BELANGRIJK' | 'OVERIG'
  /** Welke test-persona (lib/test-personas.ts PersonaKey) de preconditie levert. */
  persona?: string
  /** Given — de uitgangssituatie (persona geladen, welke staat). */
  given: string
  /** When — de gebruikersactie(s) die het scenario uitvoert. */
  when: string
  /** Then — de verwachte, toetsbare uitkomst. */
  then: string
  assertion: {
    kind: AcceptanceAssertionKind
    /** Bij 'exact': het onafhankelijk narekende cijfer (of een korte notatie
     *  van meerdere samenhangende cijfers). Leeg bij de overige kinds. */
    expected?: string | number
    /** Waar het cijfer/de consistentie-eis vandaan komt — functie + bestand,
     *  of de aard van de consistentie-/richtingstoets. */
    source?: string
  }
}

export interface AcceptanceSet {
  zone: string
  criteria: AcceptanceCriterion[]
}
