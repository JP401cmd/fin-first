import { describe, expect, it } from 'vitest'
import {
  aiVerbruikHref,
  auditHref,
  dashboardHref,
  foutenHref,
  gebruikHref,
  parseOnderwerp,
  parsePeriode,
  taakAnker,
  taakHref,
  webprestatiesHref,
  webprestatiesPeriode,
} from './doorklik'

describe('parsePeriode', () => {
  it('accepteert alleen de drie bestaande periodes', () => {
    expect(parsePeriode('7')).toBe(7)
    expect(parsePeriode('30')).toBe(30)
    expect(parsePeriode('90')).toBe(90)
  })

  it('valt bij elke andere waarde terug op 30 dagen', () => {
    for (const raw of [undefined, '', '0', '28', '365', '-7', 'abc', '7; drop table', null, {}]) {
      expect(parsePeriode(raw), String(raw)).toBe(30)
    }
  })

  it('neemt van een herhaalde parameter de eerste', () => {
    expect(parsePeriode(['90', '7'])).toBe(90)
  })
})

describe('parseOnderwerp', () => {
  it('accepteert de vier weergaven', () => {
    expect(parseOnderwerp('betrouwbaarheid')).toBe('betrouwbaarheid')
    expect(parseOnderwerp('ai')).toBe('ai')
    expect(parseOnderwerp('ingrepen')).toBe('ingrepen')
    expect(parseOnderwerp('overzicht')).toBe('overzicht')
  })

  it('valt bij een onbekende waarde terug op het overzicht', () => {
    for (const raw of [undefined, '', 'gebruik', 'AI', '../beheer', ['x']]) {
      expect(parseOnderwerp(raw), String(raw)).toBe('overzicht')
    }
  })
})

describe('dashboardHref', () => {
  it('houdt standaardwaarden uit de URL', () => {
    expect(dashboardHref()).toBe('/beheer')
    expect(dashboardHref('overzicht', 30)).toBe('/beheer')
  })

  it('behoudt de periode bij het wisselen van weergave', () => {
    expect(dashboardHref('betrouwbaarheid', 7)).toBe('/beheer?onderwerp=betrouwbaarheid&dagen=7')
    expect(dashboardHref('ai', 30)).toBe('/beheer?onderwerp=ai')
    expect(dashboardHref('overzicht', 90)).toBe('/beheer?dagen=90')
  })

  it('wat dashboardHref schrijft, leest de parser terug', () => {
    const url = new URL(dashboardHref('ingrepen', 90), 'https://voorbeeld.test')
    expect(parseOnderwerp(url.searchParams.get('onderwerp'))).toBe('ingrepen')
    expect(parsePeriode(url.searchParams.get('dagen'))).toBe(90)
  })
})

describe('doorklik naar de detailschermen', () => {
  it('een taak linkt naar zijn eigen kaart', () => {
    expect(taakAnker('news-ingest')).toBe('taak-news-ingest')
    expect(taakHref('news-ingest')).toBe('/beheer/jobs#taak-news-ingest')
    expect(taakHref()).toBe('/beheer/jobs')
  })

  it('foutmeldingen: op soort, op context, of zonder filter', () => {
    expect(foutenHref()).toBe('/beheer/errors')
    expect(foutenHref({ soort: '0123456789abcdef' })).toBe('/beheer/errors?soort=0123456789abcdef')
    expect(foutenHref({ context: 'ai:' })).toBe('/beheer/errors?context=ai%3A')
  })

  it('audit-trail: op actie', () => {
    expect(auditHref()).toBe('/beheer/audit')
    expect(auditHref('config.update')).toBe('/beheer/audit?actie=config.update')
  })

  it('webprestaties kent 28 dagen waar het dashboard 30 zegt', () => {
    expect(webprestatiesPeriode(7)).toBe(7)
    expect(webprestatiesPeriode(30)).toBe(28)
    expect(webprestatiesPeriode(90)).toBe(90)
    expect(webprestatiesHref(30, 'LCP')).toBe('/beheer/webprestaties?dagen=28&metric=LCP')
    expect(webprestatiesHref(7)).toBe('/beheer/webprestaties?dagen=7')
  })

  it('AI-verbruik neemt de periode over; gebruik opent de band die tot vandaag loopt', () => {
    expect(aiVerbruikHref(90)).toBe('/beheer/ai-verbruik?dagen=90')
    expect(gebruikHref()).toBe('/beheer/gebruik?dagen=30')
  })
})
