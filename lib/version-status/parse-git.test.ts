import { describe, it, expect } from 'vitest'
import {
  UNIT_SEP,
  normalizePath,
  parseGitLog,
  parseWorktreeList,
  parseStatusPorcelain,
  parseLeftRightCount,
} from './parse-git'
import { computeMigrationDrift, migrationVersionFromFilename } from './migrations'

const US = ''

describe('UNIT_SEP', () => {
  it('is de unit-separator 0x1F waarmee git-log-velden gescheiden worden', () => {
    expect(UNIT_SEP).toBe('')
    expect(UNIT_SEP.charCodeAt(0)).toBe(31)
  })
})

describe('normalizePath', () => {
  it('normaliseert backslashes, casing en trailing slashes', () => {
    expect(normalizePath('C:\\Users\\Jan\\repo\\')).toBe('c:/users/jan/repo')
    expect(normalizePath('C:/Users/Jan/repo')).toBe('c:/users/jan/repo')
  })

  it('maakt Windows-cwd en git-worktree-pad vergelijkbaar', () => {
    expect(normalizePath('C:\\Users\\Jan\\repo')).toBe(normalizePath('c:/users/jan/repo'))
  })
})

describe('parseGitLog', () => {
  const line = (f: string[]) => f.join(US)

  it('parseert de velden per commit', () => {
    const raw = [
      line(['a'.repeat(40), 'aaaaaaa', 'Jan Smit', '2026-07-20T10:00:00+02:00', 'feat: iets nieuws']),
      line(['b'.repeat(40), 'bbbbbbb', 'CI Bot', '2026-07-19T09:00:00+02:00', 'chore: bump']),
    ].join('\n')
    const commits = parseGitLog(raw)
    expect(commits).toHaveLength(2)
    expect(commits[0]).toEqual({
      sha: 'a'.repeat(40),
      short: 'aaaaaaa',
      author: 'Jan Smit',
      date: '2026-07-20T10:00:00+02:00',
      subject: 'feat: iets nieuws',
    })
  })

  it('behoudt een subject met een dubbele punt / leestekens', () => {
    const raw = line(['c'.repeat(40), 'ccccccc', 'A', '2026-07-20T10:00:00+02:00', 'fix: a: b (edge)'])
    expect(parseGitLog(raw)[0].subject).toBe('fix: a: b (edge)')
  })

  it('geeft lege array bij lege output', () => {
    expect(parseGitLog('')).toEqual([])
    expect(parseGitLog('   \n  ')).toEqual([])
  })

  it('slaat regels zonder SHA over', () => {
    const raw = ['', line(['d'.repeat(40), 'ddddddd', 'A', '2026-07-20T10:00:00+02:00', 'ok'])].join('\n')
    expect(parseGitLog(raw)).toHaveLength(1)
  })
})

describe('parseWorktreeList', () => {
  const raw = [
    'worktree C:/Users/Jan/repo',
    'HEAD 1111111111111111111111111111111111111111',
    'branch refs/heads/master',
    '',
    'worktree C:/Users/Jan/repo-feature',
    'HEAD 2222222222222222222222222222222222222222',
    'branch refs/heads/takeover/lokale-categorisatie',
    '',
    'worktree C:/Users/Jan/repo-detached',
    'HEAD 3333333333333333333333333333333333333333',
    'detached',
    '',
  ].join('\n')

  it('parseert pad, branch (zonder refs/heads/) en afgekorte head', () => {
    const wts = parseWorktreeList(raw)
    expect(wts).toHaveLength(3)
    expect(wts[0]).toMatchObject({
      path: 'C:/Users/Jan/repo',
      branch: 'master',
      head: '111111111',
      bare: false,
    })
    expect(wts[1].branch).toBe('takeover/lokale-categorisatie')
  })

  it('markeert detached HEAD als branch=null', () => {
    const wts = parseWorktreeList(raw)
    expect(wts[2].branch).toBeNull()
  })

  it('markeert de huidige werkboom op basis van (genormaliseerd) pad', () => {
    const wts = parseWorktreeList(raw, 'C:\\Users\\Jan\\repo-feature')
    expect(wts.find((w) => w.isCurrent)?.path).toBe('C:/Users/Jan/repo-feature')
    expect(wts.filter((w) => w.isCurrent)).toHaveLength(1)
  })

  it('zonder currentPath is niets current', () => {
    expect(parseWorktreeList(raw).every((w) => !w.isCurrent)).toBe(true)
  })

  it('herkent een bare repo', () => {
    const bare = ['worktree C:/repo.git', 'bare', ''].join('\n')
    expect(parseWorktreeList(bare)[0]).toMatchObject({ bare: true, path: 'C:/repo.git' })
  })

  it('geeft lege array bij lege output', () => {
    expect(parseWorktreeList('')).toEqual([])
  })
})

describe('parseStatusPorcelain', () => {
  it('parseert code + pad per gewijzigd bestand', () => {
    const raw = [' M lib/foo.ts', '?? nieuw-bestand.ts', 'A  staged.ts', 'MM beide.ts'].join('\n')
    const status = parseStatusPorcelain(raw)
    expect(status.count).toBe(4)
    expect(status.truncated).toBe(false)
    expect(status.files[0]).toEqual({ status: ' M', path: 'lib/foo.ts' })
    expect(status.files[1]).toEqual({ status: '??', path: 'nieuw-bestand.ts' })
    expect(status.files[2]).toEqual({ status: 'A ', path: 'staged.ts' })
  })

  it('brengt een rename terug tot het nieuwe pad', () => {
    const raw = 'R  lib/oud.ts -> lib/nieuw.ts'
    expect(parseStatusPorcelain(raw).files[0]).toEqual({ status: 'R ', path: 'lib/nieuw.ts' })
  })

  it('capt de lijst maar behoudt de totale telling', () => {
    const raw = Array.from({ length: 120 }, (_, i) => ` M bestand-${i}.ts`).join('\n')
    const status = parseStatusPorcelain(raw, 50)
    expect(status.count).toBe(120)
    expect(status.files).toHaveLength(50)
    expect(status.truncated).toBe(true)
  })

  it('geeft een lege, niet-getrunceerde status bij schone werkboom', () => {
    const status = parseStatusPorcelain('')
    expect(status).toEqual({ count: 0, files: [], truncated: false })
  })
})

describe('parseLeftRightCount', () => {
  it('leest behind (links) en ahead (rechts) uit tab-gescheiden getallen', () => {
    expect(parseLeftRightCount('3\t7')).toEqual({ behind: 3, ahead: 7 })
    expect(parseLeftRightCount('0\t0\n')).toEqual({ behind: 0, ahead: 0 })
  })

  it('accepteert spaties als scheiding', () => {
    expect(parseLeftRightCount('  2   5  ')).toEqual({ behind: 2, ahead: 5 })
  })

  it('geeft null bij onparseerbare output', () => {
    expect(parseLeftRightCount('')).toBeNull()
    expect(parseLeftRightCount('42')).toBeNull()
    expect(parseLeftRightCount('a\tb')).toBeNull()
  })
})

describe('migrationVersionFromFilename', () => {
  it('haalt de timestamp-prefix uit de bestandsnaam', () => {
    expect(migrationVersionFromFilename('20260717132632_applied_versions_rpc.sql')).toBe('20260717132632')
  })

  it('geeft null zonder numerieke prefix', () => {
    expect(migrationVersionFromFilename('README.md')).toBeNull()
    expect(migrationVersionFromFilename('_orphan.sql')).toBeNull()
  })
})

describe('computeMigrationDrift', () => {
  it('splitst niet-toegepaste bestanden in pendingNewer (> maxApplied) en driftOlder (≤ maxApplied)', () => {
    // Toegepast tot en met 20260301; een nieuwer bestand moet echt nog toegepast worden,
    // een ouder-maar-ontbrekend bestand is enkel lineage-divergentie.
    const files = ['20260201000000', '20260301000000', '20260401000000']
    const applied = ['20260101000000', '20260301000000']
    const drift = computeMigrationDrift(files, applied)
    expect(drift.maxApplied).toBe('20260301000000')
    expect(drift.pendingNewer).toEqual(['20260401000000']) // nieuwer dan alles toegepast
    expect(drift.driftOlder).toEqual(['20260201000000']) // ouder + ontbreekt → informatief
    expect(drift.unknownApplied).toEqual(['20260101000000']) // toegepast, geen bestand
  })

  it('markeert toegepast-zonder-bestand als unknownApplied', () => {
    const files = ['20260301000000']
    const applied = ['20260301000000', '20259999999999']
    const drift = computeMigrationDrift(files, applied)
    expect(drift.unknownApplied).toEqual(['20259999999999'])
    expect(drift.pendingNewer).toEqual([])
    expect(drift.driftOlder).toEqual([])
  })

  it('modelleert een grootschalig hernummerde lineage zonder vals-positieve pendings', () => {
    // 3 lokale bestanden ≤ maxApplied die niet in de (hernummerde) DB staan +
    // 1 echt nieuwer bestand. Alleen die laatste is een actiesignaal.
    const files = ['20260101000000', '20260102000000', '20260103000000', '20260720999999']
    const applied = ['20260301000000', '20260302000000', '20260720120000']
    const drift = computeMigrationDrift(files, applied)
    expect(drift.pendingNewer).toEqual(['20260720999999'])
    expect(drift.driftOlder).toEqual(['20260101000000', '20260102000000', '20260103000000'])
  })

  it('behandelt alles als pendingNewer wanneer er niets is toegepast', () => {
    const drift = computeMigrationDrift(['20260101000000', '20260201000000'], [])
    expect(drift.maxApplied).toBeNull()
    expect(drift.pendingNewer).toEqual(['20260101000000', '20260201000000'])
    expect(drift.driftOlder).toEqual([])
  })

  it('is leeg als alles in sync is', () => {
    const v = ['20260101000000', '20260201000000']
    expect(computeMigrationDrift(v, v)).toEqual({
      maxApplied: '20260201000000',
      pendingNewer: [],
      driftOlder: [],
      unknownApplied: [],
    })
  })

  it('ontdubbelt en sorteert', () => {
    // Zonder toegepaste historie zijn alle unieke bestanden pendingNewer, gesorteerd.
    const drift = computeMigrationDrift(['b', 'a', 'a'], [])
    expect(drift.pendingNewer).toEqual(['a', 'b'])
  })
})
