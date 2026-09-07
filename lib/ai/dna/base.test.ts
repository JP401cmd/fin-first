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
  it('houdt de lengte- en emoji-regels intact', () => {
    expect(BASE_SYSTEM_PROMPT).toMatch(/150 woorden/i)
    expect(BASE_SYSTEM_PROMPT).toMatch(/NOOIT emoji/i)
  })

  it('benoemt bij de lengteregel WAT er wegvalt, niet alleen dat het korter moet', () => {
    // Mechanisme uit de meting van 6 sep: een verbod houdt stand als het de
    // vervanging benoemt. De kale variant ("max 150 woorden, ook bij een tip")
    // maakte de mediaan juist slechter (168 -> 186).
    expect(BASE_SYSTEM_PROMPT).toMatch(/laat detail weg, niet de kern/i)
    expect(BASE_SYSTEM_PROMPT).toMatch(/één tip in plaats van drie/i)
  })

  it('benoemt per emoji-slot de vervanging (afsluiter, sectiemarkeerder, status)', () => {
    // De 23 gemeten emoji stonden in exact drie slots met een onvervulde behoefte.
    expect(BASE_SYSTEM_PROMPT).toMatch(/ook niet als afsluiter na een uitroep/i)
    expect(BASE_SYSTEM_PROMPT).toMatch(/enthousiasme leg je in de woorden zelf/i)
    expect(BASE_SYSTEM_PROMPT).toMatch(/\*\*Let op:\*\*/)
    expect(BASE_SYSTEM_PROMPT).toMatch(/status benoem je in woorden/i)
  })

  it('houdt het ∞-merkteken uitgezonderd van het emoji-verbod', () => {
    // base.ts § FRAMING licenseert ∞ expliciet; het uitvoerfilter spaart 'm ook.
    expect(BASE_SYSTEM_PROMPT).toMatch(/Alleen het ∞-symbool blijft toegestaan/i)
  })

  it('vraagt niet langer om een samenvatting én dezelfde inhoud nog eens uitgewerkt', () => {
    expect(BASE_SYSTEM_PROMPT).not.toMatch(/Begin met een directe samenvatting, dan detail/i)
    expect(BASE_SYSTEM_PROMPT).toMatch(/Begin met het antwoord zelf/i)
  })

  it('begrenst de opsomming bij een keuzevraag zonder de Wft-verwijzing te raken', () => {
    // De grootste lengte-hefboom (39 antwoorden, mediaan 220-232) zat in de eis
    // om vier overwegingen + vragen + verwijzing te geven. Alleen de opsomming
    // is begrensd; verwijzing en adviesverbod blijven woordelijk staan.
    expect(BASE_SYSTEM_PROMPT).toMatch(/niet alle vier opsommen/i)
    expect(BASE_SYSTEM_PROMPT).toMatch(/hooguit één verduidelijkende vraag/i)
    expect(BASE_SYSTEM_PROMPT).toMatch(/erkend financieel adviseur \(AFM-geregistreerd\)/i)
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
