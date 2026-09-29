// ── Het attest is de poort: een niet-getoetst sjabloon rendert niet ─────────
//
// Zelfde patroon als lib/merkstem/merkstem-manifest.json (ADR 0112), per
// sjabloon. Wijzigt een formulering, dan klopt de hash niet meer en is deze
// test rood tot de catalogus opnieuw door merkstem en compliance-check is
// gegaan (`node scripts/krant/attest-sjablonen.mjs --attest …`).

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { SJABLONEN, SJABLOON_VERSIE, type SjabloonId } from './sjablonen-catalogus'
import type { AttestHerbevestiging } from './tijdlijn-beta'

interface Attest {
  attestedAt: string
  attestedBy: string
  sjabloonVersie: number
  merkstem: { manifestAttestedAt: string | null; oppervlak: { id: string; files: { file: string; sha256: string }[] } | null }
  compliance: { verdict: string; at: string; motivering: string; toets?: string }
  /** Tweede sleutel: de eigenaar herbevestigt het attest op één catalogus-versie. `--attest` wist 'm. */
  herbevestiging?: AttestHerbevestiging | null
  sjablonen: Record<string, string[]>
}

const sha256 = (tekst: string) => createHash('sha256').update(tekst, 'utf8').digest('hex')
const attest: Attest = JSON.parse(readFileSync(join(process.cwd(), 'lib', 'krant', 'sjablonen-attest.json'), 'utf8'))
const IDS = Object.keys(SJABLONEN) as SjabloonId[]

describe('sjablonen-attest', () => {
  it('elke formulering in de catalogus is geattesteerd (hash per variant), en het attest kent geen spooksjablonen', () => {
    for (const id of IDS) {
      const bekend = attest.sjablonen[id]
      expect(bekend, `${id} ontbreekt in het attest`).toBeDefined()
      expect(bekend, `${id}: aantal varianten`).toHaveLength(SJABLONEN[id].length)
      SJABLONEN[id].forEach((tekst, v) => expect(bekend[v], `${id}[${v}] is gewijzigd zonder herattestatie`).toBe(sha256(tekst)))
    }
    for (const id of Object.keys(attest.sjablonen)) expect(IDS, `${id} staat in het attest maar niet in de catalogus`).toContain(id)
  })

  it('draagt de versie, een compliance-uitkomst "goedgekeurd" met motivering, en de merkstem-attestatie van de catalogus', () => {
    expect(attest.sjabloonVersie).toBe(SJABLOON_VERSIE)
    expect(attest.compliance.verdict).toBe('goedgekeurd')
    expect(attest.compliance.motivering.length).toBeGreaterThan(20)
    expect(attest.merkstem.manifestAttestedAt).toBeTruthy()
    expect(attest.merkstem.oppervlak?.id).toBe('krant-sjablonen')
    expect(attest.merkstem.oppervlak?.files.map((f) => f.file)).toContain('lib/krant/sjablonen-catalogus.ts')
  })

  // Bewust GEEN gelijkheid meer op manifestAttestedAt: die dwong bij elke
  // merkstem-herattestatie een handedit van dit attest af (7da5f954a,
  // 5ad9307e9) zonder dat de catalogus veranderde. De copy-hash is de
  // inhoudelijke vergelijking en blijft staan.
  it('is niet stil stale t.o.v. het merkstem-manifest: dezelfde copy-hash van de catalogus in beide', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'lib', 'merkstem', 'merkstem-manifest.json'), 'utf8')) as {
      surfaces: { id: string; files: { file: string; sha256: string }[] }[]
    }
    const live = manifest.surfaces.find((s) => s.id === 'krant-sjablonen')?.files.find((f) => f.file === 'lib/krant/sjablonen-catalogus.ts')
    expect(live, 'oppervlak krant-sjablonen ontbreekt in het merkstem-manifest').toBeDefined()
    expect(attest.merkstem.oppervlak?.files.find((f) => f.file === 'lib/krant/sjablonen-catalogus.ts')?.sha256).toBe(live!.sha256)
  })

  it('een herbevestiging, als die er is, komt van de eigenaar en hoort bij de huidige catalogus', () => {
    const hb = attest.herbevestiging ?? null
    if (hb === null) return
    const catalogusSha = sha256(readSourceLF(join(process.cwd(), 'lib', 'krant', 'sjablonen-catalogus.ts')))
    expect(hb.door, 'herbevestiging hoort van de eigenaar te komen').toBe('eigenaar')
    expect(hb.catalogusSha256, 'herbevestiging vervallen — catalogus gewijzigd').toBe(catalogusSha)
  })

  // algemeen-label i.p.v. relevant: relevant wordt in 1C gesplitst, algemeen-label blijft.
  it('sentinel: één toegevoegd woord geeft een hash die het attest niet kent', () => {
    const tekst = SJABLONEN['algemeen-label'][0]
    const gewijzigd = `${tekst} x`
    expect(attest.sjablonen['algemeen-label']).toContain(sha256(tekst))
    expect(attest.sjablonen['algemeen-label']).not.toContain(sha256(gewijzigd))
  })
})
