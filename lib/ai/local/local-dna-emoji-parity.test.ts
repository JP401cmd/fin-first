import { describe, it, expect } from 'vitest'
import { BASE_SYSTEM_PROMPT } from '@/lib/ai/dna/base'
import { LOCAL_CHAT_DNA } from './local-chat-prompt'
import { LOCAL_BRIEFING_DNA } from './local-briefing-prompt'
import { LOCAL_REPORT_DNA } from './local-report-prompt'
import { LOCAL_NEWS_DNA } from './local-news-prompt'
import { LOCAL_RECOMMENDATIONS_DNA } from './local-recommendations-prompt'

/**
 * Eén emoji-regel, vijf gecondenseerde artefacten — in ÉÉN test.
 *
 * AANLEIDING (parity-ronde sep 2026). `base.ts` scherpte het emoji-verbod aan in
 * a378ce7cc: niet alleen "geen emoji" maar ook pictogrammen, expliciet óók als
 * afsluiter na een uitroep, mét de VERVANGING erbij. Dat laatste is het werkzame
 * deel — de meting van 6 sep liet zien dat een kaal verbod niet standhoudt en een
 * verbod dat de vervanging benoemt wél (zie lib/ai/dna/base.test.ts, UR3-11).
 *
 * Dezelfde commit condenseerde die regel mee naar LOCAL_CHAT_DNA. De vier ándere
 * lokale artefacten bleven achter op het kale "geen emoji" en dat bleef vier dagen
 * onzichtbaar, omdat de parity-scanner per BESTANDSHASH meet: hij ziet dát base.ts
 * veranderde, niet wélke artefacten de wijziging hadden moeten overnemen.
 *
 * WAAROM DEZE TEST OVER ALLE VIJF TEGELIJK GAAT en niet per bestand: precies dat
 * verspreiden liet de regel uiteenlopen. Een regel die in vijf artefacten hoort te
 * gelden, hoort op één plek te worden afgedwongen.
 *
 * WAAROM DIT OP DE LOKALE PADEN ZWAARDER WEEGT DAN IN DE CLOUD: de
 * emoji-uitvoerfilter (`lib/ai/emoji-output-filter.ts`, via `chat-output-filter`)
 * draait ALLEEN op app/api/ai/chat/route.ts. Briefing, rapport, nieuws en
 * aanbevelingen hebben geen enkele post-hoc emoji-guard — daar is de promptregel
 * de enige verdediging. En het zijn juist vierende/aanmoedigende teksten: precies
 * het slot waar een model een 🎉 of ✅ achter wil plakken.
 */

/** De artefacten die de aangescherpte regel voluit moeten dragen. */
const ARTEFACTEN: ReadonlyArray<readonly [naam: string, dna: string]> = [
  ['LOCAL_CHAT_DNA', LOCAL_CHAT_DNA],
  ['LOCAL_BRIEFING_DNA', LOCAL_BRIEFING_DNA],
  ['LOCAL_REPORT_DNA', LOCAL_REPORT_DNA],
  ['LOCAL_NEWS_DNA', LOCAL_NEWS_DNA],
  ['LOCAL_RECOMMENDATIONS_DNA', LOCAL_RECOMMENDATIONS_DNA],
]

describe('emoji-verbod — parity tussen base.ts en de lokale artefacten', () => {
  it('de bron draagt de aangescherpte regel nog (anders wijst deze suite naar niets)', () => {
    // Faalt deze als eerste, dan is base.ts gewijzigd en is dit een
    // hercondensatie-vraag voor de lokale-prompt-parity-skill — geen testfout.
    expect(BASE_SYSTEM_PROMPT).toMatch(/ook niet als afsluiter na een uitroep/i)
    expect(BASE_SYSTEM_PROMPT).toMatch(/enthousiasme leg je in de woorden zelf/i)
    expect(BASE_SYSTEM_PROMPT).toMatch(/status benoem je in woorden/i)
  })

  it.each(ARTEFACTEN)('%s verbiedt ook pictogrammen, niet alleen emoji', (_naam, dna) => {
    expect(dna).toMatch(/pictogram/i)
  })

  it.each(ARTEFACTEN)('%s sluit het afsluiter-slot expliciet af', (_naam, dna) => {
    // Het meest gemeten slot: een 🎉 of 👍 ná een uitroep. Een model leest
    // "geen emoji" als "geen emoji in de tekst" en beschouwt de afsluiter niet
    // als tekst.
    expect(dna).toMatch(/ook niet als afsluiter na een uitroep/i)
  })

  it.each(ARTEFACTEN)('%s benoemt de VERVANGING, niet alleen het verbod', (_naam, dna) => {
    // De kern van UR3-11: een verbod zonder alternatief laat een onvervulde
    // behoefte staan, en die vult het model alsnog met een teken.
    expect(dna).toMatch(/enthousiasme leg je in de woorden zelf/i)
    expect(dna).toMatch(/status benoem je in woorden/i)
  })
})

describe('de ∞-uitzondering staat alleen waar ∞ kan voorkomen', () => {
  // Een uitzondering licentieert een teken. Ze hoort dus precies daar waar het
  // teken in de invoer of uitvoer kan landen — niet overal "voor de netheid".
  const MET_INFINITY: ReadonlyArray<readonly [naam: string, dna: string]> = [
    ['LOCAL_CHAT_DNA', LOCAL_CHAT_DNA],
    ['LOCAL_BRIEFING_DNA', LOCAL_BRIEFING_DNA],
    ['LOCAL_REPORT_DNA', LOCAL_REPORT_DNA],
    ['LOCAL_RECOMMENDATIONS_DNA', LOCAL_RECOMMENDATIONS_DNA],
  ]

  it.each(MET_INFINITY)('%s houdt ∞ uitgezonderd (vrijheidstijd kan ∞ zijn)', (_naam, dna) => {
    // `formatWithFreedom` levert bij een dagtarief van 0 letterlijk "∞ vrijheid"
    // (lib/format.ts). Deze artefacten schrijven over vrijheidstijd, dus zonder
    // uitzondering zou het model zijn eigen bron moeten censureren.
    expect(dna).toMatch(/Alleen het ∞-symbool blijft toegestaan/i)
  })

  it('LOCAL_NEWS_DNA laat ∞ BEWUST ongenoemd — het kan daar niet in de invoer landen', () => {
    // Het nieuwsprofiel rendert het dagtarief als euro-bedrag (`euro()`, niet
    // `formatWithFreedom`) en het bronartikel is externe RSS-tekst. Er is dus
    // geen ∞ om te sparen, en een uitzondering die nergens op slaat nodigt
    // alleen maar uit het teken te gebruiken.
    //
    // Wordt deze test ooit rood omdat iemand ∞ toevoegt: controleer eerst of
    // renderLocalNewsOverview inmiddels vrijheidstijd rendert. Zo ja, dan is de
    // toevoeging juist en mag deze verwachting om.
    expect(LOCAL_NEWS_DNA).not.toMatch(/∞/)
  })
})
