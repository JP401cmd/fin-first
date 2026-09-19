import { describe, expect, it } from 'vitest'
import pkg from '../package.json'
import { APP_VERSION } from './app-version'
import {
  RELEASE_NOTES,
  RELEASE_NOTE_NORM,
  compareReleaseVersions,
  parseReleaseVersion,
} from './release-notes'

/**
 * Drie gates op de vrijgavenotities:
 *  1. één versiebron — de bovenste notitie draagt exact package.json.version;
 *  2. de major blijft 0 tot het go-besluit voor de livegang (een test, geen afspraak);
 *  3. de kort/gebruikersvriendelijk-norm voor elke notitie vanaf 0.89.0.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function underNorm(version: string): boolean {
  return compareReleaseVersions(version, RELEASE_NOTE_NORM.vanaf) >= 0
}

describe('release-notes — versiebron', () => {
  it('APP_VERSION is package.json.version', () => {
    expect(APP_VERSION).toBe(pkg.version)
  })

  it('de bovenste notitie draagt de package.json-versie', () => {
    expect(RELEASE_NOTES[0].version).toBe(pkg.version)
  })

  it('elke versie is semver 0.MINOR.PATCH', () => {
    for (const note of RELEASE_NOTES) {
      const parsed = parseReleaseVersion(note.version)
      expect(parsed, `geen semver: ${note.version}`).not.toBeNull()
    }
  })

  it('de major blijft 0 — 1.0.0 pas bij het formele go-besluit livegang', () => {
    for (const note of RELEASE_NOTES) {
      expect(parseReleaseVersion(note.version)?.major, note.version).toBe(0)
    }
    expect(parseReleaseVersion(pkg.version)?.major, `package.json ${pkg.version}`).toBe(0)
  })

  it('nieuwste bovenaan, zonder dubbele versies', () => {
    for (let i = 0; i < RELEASE_NOTES.length - 1; i++) {
      const a = RELEASE_NOTES[i].version
      const b = RELEASE_NOTES[i + 1].version
      expect(compareReleaseVersions(a, b), `${a} hoort boven ${b}`).toBeGreaterThan(0)
    }
  })

  it('elke datum is YYYY-MM-DD', () => {
    for (const note of RELEASE_NOTES) {
      expect(note.date, note.version).toMatch(ISO_DATE_RE)
      expect(Number.isNaN(new Date(note.date).getTime()), note.version).toBe(false)
    }
  })
})

describe('release-notes — semver-helpers', () => {
  it('vergelijkt numeriek, niet als tekst of float', () => {
    expect(compareReleaseVersions('0.100.0', '0.99.0')).toBeGreaterThan(0)
    expect(compareReleaseVersions('0.71.0', '0.7.0')).toBeGreaterThan(0)
    expect(compareReleaseVersions('0.89.1', '0.89.0')).toBeGreaterThan(0)
    expect(compareReleaseVersions('0.89.0', '0.89.0')).toBe(0)
  })

  it('weigert een ongeldige versie hard', () => {
    expect(() => compareReleaseVersions('fin_prod_0.88', '0.89.0')).toThrow(/Ongeldige/)
    expect(parseReleaseVersion('0.89')).toBeNull()
  })
})

describe('release-notes — kort en in gewone taal (vanaf 0.89.0)', () => {
  const genormeerd = RELEASE_NOTES.filter((n) => underNorm(n.version))

  it('de norm raakt ten minste de bovenste notitie', () => {
    expect(genormeerd.length).toBeGreaterThan(0)
    expect(genormeerd[0].version).toBe(RELEASE_NOTES[0].version)
  })

  it.each(genormeerd.map((n) => [n.version, n] as const))(
    '%s — titels en omschrijvingen blijven kort',
    (_version, note) => {
      expect(note.title.length, `releasetitel: ${note.title}`).toBeLessThanOrEqual(
        RELEASE_NOTE_NORM.releaseTitleMax,
      )
      for (const section of note.sections) {
        expect(section.items.length, `${section.module}: lege sectie`).toBeGreaterThan(0)
        for (const item of section.items) {
          expect(item.title.length, `titel te lang: ${item.title}`).toBeLessThanOrEqual(
            RELEASE_NOTE_NORM.itemTitleMax,
          )
          expect(
            item.description.length,
            `omschrijving te lang bij "${item.title}"`,
          ).toBeLessThanOrEqual(RELEASE_NOTE_NORM.itemDescriptionMax)
        }
      }
    },
  )

  it.each(genormeerd.map((n) => [n.version, n] as const))(
    '%s — geen bestandsnamen, paden, routes of besluitnummers',
    (_version, note) => {
      const teksten = [
        note.title,
        ...note.sections.flatMap((s) => s.items.flatMap((i) => [i.title, i.description])),
      ]
      for (const tekst of teksten) {
        for (const patroon of RELEASE_NOTE_NORM.verbodenPatronen) {
          expect(tekst, `"${tekst}" bevat ${patroon}`).not.toMatch(patroon)
        }
      }
    },
  )

  it('de norm zou de oude notities inderdaad afkeuren (bewijs dat hij bijt)', () => {
    const oud = RELEASE_NOTES.filter((n) => !underNorm(n.version))
    const schendingen = oud.flatMap((n) =>
      n.sections.flatMap((s) =>
        s.items.filter(
          (i) =>
            i.description.length > RELEASE_NOTE_NORM.itemDescriptionMax ||
            RELEASE_NOTE_NORM.verbodenPatronen.some((p) => p.test(i.description)),
        ),
      ),
    )
    expect(schendingen.length).toBeGreaterThan(0)
  })
})
