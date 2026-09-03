import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readSourceLF } from './read-source'

/**
 * Bewijst het CRLF-defect en de fix in isolatie (zonder een verse checkout te
 * hoeven simuleren): schrijf dezelfde brontekst weg als CRLF én als LF, en
 * toon dat het gebruikelijke comment-strip-idioom
 * (`.split('\n').map(line => line.replace(/\/\/.*$/, ''))`) alleen op de
 * CRLF-variant faalt wanneer je via het kale `readFileSync` leest — en op
 * ALLEBEI slaagt via `readSourceLF`.
 */
describe('readSourceLF', () => {
  const source = "const FORBIDDEN = 1 // account_number\nconst OK = 2\n"
  let dir: string
  let lfPath: string
  let crlfPath: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'read-source-lf-'))
    lfPath = join(dir, 'lf.ts')
    crlfPath = join(dir, 'crlf.ts')
    writeFileSync(lfPath, source, 'utf8')
    writeFileSync(crlfPath, source.replace(/\n/g, '\r\n'), 'utf8')
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function stripLineComments(text: string): string {
    // Het gangbare bron-scan-idioom (zie o.a. no-placeholder-assets.test.ts).
    return text
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n')
  }

  it('normaliseert CRLF naar LF, LF blijft ongewijzigd', () => {
    expect(readSourceLF(crlfPath)).toBe(source)
    expect(readSourceLF(lfPath)).toBe(source)
  })

  it('het comment-strip-idioom faalt op ongenormaliseerde CRLF-invoer (bewijs van het defect)', () => {
    const rawCrlf = readFileSync(crlfPath, 'utf8')
    const stripped = stripLineComments(rawCrlf)
    // Zonder normalisatie blijft de verboden token in de "codeOnly"-string staan.
    expect(stripped).toContain('account_number')
  })

  it('hetzelfde idioom slaagt wél op CRLF-invoer die via readSourceLF gelezen is (bewijs van de fix)', () => {
    const normalized = readSourceLF(crlfPath)
    const stripped = stripLineComments(normalized)
    expect(stripped).not.toContain('account_number')
  })
})
