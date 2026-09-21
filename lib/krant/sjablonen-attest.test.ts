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
import { SJABLONEN, SJABLOON_VERSIE, type SjabloonId } from './sjablonen-catalogus'

interface Attest {
  attestedAt: string
  attestedBy: string
  sjabloonVersie: number
  merkstem: { manifestAttestedAt: string | null; oppervlak: { id: string; files: { file: string; sha256: string }[] } | null }
  compliance: { verdict: string; at: string; motivering: string }
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

  it('is niet stil stale t.o.v. het merkstem-manifest: dezelfde copy-hash van de catalogus in beide', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'lib', 'merkstem', 'merkstem-manifest.json'), 'utf8')) as {
      attestedAt: string
      surfaces: { id: string; files: { file: string; sha256: string }[] }[]
    }
    const live = manifest.surfaces.find((s) => s.id === 'krant-sjablonen')?.files.find((f) => f.file === 'lib/krant/sjablonen-catalogus.ts')
    expect(live, 'oppervlak krant-sjablonen ontbreekt in het merkstem-manifest').toBeDefined()
    expect(attest.merkstem.manifestAttestedAt).toBe(manifest.attestedAt)
    expect(attest.merkstem.oppervlak?.files.find((f) => f.file === 'lib/krant/sjablonen-catalogus.ts')?.sha256).toBe(live!.sha256)
  })

  it('sentinel: één gewijzigd woord geeft een hash die het attest niet kent', () => {
    const tekst = SJABLONEN['relevant'][0]
    expect(attest.sjablonen.relevant).toContain(sha256(tekst))
    expect(attest.sjablonen.relevant).not.toContain(sha256(tekst.replace('jouw', 'je')))
  })
})
