/**
 * Bevinding C1 — "het kernantwoord van de app verschilt per laadbeurt".
 *
 * Deze suite pint de enige plek vast waar nog besloten wordt WELK getal de
 * hero-KPI van /toekomst toont. De bevinding was niet dat één getal fout was:
 * alle drie de getallen waren op zichzelf verdedigbaar. De fout was dat drie
 * bronnen op dezelfde plek mochten antwoorden en de gebruiker niet kon zien
 * welke hij las. De tests hieronder bewaken daarom twee dingen tegelijk: welk
 * getal wint, én dat een niet-definitief getal ook als zodanig herkenbaar is.
 */

import { describe, it, expect } from 'vitest'
import {
  resolveHeroFireAge,
  formatHeroFireAge,
  heroFireAgeCaption,
  isHeroAnswerInvalid,
  isHeroAnswerPending,
} from './hero-fire-age'
import { MAX_AGE } from '@/lib/horizon-kernel/types'

describe('resolveHeroFireAge — welk getal wint', () => {
  it('de kernel wint van een eerder snapshot-antwoord', () => {
    const state = resolveHeroFireAge({
      hasKernelResult: true,
      kernelFireAgeFractional: 52.9,
      serverFireAge: 67,
    })
    expect(state).toEqual({ status: 'definitief', age: 52.9, bron: 'kernel' })
  })

  it('valt binnen de kernel terug op de hele-jaren-leeftijd als de fractionele ontbreekt', () => {
    const state = resolveHeroFireAge({
      hasKernelResult: true,
      kernelFireAgeFractional: null,
      kernelFireAge: 53,
    })
    expect(state).toEqual({ status: 'definitief', age: 53, bron: 'kernel' })
  })

  it('kernel klaar zonder leeftijd = "niet haalbaar" → onbekend, GEEN tweede getal', () => {
    // Dit is de kern van de bevinding: hier stond eerder `fire.fireAge` uit
    // computeFireProjection — een tweede motor die wél een getal gaf terwijl de
    // canonieke motor "niet haalbaar" zei.
    const state = resolveHeroFireAge({
      hasKernelResult: true,
      kernelFireAgeFractional: null,
      kernelFireAge: null,
      serverFireAge: 61.6,
    })
    expect(state).toEqual({ status: 'onbekend', age: null, bron: null })
  })

  it('zonder kernel-resultaat toont het snapshot-antwoord, maar als VOORLOPIG', () => {
    const state = resolveHeroFireAge({
      hasKernelResult: false,
      serverFireAge: 61.6,
      isRefining: true,
    })
    expect(state).toEqual({ status: 'voorlopig', age: 61.6, bron: 'server-kernel' })
    expect(isHeroAnswerPending(state)).toBe(true)
  })

  it('zonder kernel-resultaat en zonder snapshot: berekenen zolang de worker draait', () => {
    expect(resolveHeroFireAge({ hasKernelResult: false, isRefining: true })).toEqual({
      status: 'berekenen',
      age: null,
      bron: null,
    })
  })

  it('zonder kernel-resultaat en zonder lopende run: onbekend', () => {
    expect(resolveHeroFireAge({ hasKernelResult: false, isRefining: false })).toEqual({
      status: 'onbekend',
      age: null,
      bron: null,
    })
  })

  it('negeert een niet-eindig getal uit welke bron dan ook', () => {
    expect(resolveHeroFireAge({ hasKernelResult: true, kernelFireAgeFractional: NaN }).status).toBe('onbekend')
    expect(
      resolveHeroFireAge({ hasKernelResult: false, serverFireAge: Infinity, isRefining: false }).status,
    ).toBe('onbekend')
  })
})

describe('resolveHeroFireAge — aow-anker (de "exact 67"-tak, sinds ADR 0129 F3a één anker-tak)', () => {
  const gedekt = { kind: 'gedekt' as const, endAge: 90 }

  it('markeert het antwoord als voorlopig zolang de wettelijke tabel niet geladen is', () => {
    // `lookupAowAge` valt zonder tabel terug op NL_AOW_AGE = 67, dus de run rekende
    // met een terugval-AOW. Dat mag getoond worden, maar niet als eindantwoord.
    const state = resolveHeroFireAge({
      hasKernelResult: true,
      stopAnker: { soort: 'aow' },
      ankerReach: gedekt,
      vastStopLeeftijd: 67,
      aowTableLoaded: false,
    })
    expect(state.status).toBe('voorlopig')
    expect(state.bron).toBe('kernel-runway')
    // Het kopgetal is het BEREIK (hoe ver reikt het geld), het stopmoment reist mee.
    expect(state.age).toBe(90)
    expect(state.anker?.stopAge).toBe(67)
  })

  it('is definitief zodra de wettelijke tabel geladen is', () => {
    const state = resolveHeroFireAge({
      hasKernelResult: true,
      stopAnker: { soort: 'aow' },
      ankerReach: gedekt,
      vastStopLeeftijd: 67.25,
      aowTableLoaded: true,
    })
    expect(state.status).toBe('definitief')
    expect(state.anker?.stopAge).toBe(67.25)
  })

  it('aow-anker zonder bereik = berekenen zolang de kernel draait (nooit een FIRE-getal in de plaats)', () => {
    const state = resolveHeroFireAge({
      hasKernelResult: false,
      stopAnker: { soort: 'aow' },
      kernelFireAgeFractional: 52.9,
      isRefining: true,
    })
    expect(state.status).toBe('berekenen')
    expect(state.age).toBeNull()
  })
})

describe('resolveHeroFireAge — determinisme (de eigenlijke klacht)', () => {
  it('dezelfde invoer geeft altijd hetzelfde antwoord', () => {
    const input = {
      hasKernelResult: true as const,
      kernelFireAgeFractional: 52.9,
      serverFireAge: 67,
      isRefining: false,
    }
    expect(resolveHeroFireAge(input)).toEqual(resolveHeroFireAge(input))
  })

  it('het antwoord ná settle is onafhankelijk van wat er tijdens het laden stond', () => {
    // Twee laadbeurten met identieke gegevens, maar een verschillend
    // tussenstadium (snel: meteen kernel; traag: eerst snapshot). Na settle moet
    // het getal identiek zijn — dat is precies wat de tester bij 3-5x herladen
    // NIET zag.
    const snel = resolveHeroFireAge({ hasKernelResult: true, kernelFireAgeFractional: 52.9 })
    const traagTussenstand = resolveHeroFireAge({
      hasKernelResult: false,
      serverFireAge: 67,
      isRefining: true,
    })
    const traagNaSettle = resolveHeroFireAge({
      hasKernelResult: true,
      kernelFireAgeFractional: 52.9,
      serverFireAge: 67,
    })

    expect(traagNaSettle).toEqual(snel)
    // ...en de tussenstand was herkenbaar als tussenstand.
    expect(isHeroAnswerPending(traagTussenstand)).toBe(true)
    expect(isHeroAnswerPending(traagNaSettle)).toBe(false)
  })
})

describe('formatHeroFireAge / heroFireAgeCaption', () => {
  // M5 — het kopgetal toont HELE jaren. Een tiende van een jaar, vijftien jaar
  // vooruit, is precisie die de projectie niet heeft; de welkomstoverlay op
  // dezelfde pagina rondde al af ("rond je 53e"). Eén stijl per getal.
  it('rondt de FIRE-leeftijd af op een heel jaar', () => {
    expect(formatHeroFireAge({ status: 'definitief', age: 52.94, bron: 'kernel' })).toBe('53')
    expect(formatHeroFireAge({ status: 'definitief', age: 52.4, bron: 'kernel' })).toBe('52')
  })

  it('toont de voorgeformatteerde AOW-tekst bij bron aow-tabel', () => {
    expect(
      formatHeroFireAge({ status: 'definitief', age: 67.25, bron: 'aow-tabel' }, { aowText: '67j + 3m' }),
    ).toBe('67j + 3m')
  })

  it('gebruikt het per-oppervlak meegegeven streepje bij geen antwoord', () => {
    expect(formatHeroFireAge({ status: 'onbekend', age: null, bron: null }, { dash: '-' })).toBe('-')
    expect(formatHeroFireAge({ status: 'onbekend', age: null, bron: null })).toBe('–')
  })

  it('toont een reken-tekst i.p.v. een getal zolang er geen antwoord is', () => {
    expect(formatHeroFireAge({ status: 'berekenen', age: null, bron: null })).toBe('berekenen…')
    expect(
      formatHeroFireAge({ status: 'berekenen', age: null, bron: null }, { pendingText: '···' }),
    ).toBe('···')
  })

  it('markeert een voorlopig antwoord in het onderschrift', () => {
    expect(heroFireAgeCaption({ status: 'voorlopig', age: 61.6, bron: 'server-kernel' }, 'jaar')).toBe('jaar · voorlopig')
    expect(heroFireAgeCaption({ status: 'berekenen', age: null, bron: null }, 'jaar')).toBe('wordt berekend…')
    expect(heroFireAgeCaption({ status: 'definitief', age: 52.9, bron: 'kernel' }, 'jaar')).toBe('jaar')
  })
})

describe('resolveHeroFireAge — M6-vangrail (parkeerstand op het horizonplafond)', () => {
  it('een kernel-leeftijd op het plafond is geen antwoord maar een gegevensprobleem', () => {
    const state = resolveHeroFireAge({ hasKernelResult: true, kernelFireAgeFractional: MAX_AGE })
    expect(state.status).toBe('ongeldig')
    expect(state.age).toBeNull()
    expect(isHeroAnswerInvalid(state)).toBe(true)
  })

  it('geldt ook voor de voorlopige SERVER-kernelrun', () => {
    const state = resolveHeroFireAge({ hasKernelResult: false, serverFireAge: MAX_AGE, isRefining: false })
    expect(state.status).toBe('ongeldig')
    expect(state.age).toBeNull()
  })

  it('een leeftijd net onder het plafond blijft gewoon een antwoord', () => {
    const state = resolveHeroFireAge({ hasKernelResult: true, kernelFireAgeFractional: MAX_AGE - 0.5 })
    expect(state.status).toBe('definitief')
    expect(state.age).toBe(MAX_AGE - 0.5)
  })

  it('toont geen getal en zet de gegevensmelding in het onderschrift', () => {
    const state = resolveHeroFireAge({ hasKernelResult: true, kernelFireAgeFractional: MAX_AGE })
    expect(formatHeroFireAge(state)).toBe('–')
    expect(heroFireAgeCaption(state, 'jaar')).toBe('we missen gegevens')
  })

  it('"niet haalbaar" (geen leeftijd) blijft onbekend — dat is een ander geval', () => {
    const state = resolveHeroFireAge({ hasKernelResult: true, kernelFireAgeFractional: null })
    expect(state.status).toBe('onbekend')
    expect(isHeroAnswerInvalid(state)).toBe(false)
    expect(heroFireAgeCaption(state, 'jaar')).toBe('jaar')
  })
})
