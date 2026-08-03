import { describe, it, expect } from 'vitest'
import { screenPublishDeterministic } from './screen-publish-deterministic'

/**
 * De vijf ijkpunten komen LETTERLIJK uit de cloud-prompt van
 * `screen-publish-metadata.ts` (r59-72) — dat is precies het punt: de
 * deterministische pre-screen mag nooit een ander oordeel vellen over de
 * voorbeelden waarop de serverscreening zelf is geïnstrueerd.
 *
 * Wat deze suite NIET bewijst (en niet kan bewijzen): dat "ok" betekent dat
 * publiceren zal lukken. Het advies-vs-educatie-oordeel is een taaloordeel dat
 * op de server valt; deze functie vangt alleen wat mechanisch te zien is.
 */

const ok = (naam: string) => screenPublishDeterministic({ name: naam }).ok

describe('de vijf ijkpunten uit de cloud-prompt', () => {
  it('"Vergelijk extra aflossen met beleggen" is OK', () => {
    expect(ok('Vergelijk extra aflossen met beleggen')).toBe(true)
  })

  it('"Los je hypotheek af om 50.000 euro te besparen" is NIET OK', () => {
    expect(ok('Los je hypotheek af om 50.000 euro te besparen')).toBe(false)
  })

  it('"€321.500" is NIET OK', () => {
    expect(ok('Mijn vermogensplan €321.500')).toBe(false)
  })

  it('"Bereken je rendement bij DEGIRO" is NIET OK', () => {
    expect(ok('Bereken je rendement bij DEGIRO')).toBe(false)
  })

  it('"rendement bij een online broker" is OK', () => {
    expect(ok('Bereken je rendement bij een online broker')).toBe(true)
  })
})

describe('bedragen', () => {
  it('herkent euroteken, eenheid en gegroepeerde getallen als hetzelfde bedrag', () => {
    const res = screenPublishDeterministic({ name: 'Aflossen van €50.000' })
    expect(res.ok).toBe(false)
    if (res.ok) return
    // Twee patronen vinden dezelfde 50.000 — dat mag één melding opleveren.
    expect(res.findings.filter((f) => f.soort === 'bedrag')).toHaveLength(1)
  })

  it('laat jaartallen met rust — anders wordt de check ongeloofwaardig', () => {
    expect(ok('Box 3 vanaf 2027')).toBe(true)
    expect(ok('Pensioenplanner 2026')).toBe(true)
  })

  it('laat percentages en kleine getallen met rust', () => {
    expect(ok('Rendement bij 6% en 36% belasting over box 3')).toBe(true)
  })

  it('vangt een bedrag zonder scheidingsteken', () => {
    expect(ok('Mijn hypotheek van 280000')).toBe(false)
  })

  it('kijkt ook in de beschrijving en de aannames', () => {
    const res = screenPublishDeterministic({
      name: 'Hypotheek versus beleggen',
      description: 'Gebaseerd op mijn eigen hypotheek van €280.000.',
      assumptions: ['Rente 4%', 'Restschuld €12.500'],
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.findings.map((f) => f.veld)).toEqual(
      expect.arrayContaining(['beschrijving', 'aanname 2']),
    )
  })
})

describe('aanbieders', () => {
  it('herkent banken, brokers, fondshuizen en verzekeraars', () => {
    expect(ok('Sparen bij Rabobank')).toBe(false)
    expect(ok('Indexbeleggen via Meesman')).toBe(false)
    expect(ok('Vergelijk met een Vanguard-fonds')).toBe(false)
    expect(ok('Pensioenopbouw bij Zwitserleven')).toBe(false)
    expect(ok('Sparen bij ABN AMRO')).toBe(false)
    expect(ok('Sparen bij ABN-AMRO')).toBe(false)
  })

  it('korte afkortingen alleen als merknaam, niet in gewone tekst', () => {
    // Hoofdlettergevoelig: anders zou elke "ing"-lettergreep gaan vuren.
    expect(ok('Rekening bij ING')).toBe(false)
    expect(ok('Berekening van je vermogensopbouw')).toBe(true)
    expect(ok('Wat kost een verhuizing aan inrichting?')).toBe(true)
  })

  it('soortnamen blijven toegestaan', () => {
    expect(ok('Rendement bij een indexfonds via je bank')).toBe(true)
  })

  it('geeft een bruikbare herformulering mee', () => {
    const res = screenPublishDeterministic({ name: 'Rendement bij DEGIRO' })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.suggestion).toContain('online broker')
  })
})

describe('advies-imperatieven', () => {
  it('vangt opdrachten aan de lezer', () => {
    expect(ok('Je moet eerst je buffer vullen')).toBe(false)
    expect(ok('Kies voor aflossen boven beleggen')).toBe(false)
    expect(ok('Het beste is om maandelijks te storten')).toBe(false)
    expect(ok('Beleg het verschil')).toBe(false)
    expect(ok('Stap over naar een goedkopere aanbieder')).toBe(false)
  })

  it('laat beschrijvende vaktermen met rust', () => {
    expect(ok('Aflossen versus beleggen over 15 jaar')).toBe(true)
    expect(ok('Wat kost extra aflossen aan rente?')).toBe(true)
    expect(ok('Beleggen in box 3 vergeleken met sparen')).toBe(true)
  })
})

describe('vorm van de uitkomst', () => {
  it('een schone tekst geeft een lege bevindingenlijst', () => {
    const res = screenPublishDeterministic({ name: 'Vergelijk extra aflossen met beleggen' })
    expect(res).toEqual({ ok: true, findings: [] })
  })

  it('is puur: dezelfde invoer geeft exact dezelfde uitkomst', () => {
    const invoer = { name: 'Los je hypotheek af om €50.000 te besparen' }
    expect(screenPublishDeterministic(invoer)).toEqual(screenPublishDeterministic(invoer))
  })

  it('legt issue/suggestion van de eerste bevinding op het hoofdniveau', () => {
    const res = screenPublishDeterministic({ name: 'Beleg bij ING' })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.issue).toBe(res.findings[0].issue)
    expect(res.suggestion).toBe(res.findings[0].suggestion)
  })

  it('een lege invoer levert niets op', () => {
    expect(screenPublishDeterministic({ name: '', description: null }).ok).toBe(true)
  })
})
