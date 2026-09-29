import { describe, expect, it } from 'vitest'
import { errorSignature } from '@/lib/alerts/error-signature'
import { buildErrorGroups, type ErrorLogRow, type ErrorResolutionRow } from '@/lib/error-groups'
import {
  bouwFoutsoorten,
  impactPerSoort,
  isAiFout,
  naarVoorvallen,
  nieuwInPeriode,
  recentVanafDag,
  telGebruikers,
  voorvallenVan,
} from './fouten'

const NU = new Date('2026-09-29T10:00:00Z')
const OPTIES = { nu: NU, recentDagen: 7 }

let teller = 0
function rij(deel: Partial<ErrorLogRow> & Pick<ErrorLogRow, 'created_at'>): ErrorLogRow {
  teller += 1
  return {
    id: `rij-${teller}`,
    context: 'client:render',
    message: 'Kan eigenschap niet lezen',
    level: 'error',
    url: '/overzicht',
    stack: null,
    user_id: null,
    ...deel,
  }
}

function beeld(rows: ErrorLogRow[], resolutions: ErrorResolutionRow[] = []) {
  return bouwFoutsoorten(naarVoorvallen(rows), buildErrorGroups(rows, resolutions), OPTIES)
}

describe('isAiFout', () => {
  it('herkent de context waarmee de AI-middleware logt, ongeacht hoofdletters', () => {
    expect(isAiFout('ai:chat')).toBe(true)
    expect(isAiFout('AI:briefing')).toBe(true)
  })

  it('matcht geen context die alleen "ai" bevat', () => {
    expect(isAiFout('mail:ai')).toBe(false)
    expect(isAiFout('aiding')).toBe(false)
    expect(isAiFout(null)).toBe(false)
  })
})

describe('naarVoorvallen', () => {
  it('gebruikt dezelfde sleutel als de groepering van /beheer/errors', () => {
    const r = rij({ created_at: '2026-09-28T09:00:00Z', message: 'Bedrag 1.234,56 ongeldig' })
    expect(naarVoorvallen([r])[0].signature).toBe(errorSignature(r.context, r.message))
  })

  it('draagt de melding zelf niet mee', () => {
    const v = naarVoorvallen([rij({ created_at: '2026-09-28T09:00:00Z', message: 'geheime tekst' })])[0]
    expect(JSON.stringify(v)).not.toContain('geheime tekst')
  })

  it('een ontbrekende gebruiker wordt null, geen undefined', () => {
    const r = rij({ created_at: '2026-09-28T09:00:00Z' })
    delete r.user_id
    expect(naarVoorvallen([r])[0].gebruiker).toBeNull()
  })

  it('het gebruikers-id gaat niet mee: een voorval draagt een volgnummer', () => {
    const voorvallen = naarVoorvallen([
      rij({ created_at: '2026-09-28T09:00:00Z', user_id: '6f1c2a9e-geheim-id-a' }),
      rij({ created_at: '2026-09-28T10:00:00Z', user_id: '0b7d44c1-geheim-id-b' }),
      rij({ created_at: '2026-09-28T11:00:00Z', user_id: '6f1c2a9e-geheim-id-a' }),
      rij({ created_at: '2026-09-28T12:00:00Z', user_id: null }),
    ])
    expect(voorvallen.map((v) => v.gebruiker)).toEqual([1, 2, 1, null])
    expect(JSON.stringify(voorvallen)).not.toContain('geheim-id')
  })
})

describe('bouwFoutsoorten — gebruikersimpact', () => {
  it('telt een gebruiker één keer, hoe vaak de fout hem ook raakte', () => {
    const [s] = beeld([
      rij({ created_at: '2026-09-28T09:00:00Z', user_id: 'a' }),
      rij({ created_at: '2026-09-28T10:00:00Z', user_id: 'a' }),
      rij({ created_at: '2026-09-28T11:00:00Z', user_id: 'b' }),
    ])
    expect(s.gebruikers).toBe(2)
    expect(s.zonderGebruiker).toBe(0)
    expect(s.aantal).toBe(3)
  })

  it('voorvallen zonder gebruiker tellen als voorval, niet als gebruiker', () => {
    const [s] = beeld([
      rij({ created_at: '2026-09-28T09:00:00Z', user_id: 'a' }),
      rij({ created_at: '2026-09-28T10:00:00Z', user_id: null }),
      rij({ created_at: '2026-09-28T11:00:00Z', user_id: null }),
    ])
    expect(s.gebruikers).toBe(1)
    expect(s.zonderGebruiker).toBe(2)
  })

  it('houdt soorten uit elkaar: een gebruiker van soort A telt niet bij soort B', () => {
    const soorten = beeld([
      rij({ created_at: '2026-09-28T09:00:00Z', user_id: 'a', message: 'Fout A' }),
      rij({ created_at: '2026-09-28T10:00:00Z', user_id: 'b', message: 'Fout B' }),
    ])
    expect(soorten).toHaveLength(2)
    expect(soorten.every((s) => s.gebruikers === 1)).toBe(true)
  })
})

describe('bouwFoutsoorten — recent', () => {
  it('"recent" begint zeven dagen terug, vandaag inbegrepen', () => {
    expect(recentVanafDag(OPTIES)).toBe('2026-09-23')
  })

  it('de eerste dag van het venster telt mee, de dag ervoor niet', () => {
    const [s] = beeld([
      rij({ created_at: '2026-09-22T12:00:00Z' }), // net buiten
      rij({ created_at: '2026-09-23T12:00:00Z' }), // eerste dag
      rij({ created_at: '2026-09-29T09:00:00Z' }), // vandaag
    ])
    expect(s.aantal).toBe(3)
    expect(s.recent).toBe(2)
  })

  it('een soort zonder recente voorvallen heeft recent 0', () => {
    const [s] = beeld([rij({ created_at: '2026-08-01T12:00:00Z' })])
    expect(s.recent).toBe(0)
  })
})

describe('bouwFoutsoorten — open, afgehandeld, teruggekomen', () => {
  const rows = [
    rij({ created_at: '2026-09-10T09:00:00Z' }),
    rij({ created_at: '2026-09-26T09:00:00Z' }),
    rij({ created_at: '2026-09-27T09:00:00Z' }),
  ]
  const signature = errorSignature(rows[0].context, rows[0].message)
  const afgevinkt = (resolved_at: string): ErrorResolutionRow => ({
    signature,
    resolved_at,
    resolved_by: 'beheerder',
    note: null,
    resolved_count: 1,
    last_seen_at: '2026-09-10T09:00:00Z',
  })

  it('nooit afgevinkt: open, niet teruggekomen', () => {
    const [s] = beeld(rows)
    expect(s.open).toBe(true)
    expect(s.teruggekomen).toBe(false)
    expect(s.teruggekomenSinds).toBeNull()
  })

  it('afgevinkt en daarna opnieuw voorgekomen: teruggekomen, met het EERSTE voorval na het afvinken', () => {
    const [s] = beeld(rows, [afgevinkt('2026-09-15T09:00:00Z')])
    expect(s.open).toBe(true)
    expect(s.teruggekomen).toBe(true)
    expect(s.sindsAfvinken).toBe(2)
    expect(s.teruggekomenSinds).toBe('2026-09-26T09:00:00Z')
  })

  it('afgevinkt na het laatste voorval: afgehandeld, niet teruggekomen', () => {
    const [s] = beeld(rows, [afgevinkt('2026-09-28T09:00:00Z')])
    expect(s.open).toBe(false)
    expect(s.teruggekomen).toBe(false)
    expect(s.teruggekomenSinds).toBeNull()
  })

  it('een voorval precies op het moment van afvinken telt niet als terugkeer', () => {
    const [s] = beeld(rows, [afgevinkt('2026-09-27T09:00:00Z')])
    expect(s.open).toBe(false)
    expect(s.teruggekomenSinds).toBeNull()
  })
})

describe('bouwFoutsoorten — voorbeeld', () => {
  it('kort een lange melding in en houdt een korte heel', () => {
    const lang = 'x'.repeat(400)
    expect(beeld([rij({ created_at: '2026-09-28T09:00:00Z', message: lang })])[0].voorbeeld).toHaveLength(140)
    expect(beeld([rij({ created_at: '2026-09-28T09:00:00Z', message: 'Kort' })])[0].voorbeeld).toBe('Kort')
  })
})

describe('telGebruikers en voorvallenVan', () => {
  const voorvallen = naarVoorvallen([
    rij({ created_at: '2026-09-20T09:00:00Z', user_id: 'a', message: 'Fout A' }),
    rij({ created_at: '2026-09-28T09:00:00Z', user_id: 'a', message: 'Fout A' }),
    rij({ created_at: '2026-09-28T10:00:00Z', user_id: 'a', message: 'Fout B' }),
    rij({ created_at: '2026-09-28T11:00:00Z', user_id: null, message: 'Fout B' }),
  ])
  const sigA = voorvallen[0].signature
  const sigB = voorvallen[2].signature

  it('een gebruiker die door twee soorten geraakt is, telt over beide samen één keer', () => {
    expect(telGebruikers(voorvallen)).toEqual({ gebruikers: 1, zonderGebruiker: 1, voorvallen: 4 })
  })

  it('een lege verzameling geeft nullen', () => {
    expect(telGebruikers([])).toEqual({ gebruikers: 0, zonderGebruiker: 0, voorvallen: 0 })
  })

  it('voorvallenVan filtert op soort', () => {
    expect(voorvallenVan(voorvallen, new Set([sigA]))).toHaveLength(2)
    expect(voorvallenVan(voorvallen, new Set([sigA, sigB]))).toHaveLength(4)
    expect(voorvallenVan(voorvallen, new Set())).toHaveLength(0)
  })

  it('voorvallenVan filtert op dag, met de grensdag inbegrepen', () => {
    expect(voorvallenVan(voorvallen, new Set([sigA]), '2026-09-28')).toHaveLength(1)
    expect(voorvallenVan(voorvallen, new Set([sigA]), '2026-09-20')).toHaveLength(2)
    expect(voorvallenVan(voorvallen, new Set([sigA]), '2026-09-29')).toHaveLength(0)
  })
})

describe('impactPerSoort', () => {
  const voorvallen = naarVoorvallen([
    rij({ created_at: '2026-09-10T09:00:00Z', user_id: 'oud', message: 'Fout A' }),
    rij({ created_at: '2026-09-23T09:00:00Z', user_id: 'a', message: 'Fout A' }),
    rij({ created_at: '2026-09-28T09:00:00Z', user_id: 'a', message: 'Fout A' }),
    rij({ created_at: '2026-09-28T10:00:00Z', user_id: null, message: 'Fout A' }),
    rij({ created_at: '2026-09-28T11:00:00Z', user_id: 'b', message: 'Fout B' }),
  ])
  const sigA = voorvallen[0].signature
  const sigB = voorvallen[4].signature

  it('telt per soort, alleen vanaf de grensdag (die zelf meetelt)', () => {
    const impact = impactPerSoort(voorvallen, '2026-09-23')
    expect(impact.get(sigA)).toEqual({ gebruikers: 1, zonderGebruiker: 1, voorvallen: 3 })
    expect(impact.get(sigB)).toEqual({ gebruikers: 1, zonderGebruiker: 0, voorvallen: 1 })
  })

  it('een soort zonder voorvallen in de periode ontbreekt, in plaats van op nul te staan', () => {
    const impact = impactPerSoort(voorvallen, '2026-09-29')
    expect(impact.size).toBe(0)
  })
})

describe('nieuwInPeriode', () => {
  const soorten = beeld([
    rij({ created_at: '2026-09-20T09:00:00Z', message: 'Oud' }),
    rij({ created_at: '2026-09-24T09:00:00Z', message: 'Begin' }),
    rij({ created_at: '2026-09-26T09:00:00Z', message: 'Eind' }),
    rij({ created_at: '2026-09-27T09:00:00Z', message: 'Na' }),
  ])

  it('neemt beide grensdagen mee en niets daarbuiten', () => {
    const nieuw = nieuwInPeriode(soorten, '2026-09-24', '2026-09-26')
    expect(nieuw.map((s) => s.voorbeeld).sort()).toEqual(['Begin', 'Eind'])
  })

  it('een soort die eerder al voorkwam is niet nieuw, ook als hij in de periode terugkomt', () => {
    const metHerhaling = beeld([
      rij({ created_at: '2026-09-20T09:00:00Z', message: 'Oud' }),
      rij({ created_at: '2026-09-25T09:00:00Z', message: 'Oud' }),
    ])
    expect(nieuwInPeriode(metHerhaling, '2026-09-24', '2026-09-26')).toHaveLength(0)
  })
})
