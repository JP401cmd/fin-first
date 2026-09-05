import { describe, it, expect } from 'vitest'
import { BASE_SYSTEM_PROMPT } from './base'

/**
 * Wft-grendel voor de system-prompt-tekst zelf (kaart UR3-03, P0).
 *
 * Vier live-antwoorden van Fin overschreden de adviesgrens of noemden
 * onjuiste/verouderde fiscale feiten. Drie van de vier oorzaken waren
 * letterlijk in de DNA-tekst terug te vinden (geen gok, geen live-repro
 * nodig): de disclaimer stond instructie-matig AAN HET EIND (in directe
 * tegenspraak met AC1 "eerste alinea"), er was geen verbod op een
 * vergelijkend oordeel/aansporing zonder productnaam, en er was geen regel
 * tegen ongegronde fiscale jaartallen/percentages/drempels bij algemene
 * uitleg. Deze suite toetst de tekst zelf — net als lib/wft-copy-guard.test.ts
 * voor statische copy doet, maar dan voor het cloud-Fin-systeemprompt-DNA.
 *
 * Vierde grendel — productnaam+bedrag in tips — zit mechanisch in
 * lib/ai/tools/suggest-recommendation.test.ts (zod-refine op het tool-schema).
 */
describe('BASE_SYSTEM_PROMPT — Wft-adviesgrens (UR3-03)', () => {
  it('instrueert de adviesgrens NIET meer als afsluitende zin aan het eind', () => {
    expect(BASE_SYSTEM_PROMPT).not.toMatch(/Eindig bij adviesvragen altijd met een verwijzing/i)
  })

  it('instrueert de adviesgrens expliciet in de EERSTE alinea', () => {
    expect(BASE_SYSTEM_PROMPT).toMatch(/adviesgrens/i)
    expect(BASE_SYSTEM_PROMPT).toMatch(/eerste alinea/i)
  })

  it('verbiedt een vergelijkend oordeel tussen twee legitieme geldkeuzes', () => {
    expect(BASE_SYSTEM_PROMPT).toMatch(/vergelijkend oordeel/i)
    expect(BASE_SYSTEM_PROMPT).toMatch(/"X wint"/i)
  })

  it('verbiedt een aansporing tot een concrete geldhandeling, ook bij eenduidige rekenkunde', () => {
    expect(BASE_SYSTEM_PROMPT).toMatch(/spoor NOOIT aan/i)
    expect(BASE_SYSTEM_PROMPT).toMatch(/los dit af/i)
    // De carve-out blijft: feitelijke kostenurgentie mag, het bevel niet.
    expect(BASE_SYSTEM_PROMPT).toMatch(/beschrijvend/i)
  })

  it('verbiedt ongegronde fiscale jaartallen/percentages/drempels bij algemene uitleg', () => {
    expect(BASE_SYSTEM_PROMPT).toMatch(/ALGEMENE of begripsmatige fiscale uitleg/i)
    expect(BASE_SYSTEM_PROMPT).toMatch(/NUL jaartallen, percentages, drempels of bedragen/i)
  })

  it('behoudt de bestaande Wft-grenzen (geen productadvies, geen belastingadvies)', () => {
    expect(BASE_SYSTEM_PROMPT).toMatch(/GEEN Wft-vergunning/i)
    expect(BASE_SYSTEM_PROMPT).toMatch(/Geef GEEN belastingadvies/i)
    expect(BASE_SYSTEM_PROMPT).toMatch(/erkend financieel adviseur/i)
  })
})

/**
 * Toon-grendel (kaart UR3-11, P2).
 *
 * Een AI-ronde (5 sep 2026) mat antwoorden van 123-510 woorden (gemiddeld 190,
 * regel is max 150), emoji in de tekst ondanks een expliciet verbod, en tot
 * veertien onverklaarde vaktermen in één antwoord (rendementsgrondslag,
 * DGA-leengrens, marginaal tarief, aanmerkelijk belang, jaarruimte,
 * rekening-courant). Lengte/emoji stonden al in het DNA (adherence-gat, geen
 * missing spec) — deze suite bewaakt dat ze intact blijven. Jargon-uitleg
 * ontbrak volledig (missing-rule bug) en is hier de kernfix.
 */
describe('BASE_SYSTEM_PROMPT — toon: lengte, emoji, jargon (UR3-11)', () => {
  it('houdt de bestaande lengte- en emoji-regels intact', () => {
    expect(BASE_SYSTEM_PROMPT).toMatch(/max 150 woorden/i)
    expect(BASE_SYSTEM_PROMPT).toMatch(/NOOIT emoji/i)
  })

  it('verankert de lengteregel ook bij het delen van een tip of aandachtspunt', () => {
    expect(BASE_SYSTEM_PROMPT).toMatch(/tip of aandachtspunt deelt/i)
  })

  it('instrueert een vakterm uit te leggen in dezelfde zin, of te vermijden', () => {
    expect(BASE_SYSTEM_PROMPT).toMatch(/vakterm/i)
    expect(BASE_SYSTEM_PROMPT).toMatch(/dezelfde zin/i)
    expect(BASE_SYSTEM_PROMPT).toMatch(/vermijd de term/i)
  })

  it('verwijst voor jargon-eenvoud naar de bestaande begrippenlijst i.p.v. een tweede jargonlijst', () => {
    expect(BASE_SYSTEM_PROMPT).toMatch(/begrippenlijst/i)
  })
})
