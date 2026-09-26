import { beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { GEBEURTENIS_NIET_VERPLAATST } from '@/lib/horizon/katern-copy'

const h = vi.hoisted(() => ({
  resultaat: { data: null as { id: string }[] | null, error: null as unknown },
  aanroepen: [] as string[],
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (tabel: string) => {
      h.aanroepen.push(`from:${tabel}`)
      return {
        update: (patch: unknown) => {
          h.aanroepen.push(`update:${JSON.stringify(patch)}`)
          return {
            eq: (kolom: string, waarde: string) => {
              h.aanroepen.push(`eq:${kolom}=${waarde}`)
              return {
                select: (kolommen: string) => {
                  h.aanroepen.push(`select:${kolommen}`)
                  return Promise.resolve(h.resultaat)
                },
              }
            },
          }
        },
      }
    },
  }),
}))

import { verplaatsLevensgebeurtenis } from './levensgebeurtenis-verplaatsen'

beforeEach(() => {
  h.aanroepen = []
  h.resultaat = { data: null, error: null }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('verplaatsLevensgebeurtenis — alleen precies één geraakte rij is "verplaatst"', () => {
  it('één rij: verplaatst, via update().eq().select("id")', async () => {
    h.resultaat = { data: [{ id: 'ev-1' }], error: null }
    await expect(verplaatsLevensgebeurtenis('ev-1', { target_age: 60, target_date: null })).resolves.toBe('verplaatst')
    expect(h.aanroepen).toEqual([
      'from:life_events',
      'update:{"target_age":60,"target_date":null}',
      'eq:id=ev-1',
      'select:id',
    ])
  })

  it('nul rijen (gedeelde gebeurtenis van je partner, RLS): niet-geraakt, geen stille "verplaatst"', async () => {
    h.resultaat = { data: [], error: null }
    await expect(verplaatsLevensgebeurtenis('ev-partner', { target_age: 60 })).resolves.toBe('niet-geraakt')
  })

  it('geen data: niet-geraakt', async () => {
    h.resultaat = { data: null, error: null }
    await expect(verplaatsLevensgebeurtenis('ev-1', { target_age: 60 })).resolves.toBe('niet-geraakt')
  })

  it('databasefout: fout', async () => {
    h.resultaat = { data: null, error: { message: 'boom' } }
    await expect(verplaatsLevensgebeurtenis('ev-1', { target_age: 60 })).resolves.toBe('fout')
  })
})

describe('use-toekomst-lagen — de sleep meldt alleen "verplaatst" na één geraakte rij', () => {
  const src = readSourceLF(join(process.cwd(), 'components/toekomst/state/use-toekomst-lagen.ts'))

  it('schrijft nooit rechtstreeks naar life_events; beide sleeppaden en de undo gaan via de helper', () => {
    expect(src).not.toMatch(/\.from\(['"]life_events['"]\)/)
    expect(src.match(/verplaatsLevensgebeurtenis\(/g)?.length).toBe(3)
  })

  it('bij nul rijen: terugdraaien en de eerlijke melding, op beide sleeppaden', () => {
    expect(src.match(/if \(uitkomst !== 'verplaatst'\)/g)?.length).toBe(2)
    expect(src.match(/GEBEURTENIS_NIET_VERPLAATST\.titel/g)?.length).toBe(2)
    expect(GEBEURTENIS_NIET_VERPLAATST.titel).toBe('Niet verplaatst')
  })

  it('de "verplaatst naar"-melding komt pas ná de uitkomst-toets en noemt de opgeslagen leeftijd', () => {
    const toets = src.lastIndexOf("if (uitkomst !== 'verplaatst')")
    const melding = src.indexOf('verplaatst naar ${roundedAge}j')
    expect(toets).toBeGreaterThan(0)
    expect(melding).toBeGreaterThan(toets)
    expect(src).not.toContain('verplaatst naar ${newAge}j')
  })
})
