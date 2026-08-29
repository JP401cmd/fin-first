import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import {
  BANK_ACCOUNT_PARTNER_COLUMNS,
  DEFAULT_SHARED_VISIBILITY,
  normalizePartnerVisibility,
  ownershipForVisibility,
  ownershipWriteColumns,
  rowOwnershipForImport,
  visibilityForOwnership,
} from './bank-account-visibility'

describe('ownershipForVisibility — de DB-invariant in TS', () => {
  it('koppelt none aan persoonlijk en de rest aan gedeeld', () => {
    expect(ownershipForVisibility('none')).toBe('personal')
    expect(ownershipForVisibility('balance')).toBe('shared')
    expect(ownershipForVisibility('full')).toBe('shared')
  })
})

describe('visibilityForOwnership', () => {
  it('dwingt none af op een persoonlijke rekening, ongeacht de vorige stand', () => {
    expect(visibilityForOwnership('personal')).toBe('none')
    expect(visibilityForOwnership('personal', 'full')).toBe('none')
  })

  it('deelt privacy-by-default: zonder expliciete keuze wordt het balance', () => {
    expect(visibilityForOwnership('shared')).toBe('balance')
    expect(DEFAULT_SHARED_VISIBILITY).toBe('balance')
  })

  it('laat een bestaande ruimere keuze staan (hernoemen zet full niet stil terug)', () => {
    expect(visibilityForOwnership('shared', 'full')).toBe('full')
    expect(visibilityForOwnership('shared', 'balance')).toBe('balance')
  })

  it('trekt een onmogelijke combinatie naar de default in plaats van naar none', () => {
    expect(visibilityForOwnership('shared', 'none')).toBe('balance')
  })
})

describe('ownershipWriteColumns — altijd als één blok', () => {
  it('levert beide kolommen zodat de CHECK nooit kan afketsen', () => {
    expect(ownershipWriteColumns('none')).toEqual({ ownership: 'personal', partner_visibility: 'none' })
    expect(ownershipWriteColumns('balance')).toEqual({ ownership: 'shared', partner_visibility: 'balance' })
    expect(ownershipWriteColumns('full')).toEqual({ ownership: 'shared', partner_visibility: 'full' })
  })
})

describe('normalizePartnerVisibility — rijen van vóór de migratie', () => {
  it('leest een ontbrekende kolom als de stand die bij het eigendom hoort', () => {
    expect(normalizePartnerVisibility(undefined, 'personal')).toBe('none')
    expect(normalizePartnerVisibility(null, 'shared')).toBe('balance')
  })

  it('trekt een rij die uit de pas loopt naar de strengste passende lezing', () => {
    // Kan alleen bij data van vóór de CHECK-constraint.
    expect(normalizePartnerVisibility('full', 'personal')).toBe('none')
    expect(normalizePartnerVisibility('none', 'shared')).toBe('balance')
  })

  it('laat een geldige combinatie ongemoeid', () => {
    expect(normalizePartnerVisibility('full', 'shared')).toBe('full')
    expect(normalizePartnerVisibility('balance', 'shared')).toBe('balance')
    expect(normalizePartnerVisibility('none', 'personal')).toBe('none')
  })

  it('negeert rommel', () => {
    expect(normalizePartnerVisibility('alles', 'shared')).toBe('balance')
    expect(normalizePartnerVisibility(42, 'personal')).toBe('none')
  })
})

describe('rowOwnershipForImport — de tweede gordel bij importeren', () => {
  it('houdt het oude gedrag op een persoonlijke rekening', () => {
    expect(rowOwnershipForImport('personal', 'none', undefined)).toBe('personal')
    // Gedeeld budget op een persoonlijke rekening tilt de boeking naar gezamenlijk.
    expect(rowOwnershipForImport('personal', 'none', 'shared')).toBe('shared')
    // Handmatige override wint van het budget.
    expect(rowOwnershipForImport('personal', 'none', 'shared', 'personal')).toBe('personal')
  })

  it('houdt het oude gedrag op een volledig gedeelde rekening', () => {
    expect(rowOwnershipForImport('shared', 'full', undefined)).toBe('shared')
    expect(rowOwnershipForImport('shared', 'full', 'personal')).toBe('shared')
    expect(rowOwnershipForImport('shared', 'full', undefined, 'personal')).toBe('personal')
  })

  it('stempelt op een balance-rekening altijd persoonlijk — ook bij een override', () => {
    // De partner kan de boeking toch niet zien (lees-tijd-gate). 'shared' zou 'm
    // wél laten meetellen in de gezamenlijke uitgaven: een cijfer dat de partner
    // niet kan navertellen.
    expect(rowOwnershipForImport('shared', 'balance', undefined)).toBe('personal')
    expect(rowOwnershipForImport('shared', 'balance', 'shared')).toBe('personal')
    expect(rowOwnershipForImport('shared', 'balance', 'shared', 'shared')).toBe('personal')
  })
})

/**
 * Kolomprojectie-gate op `bank_accounts`.
 *
 * `scripts/check-client-data-reads.mjs` verbiedt `select('*')` op deze tabel,
 * maar scant alléén bestanden die zélf `'use client'` dragen. Een gedeelde
 * lib-helper of een server-loader waarvan het resultaat als prop naar een
 * clientcomponent gaat (Next serialiseert die volledig in de RSC-payload) blijft
 * daar onzichtbaar — precies het gat dat ADR 0118 §security benoemt.
 *
 * Deze test dekt de hele broncode: geen enkel leespad mag `iban`, `iban_encrypted`
 * of `iban_hash` uit `bank_accounts` projecteren, en `select('*')` mag nergens.
 * `iban_hash` is een blind index onder een server-only sleutel en dus een
 * stabiele correlatiesleutel; bij `balance` deelt de gebruiker zijn saldo, niet
 * zijn rekeningnummer.
 *
 * FILTEREN op iban_hash (`.eq('iban_hash', …)`) blijft toegestaan — dat lekt
 * niets. De gate kijkt daarom uitsluitend naar de kolomlijst ván een
 * `.select(...)` die op een `.from('bank_accounts')` volgt.
 */
describe('bank_accounts-kolomprojectie (repo-brede gate)', () => {
  const ROOT = join(__dirname, '..')
  const SCAN_DIRS = ['app', 'lib', 'components', 'scripts']
  const SKIP_DIR_NAMES = new Set(['node_modules', '.next', '.claude', 'dist', 'build'])
  const VERBODEN = ['iban_hash', 'iban_encrypted']

  /**
   * Bestanden die de IBAN-kolommen wél mogen lezen omdat ze STRIKT eigen-rij
   * scopen (`.eq('user_id', …)`) en de waarde server-side ontsleutelen. Deze
   * lijst mag alleen KRIMPEN; een entry die geen treffer meer oplevert maakt de
   * test rood, zodat hij niet stil blijft staan.
   */
  const OWNER_SCOPED_ALLOWLIST = [
    join('lib', 'own-accounts-server.ts'),
    join('app', 'api', 'own-accounts', 'ibans', 'route.ts'),
    join('app', 'api', 'own-accounts', 'settings', 'route.ts'),
    join('lib', 'onboarding-bank-cleanup.ts'),
    join('lib', 'truelayer', 'cash-asset-backfill.ts'),
    // TARGET_ACCOUNT_SELECT draagt bewust `iban_encrypted` (de wizard toont de
    // eigen IBAN); beide lezers scopen strikt op `.eq('user_id', …)`.
    join('lib', 'truelayer', 'target-account.ts'),
    join('app', 'api', 'bank-connect', 'accounts', 'route.ts'),
  ]

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIR_NAMES.has(entry)) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full, out)
      else if (/\.(ts|tsx|mjs)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) out.push(full)
    }
    return out
  }

  const files = SCAN_DIRS.flatMap((d) => {
    try {
      return walk(join(ROOT, d))
    } catch {
      return []
    }
  })

  /**
   * Alle module-constanten `const X = '...'` in de gescande bestanden, zodat een
   * `.select(TARGET_ACCOUNT_SELECT)` net zo goed gelezen wordt als een letterlijke
   * kolomlijst. Zonder deze stap is elke lezer die zijn lijst in een constante zet
   * onzichtbaar voor de gate — precies de ontsnapping die de `use client`-gate al
   * heeft.
   */
  const CONST_STRINGS = new Map<string, string>()
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    const re = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*(['"`])([\s\S]*?)\2/g
    let c: RegExpExecArray | null
    while ((c = re.exec(src)) !== null) CONST_STRINGS.set(c[1], c[3])
  }

  /**
   * Kolomlijsten van elke `.select(...)` die kort op een `.from('bank_accounts')`
   * volgt. Drie vormen worden herkend, want alle drie komen in deze repo voor:
   * een letterlijke string, een constante-naam, en een KALE `.select()` — die
   * laatste is in supabase-js gelijk aan `*` en zou anders door de gate glippen.
   * Wat niet te herleiden is komt terug als `?onbekend:<expressie>` en wordt
   * hieronder als overtreding gemeld: onleesbaar mag nooit hetzelfde uitpakken
   * als veilig.
   */
  function projections(source: string): string[] {
    const found: string[] = []
    const from = /\.from\(\s*['"`]bank_accounts['"`]\s*\)/g
    let m: RegExpExecArray | null
    while ((m = from.exec(source)) !== null) {
      const window = source.slice(m.index, m.index + 600)
      const sel = /\.select\(([^)]*)\)/.exec(window)
      if (!sel) continue
      // Een tweede argument (`{ count: 'exact' }`) hoort niet bij de projectie.
      const arg = sel[1].split(',{')[0].replace(/,\s*$/, '').trim()
      if (arg === '') {
        found.push('*')
      } else if (/^['"`]/.test(arg) && /['"`]$/.test(arg)) {
        found.push(arg.slice(1, -1))
      } else if (CONST_STRINGS.has(arg)) {
        found.push(CONST_STRINGS.get(arg)!)
      } else if (/^['"`]/.test(arg)) {
        // String-literal met een tweede argument erachter dat de split niet ving.
        const lit = /^(['"`])([\s\S]*?)\1/.exec(arg)
        if (lit) found.push(lit[2])
        else found.push(`?onbekend:${arg}`)
      } else {
        // Samengestelde expressie (`wide ? A : B`): alle constanten erin moeten
        // herleidbaar zijn, en ze worden ALLEMAAL getoetst — welke tak draait is
        // hier niet te zien, dus veilig is alleen "elke tak is veilig".
        const namen = arg.match(/[A-Z][A-Z0-9_]*/g) ?? []
        const opgelost = namen.filter((n) => CONST_STRINGS.has(n))
        if (namen.length > 0 && opgelost.length === namen.length) {
          for (const n of opgelost) found.push(CONST_STRINGS.get(n)!)
        } else {
          found.push(`?onbekend:${arg}`)
        }
      }
    }
    return found
  }

  it('vindt overhaupt leespaden (anders meet de gate niets)', () => {
    const hits = files.filter((f) => projections(readFileSync(f, 'utf8')).length > 0)
    expect(hits.length).toBeGreaterThan(5)
  })

  it('projecteert nergens select(*) of een IBAN-kolom, buiten de eigen-rij-allowlist', () => {
    const overtredingen: string[] = []
    for (const file of files) {
      const rel = relative(ROOT, file)
      const allowed = OWNER_SCOPED_ALLOWLIST.some((a) => rel.split('/').join(sep) === a)
      for (const projection of projections(readFileSync(file, 'utf8'))) {
        if (projection.trim() === '*') overtredingen.push(`${rel}: select('*')`)
        if (projection.startsWith('?onbekend:')) {
          overtredingen.push(`${rel}: niet te herleiden projectie — ${projection.slice(10)}`)
        }
        if (allowed) continue
        for (const kolom of VERBODEN) {
          // Woordgrens: `iban_encrypted` mag `iban_hash` niet als treffer geven.
          if (new RegExp(`(^|[\\s,(])${kolom}([\\s,)]|$)`).test(projection)) {
            overtredingen.push(`${rel}: ${kolom} in select(...)`)
          }
        }
      }
    }
    expect(overtredingen).toEqual([])
  })

  it('BANK_ACCOUNT_PARTNER_COLUMNS draagt geen enkele IBAN-kolom', () => {
    expect(BANK_ACCOUNT_PARTNER_COLUMNS).not.toMatch(/\biban\b/)
    expect(BANK_ACCOUNT_PARTNER_COLUMNS).not.toContain('iban_hash')
    expect(BANK_ACCOUNT_PARTNER_COLUMNS).not.toContain('iban_encrypted')
    expect(BANK_ACCOUNT_PARTNER_COLUMNS).toContain('partner_visibility')
    expect(BANK_ACCOUNT_PARTNER_COLUMNS).toContain('balance')
  })
})
