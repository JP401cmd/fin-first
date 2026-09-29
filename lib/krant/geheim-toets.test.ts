import { describe, expect, it } from 'vitest'
import { bevatGeheim, geheimenUitEnv } from './geheim-toets'

const SLEUTEL = 'dit-is-een-lange-geheime-waarde-1234567890'

describe('geheim-toets (security-run 29 sep, 🟡-1)', () => {
  it('een env-waarde die letterlijk in de uitvoer staat, wijst af — ook genest', () => {
    const geheimen = geheimenUitEnv({ SUPABASE_SERVICE_ROLE_KEY: SLEUTEL, KORT: 'abc' })
    expect(geheimen).toEqual([SLEUTEL])
    expect(bevatGeheim({ summary: `Zie ${SLEUTEL}` }, geheimen)).toBe(true)
    expect(bevatGeheim({ themas: [{ citaat: SLEUTEL }] }, geheimen)).toBe(true)
    expect(bevatGeheim({ summary: 'De inflatie steeg naar 3,3 procent.' }, geheimen)).toBe(false)
  })

  it('sleutelvormige patronen wijzen af, ook zonder env', () => {
    expect(bevatGeheim('eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZSJ9.abc', [])).toBe(true)
    expect(bevatGeheim('sb_secret_abcdefghijkl', [])).toBe(true)
    expect(bevatGeheim('sk-ant-api03-abcdefghijklmnop', [])).toBe(true)
    expect(bevatGeheim('-----BEGIN PRIVATE KEY-----', [])).toBe(true)
  })

  it('gewone nieuwstekst gaat door', () => {
    expect(bevatGeheim({ category: 'fiscaal', summary: 'Het box 3-tarief gaat in 2027 naar 36 procent.', potentialImpact: 'Belastingen: box 3.' }, [])).toBe(false)
  })
})
