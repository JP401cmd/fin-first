import { describe, it, expect } from 'vitest'
import {
  evalueerRegels,
  isOpenVoorGebruiker,
  ONGELDIGE_VERSPREIDING,
  parseVerspreiding,
  pasActieToe,
  popupKandidaat,
  popupToegestaan,
  STANDAARD_VERSPREIDING,
  telOpen,
  verspreidingSamenvatting,
  VerspreidingBeheerSchema,
  zichtbaarVoor,
  type GebruikerContext,
  type OpenLijstInput,
  type UitnodigingStaat,
  type Verspreiding,
} from './verspreiding'

/**
 * Verspreiding van vragenlijsten (ADR 0147): de standaard is het oude gedrag,
 * regels zijn een AND, onbekende meta matcht nooit, en de popup respecteert
 * aan/uit, snooze, cooldown, max weigeringen en "één tegelijk".
 */

const NU = new Date('2026-09-15T10:00:00Z')
const DAG = 86_400_000

function ctx(over: Partial<GebruikerContext> = {}): GebruikerContext {
  return {
    registratie: new Date(NU.getTime() - 40 * DAG),
    actieveDagen30: 12,
    laatstActief: new Date(NU.getTime() - 1 * DAG),
    dominanteStroom: null,
    nu: NU,
    ...over,
  }
}

function inv(over: Partial<UitnodigingStaat> = {}): UitnodigingStaat {
  return {
    bron: 'regel',
    invited_at: new Date(NU.getTime() - 3 * DAG).toISOString(),
    shown_at: null,
    snoozed_until: null,
    dismissed_at: null,
    dismiss_count: 0,
    ...over,
  }
}

function lijst(over: Partial<OpenLijstInput> = {}): OpenLijstInput {
  return {
    id: 'l1',
    created_at: new Date(NU.getTime() - 10 * DAG).toISOString(),
    verspreiding: parseVerspreiding({ doelgroep: { modus: 'iedereen' }, popup: { aan: true } }),
    invitation: null,
    has_completed: false,
    ...over,
  }
}

describe('parseVerspreiding — de standaard is het oude gedrag', () => {
  it('null → iedereen, geen popup, standaardcooldowns', () => {
    expect(parseVerspreiding(null)).toEqual(STANDAARD_VERSPREIDING)
    expect(parseVerspreiding(undefined)).toEqual(STANDAARD_VERSPREIDING)
  })

  it('ongeldig maar niet null → fail-closed (niemand, geen popup), nooit een throw', () => {
    expect(parseVerspreiding({ doelgroep: { modus: 'kapot' } })).toEqual(ONGELDIGE_VERSPREIDING)
    expect(parseVerspreiding('tekst')).toEqual(ONGELDIGE_VERSPREIDING)
    // Een kapotte handmatige lijst wordt NIET zichtbaar voor iedereen.
    expect(zichtbaarVoor({ verspreiding: parseVerspreiding({ doelgroep: { modus: 'handmatig', regels: 'x' } }), ctx: ctx(), invitation: null, heeftOpenSessie: false }))
      .toEqual({ zichtbaar: false })
  })

  it('beheer-body weigert een halve doelgroep (regels zonder regel, groepen zonder groep)', () => {
    expect(VerspreidingBeheerSchema.safeParse({ doelgroep: { modus: 'regels' } }).success).toBe(false)
    expect(VerspreidingBeheerSchema.safeParse({ doelgroep: { modus: 'groepen' } }).success).toBe(false)
    expect(VerspreidingBeheerSchema.safeParse({ doelgroep: { modus: 'groepen', groep_ids: ['1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'] } }).success).toBe(true)
  })

  it('vult ontbrekende popup-velden aan', () => {
    const v = parseVerspreiding({ doelgroep: { modus: 'regels', regels: [{ soort: 'actieve_dagen_30', min: 5 }] } })
    expect(v.popup).toEqual({ aan: false, cooldown_dagen: 14, snooze_dagen: 7, max_weigeringen: 2 })
    expect(v.doelgroep.groep_ids).toEqual([])
  })

  it('de beheer-body accepteert handmatige personen en weigert een ongeldig id', () => {
    const ok = VerspreidingBeheerSchema.safeParse({
      doelgroep: { modus: 'handmatig' },
      handmatig: [{ user_id: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', email: 'a@b.nl' }],
    })
    expect(ok.success).toBe(true)
    expect(VerspreidingBeheerSchema.safeParse({ doelgroep: { modus: 'handmatig' }, handmatig: [{ user_id: 'nee' }] }).success).toBe(false)
    expect(VerspreidingBeheerSchema.parse({ doelgroep: { modus: 'iedereen' } }).handmatig).toEqual([])
  })

  it('samenvatting per modus', () => {
    expect(verspreidingSamenvatting(STANDAARD_VERSPREIDING)).toBe('iedereen')
    expect(verspreidingSamenvatting(parseVerspreiding({ doelgroep: { modus: 'regels', regels: [{ soort: 'actieve_dagen_30', min: 5 }] } }))).toBe('1 regel')
    expect(verspreidingSamenvatting(parseVerspreiding({ doelgroep: { modus: 'handmatig' } }), 3)).toBe('3 personen')
  })
})

describe('evalueerRegels — AND, onbekende meta matcht nooit', () => {
  it('lege regellijst matcht niet (half ingevuld ≠ iedereen)', () => {
    expect(evalueerRegels([], ctx()).match).toBe(false)
  })

  it('dagen_sinds_registratie', () => {
    expect(evalueerRegels([{ soort: 'dagen_sinds_registratie', min: 30 }], ctx()).match).toBe(true)
    expect(evalueerRegels([{ soort: 'dagen_sinds_registratie', min: 41 }], ctx()).match).toBe(false)
    expect(evalueerRegels([{ soort: 'dagen_sinds_registratie', min: 0 }], ctx({ registratie: null })).match).toBe(false)
  })

  it('actieve_dagen_30 — null = niet gemeten = geen match', () => {
    expect(evalueerRegels([{ soort: 'actieve_dagen_30', min: 12 }], ctx()).match).toBe(true)
    expect(evalueerRegels([{ soort: 'actieve_dagen_30', min: 13 }], ctx()).match).toBe(false)
    expect(evalueerRegels([{ soort: 'actieve_dagen_30', min: 1 }], ctx({ actieveDagen30: null })).match).toBe(false)
  })

  it('laatst_actief_binnen', () => {
    expect(evalueerRegels([{ soort: 'laatst_actief_binnen', dagen: 1 }], ctx()).match).toBe(true)
    expect(evalueerRegels([{ soort: 'laatst_actief_binnen', dagen: 3 }], ctx({ laatstActief: new Date(NU.getTime() - 4 * DAG) })).match).toBe(false)
  })

  it('dominante_stroom met min_dagen', () => {
    const c = ctx({ dominanteStroom: 'toekomst', dagenPerStroom: { toekomst: 4 } })
    expect(evalueerRegels([{ soort: 'dominante_stroom', stroom: 'toekomst' }], c).match).toBe(true)
    expect(evalueerRegels([{ soort: 'dominante_stroom', stroom: 'toekomst', min_dagen: 5 }], c).match).toBe(false)
    expect(evalueerRegels([{ soort: 'dominante_stroom', stroom: 'budget' }], c).match).toBe(false)
    expect(evalueerRegels([{ soort: 'dominante_stroom', stroom: 'toekomst' }], ctx()).match).toBe(false)
  })

  it('AND: alle regels moeten kloppen; gematcht toont welke wél', () => {
    const r = evalueerRegels(
      [{ soort: 'actieve_dagen_30', min: 5 }, { soort: 'dagen_sinds_registratie', min: 100 }],
      ctx(),
    )
    expect(r.match).toBe(false)
    expect(r.gematcht).toEqual([{ soort: 'actieve_dagen_30', min: 5 }])
  })
})

describe('zichtbaarVoor', () => {
  const regels: Verspreiding = parseVerspreiding({
    doelgroep: { modus: 'regels', regels: [{ soort: 'actieve_dagen_30', min: 5 }] },
  })

  it('iedereen → zichtbaar', () => {
    expect(zichtbaarVoor({ verspreiding: STANDAARD_VERSPREIDING, ctx: ctx(), invitation: null, heeftOpenSessie: false }))
      .toEqual({ zichtbaar: true, via: 'iedereen' })
  })

  it('regels → zichtbaar bij match, met de gematchte regels', () => {
    expect(zichtbaarVoor({ verspreiding: regels, ctx: ctx(), invitation: null, heeftOpenSessie: false }))
      .toEqual({ zichtbaar: true, via: 'regels', gematcht: [{ soort: 'actieve_dagen_30', min: 5 }] })
    expect(zichtbaarVoor({ verspreiding: regels, ctx: ctx({ actieveDagen30: 2 }), invitation: null, heeftOpenSessie: false }))
      .toEqual({ zichtbaar: false })
  })

  it('handmatig → alleen met een handmatige uitnodiging', () => {
    const v = parseVerspreiding({ doelgroep: { modus: 'handmatig' } })
    expect(zichtbaarVoor({ verspreiding: v, ctx: ctx(), invitation: null, heeftOpenSessie: false })).toEqual({ zichtbaar: false })
    expect(zichtbaarVoor({ verspreiding: v, ctx: ctx(), invitation: inv({ bron: 'handmatig' }), heeftOpenSessie: false }))
      .toEqual({ zichtbaar: true, via: 'uitnodiging' })
    // Een eigen regel-rij geeft géén zichtbaarheid op een handmatige lijst.
    expect(zichtbaarVoor({ verspreiding: v, ctx: ctx(), invitation: inv({ bron: 'regel' }), heeftOpenSessie: false })).toEqual({ zichtbaar: false })
  })

  it('een open sessie houdt de lijst altijd zichtbaar', () => {
    const v = parseVerspreiding({ doelgroep: { modus: 'handmatig' } })
    expect(zichtbaarVoor({ verspreiding: v, ctx: ctx(), invitation: null, heeftOpenSessie: true })).toEqual({ zichtbaar: true, via: 'open_sessie' })
  })

  it('groepen → alleen bij groepsmatch of groepsuitnodiging', () => {
    const v = parseVerspreiding({ doelgroep: { modus: 'groepen', groep_ids: ['1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'] } })
    expect(zichtbaarVoor({ verspreiding: v, ctx: ctx(), invitation: null, heeftOpenSessie: false })).toEqual({ zichtbaar: false })
    expect(zichtbaarVoor({ verspreiding: v, ctx: ctx(), invitation: null, heeftOpenSessie: false, groepMatch: true })).toEqual({ zichtbaar: true, via: 'groep' })
    expect(zichtbaarVoor({ verspreiding: v, ctx: ctx(), invitation: inv({ bron: 'groep' }), heeftOpenSessie: false })).toEqual({ zichtbaar: true, via: 'uitnodiging' })
  })
})

describe('teller — open = invulbaar en niet definitief geweigerd', () => {
  it('telt open lijsten; afgerond en "niet meer" tellen niet', () => {
    expect(isOpenVoorGebruiker(lijst())).toBe(true)
    expect(isOpenVoorGebruiker(lijst({ has_completed: true }))).toBe(false)
    expect(isOpenVoorGebruiker(lijst({ invitation: inv({ dismissed_at: NU.toISOString() }) }))).toBe(false)
    // "Later" laat de teller staan: uitgesteld is niet weg.
    expect(isOpenVoorGebruiker(lijst({ invitation: inv({ snoozed_until: new Date(NU.getTime() + DAG).toISOString(), dismiss_count: 1 }) }))).toBe(true)
    expect(telOpen([lijst(), lijst({ id: 'l2', has_completed: true })])).toBe(1)
  })
})

describe('popup — aan/uit, snooze, cooldown, max weigeringen, één tegelijk', () => {
  it('uit → nooit', () => {
    expect(popupToegestaan(lijst({ verspreiding: STANDAARD_VERSPREIDING }), NU)).toBe(false)
  })

  it('aan zonder rij → toegestaan', () => {
    expect(popupToegestaan(lijst(), NU)).toBe(true)
  })

  it('snooze in de toekomst → niet; verlopen snooze → wel', () => {
    expect(popupToegestaan(lijst({ invitation: inv({ snoozed_until: new Date(NU.getTime() + DAG).toISOString(), dismiss_count: 1 }) }), NU)).toBe(false)
    expect(popupToegestaan(lijst({ invitation: inv({ snoozed_until: new Date(NU.getTime() - DAG).toISOString(), dismiss_count: 1 }) }), NU)).toBe(true)
  })

  it('cooldown na de laatste popup (14 dagen standaard)', () => {
    expect(popupToegestaan(lijst({ invitation: inv({ shown_at: new Date(NU.getTime() - 13 * DAG).toISOString() }) }), NU)).toBe(false)
    expect(popupToegestaan(lijst({ invitation: inv({ shown_at: new Date(NU.getTime() - 15 * DAG).toISOString() }) }), NU)).toBe(true)
  })

  it('max weigeringen bereikt → stil, ook al is de snooze verlopen', () => {
    expect(popupToegestaan(lijst({ invitation: inv({ dismiss_count: 2, snoozed_until: new Date(NU.getTime() - DAG).toISOString() }) }), NU)).toBe(false)
  })

  it('afgerond of geweigerd → nooit', () => {
    expect(popupToegestaan(lijst({ has_completed: true }), NU)).toBe(false)
    expect(popupToegestaan(lijst({ invitation: inv({ dismissed_at: NU.toISOString() }) }), NU)).toBe(false)
  })

  it('hoogstens één kandidaat: de oudste uitnodiging eerst', () => {
    const jong = lijst({ id: 'jong', invitation: inv({ invited_at: new Date(NU.getTime() - DAG).toISOString() }) })
    const oud = lijst({ id: 'oud', invitation: inv({ invited_at: new Date(NU.getTime() - 5 * DAG).toISOString() }) })
    const zonderRij = lijst({ id: 'zonder', created_at: new Date(NU.getTime() - 3 * DAG).toISOString() })
    expect(popupKandidaat([jong, oud, zonderRij], NU)).toBe('oud')
    expect(popupKandidaat([jong, zonderRij], NU)).toBe('zonder')
    expect(popupKandidaat([lijst({ verspreiding: STANDAARD_VERSPREIDING })], NU)).toBeNull()
  })
})

describe('pasActieToe', () => {
  const popup = STANDAARD_VERSPREIDING.popup
  const leeg = { shown_at: null, snoozed_until: null, dismissed_at: null, dismiss_count: 0 }

  it('gezien stempelt shown_at één keer', () => {
    const eerste = pasActieToe(leeg, 'gezien', popup, NU)
    expect(eerste.shown_at).toBe(NU.toISOString())
    const later = pasActieToe(eerste, 'gezien', popup, new Date(NU.getTime() + DAG))
    expect(later.shown_at).toBe(NU.toISOString())
  })

  it('later → snooze van 7 dagen en teller +1', () => {
    const r = pasActieToe(leeg, 'later', popup, NU)
    expect(r.snoozed_until).toBe(new Date(NU.getTime() + 7 * DAG).toISOString())
    expect(r.dismiss_count).toBe(1)
    expect(r.shown_at).toBe(NU.toISOString())
  })

  it('niet_meer → dismissed_at', () => {
    expect(pasActieToe(leeg, 'niet_meer', popup, NU).dismissed_at).toBe(NU.toISOString())
  })
})
