import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { katernVanSegment } from './actief-katern'

const TOEKOMST = join(process.cwd(), 'components/toekomst')

function bronbestanden(dir: string): string[] {
  return readdirSync(dir).flatMap((naam) => {
    const pad = join(dir, naam)
    if (statSync(pad).isDirectory()) return bronbestanden(pad)
    return /\.tsx?$/.test(naam) && !/\.test\.tsx?$/.test(naam) ? [pad] : []
  })
}

describe('actief katern — één hook', () => {
  it('segment → katern; alles wat geen katern is valt terug op Plan', () => {
    expect(katernVanSegment(null)).toBe('plan')
    expect(katernVanSegment('doelen')).toBe('doelen')
    expect(katernVanSegment('instellingen')).toBe('instellingen')
    expect(katernVanSegment('iets-anders')).toBe('plan')
  })

  it('alleen actief-katern.tsx leest het layout-segment; de rest consumeert useActiefKatern', () => {
    const lezers = bronbestanden(TOEKOMST)
      .filter((pad) => /useSelectedLayoutSegment|function useActiefKatern/.test(readFileSync(pad, 'utf8')))
      .map((pad) => relative(TOEKOMST, pad).replace(/\\/g, '/'))
    expect(lezers).toEqual(['layout/actief-katern.tsx'])
  })

  it('de katern-navigatie gebruikt de gedeelde hook', () => {
    const src = readFileSync(join(TOEKOMST, 'layout/toekomst-katern-navigatie.tsx'), 'utf8')
    expect(src).toMatch(/import \{ useActiefKatern \} from '\.\/actief-katern'/)
  })
})
