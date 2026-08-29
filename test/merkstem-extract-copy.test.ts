import { describe, it, expect } from 'vitest'
// Zero-dependency Node-module; de test importeert de pure kern (er draait geen
// main() bij import — dat doet alleen scripts/merkstem/scan.mjs).
import {
  extractCopy,
  copyHash,
  looksLikeProse,
  normalize,
  extractDnaSection,
  extractMarkdownSection,
  jsxForFile,
} from '../scripts/merkstem/extract-copy.mjs'

// Eén klein, realistisch TSX-fixture. Bewust met alle ruissoorten erin die de
// extractor moet wegfilteren: Tailwind-klassen, een CSS-var, een SVG-pad, een
// route, een import en commentaar.
const TSX = `'use client'
import Link from 'next/link'
import { cn } from '@/lib/utils'

// Deze commentaarregel is geen copy en mag de hash niet beinvloeden.
export function Hero({ naam }: { naam: string }) {
  return (
    <section className="relative flex flex-col items-center gap-4" style={{ color: 'var(--ink-4)' }}>
      <svg viewBox="0 0 24 24"><path d="M4 4L20 20" /></svg>
      <h1 className="text-4xl font-semibold">Geld is opgeslagen tijd</h1>
      <p className="max-w-prose text-balance">
        Elke euro is een stukje levenstijd dat je hebt gewerkt.
      </p>
      <button aria-label="Bekijk je vrijheidstijd" className={cn('block truncate', 'px-4')}>
        Start
      </button>
      <Link href="/signup">Maak een account</Link>
      <span>{naam}</span>
    </section>
  )
}
`

describe('merkstem/extract-copy — wat telt als copy', () => {
  it('pakt de tekst die de lezer bereikt, inclusief aria-label', () => {
    const copy = extractCopy(TSX, { jsx: true })
    expect(copy).toContain('Geld is opgeslagen tijd')
    expect(copy).toContain('Elke euro is een stukje levenstijd dat je hebt gewerkt.')
    expect(copy).toContain('Bekijk je vrijheidstijd')
    expect(copy).toContain('Maak een account')
  })

  it('laat vorm, techniek en commentaar buiten de copy', () => {
    const joined = extractCopy(TSX, { jsx: true }).join('\n')
    expect(joined).not.toMatch(/relative flex flex-col/)
    expect(joined).not.toMatch(/text-4xl/)
    expect(joined).not.toMatch(/var\(--ink-4\)/)
    expect(joined).not.toMatch(/M4 4L20 20/)
    expect(joined).not.toMatch(/next\/link/)
    expect(joined).not.toMatch(/use client/)
    expect(joined).not.toMatch(/commentaarregel/)
  })
})

describe('merkstem/extract-copy — de vier hash-eisen uit het testplan', () => {
  it('(a) alleen een opmaak-/CSS-token wijzigen laat de hash ONGEMOEID', () => {
    // Exact de situatie van commit 394e656f0 (a11y-ronde: --ink-4 → --ink-meta,
    // nul woorden gewijzigd). Hele-bestand-hashing gaf daar 6/6 vals alarm.
    const na = TSX.replace('var(--ink-4)', 'var(--ink-meta)').replace('gap-4', 'gap-6')
    expect(na).not.toBe(TSX)
    expect(copyHash(na, { jsx: true })).toBe(copyHash(TSX, { jsx: true }))
  })

  it('(b) één woord in een zin wijzigen maakt de hash ANDERS', () => {
    const na = TSX.replace('stukje levenstijd', 'stukje werktijd')
    expect(copyHash(na, { jsx: true })).not.toBe(copyHash(TSX, { jsx: true }))
  })

  it('(c) copy verplaatsen binnen het bestand maakt de hash ANDERS (volgorde telt mee)', () => {
    const kop = '      <h1 className="text-4xl font-semibold">Geld is opgeslagen tijd</h1>\n'
    const alinea =
      '      <p className="max-w-prose text-balance">\n        Elke euro is een stukje levenstijd dat je hebt gewerkt.\n      </p>\n'
    expect(TSX).toContain(kop + alinea)
    const na = TSX.replace(kop + alinea, alinea + kop)
    expect(na).not.toBe(TSX)
    expect(extractCopy(na, { jsx: true }).sort()).toEqual(extractCopy(TSX, { jsx: true }).sort())
    expect(copyHash(na, { jsx: true })).not.toBe(copyHash(TSX, { jsx: true }))
  })

  it('(d) een bestand zonder copy levert nul regels op — expliciet, niet stiekem', () => {
    const geenCopy = `export const COLS = ['id', 'user_id']\nexport const CLS = 'flex items-center gap-2'\n`
    expect(extractCopy(geenCopy, { jsx: false })).toEqual([])
  })
})

describe('merkstem/extract-copy — .ts vs .tsx', () => {
  it('past de JSX-tekstextractie NIET toe op een gewoon .ts-bestand', () => {
    // In .ts zijn `<` en `>` vergelijkingsoperatoren; de `>`…`<`-regex zou daar
    // codefragmenten oogsten (dat deed het eerste prototype op directives.ts).
    const ts = `export function f(d: { a: number; b: number }) {\n  if (d.a > 0 && d.b < 10) return 'Binnen de bandbreedte van je plan.'\n  return ''\n}\n`
    const copy = extractCopy(ts, { jsx: false })
    expect(copy).toEqual(['Binnen de bandbreedte van je plan.'])
  })

  it('jsxForFile schakelt op de extensie', () => {
    expect(jsxForFile('components/landing/hero.tsx')).toBe(true)
    expect(jsxForFile('lib/briefing/directives.ts')).toBe(false)
  })

  it('vervangt een ${}-interpolatie door een stabiele placeholder', () => {
    const a = 'const s = `Je hebt ${jaren} jaar vrijgekocht.`\n'
    const b = 'const s = `Je hebt ${aantalJaren} jaar vrijgekocht.`\n'
    expect(copyHash(a, { jsx: false })).toBe(copyHash(b, { jsx: false }))
    const c = 'const s = `Je hebt ${jaren} maanden vrijgekocht.`\n'
    expect(copyHash(c, { jsx: false })).not.toBe(copyHash(a, { jsx: false }))
  })
})

describe('merkstem/extract-copy — proza-drempel', () => {
  it('herkent proza en verwerpt vorm', () => {
    expect(looksLikeProse('Geld is opgeslagen tijd')).toBe(true)
    expect(looksLikeProse('Klaar.')).toBe(true)
    expect(looksLikeProse('relative flex')).toBe(false)
    expect(looksLikeProse('block truncate')).toBe(false)
    expect(looksLikeProse('mx-auto max-w-3xl px-4')).toBe(false)
    expect(looksLikeProse('var(--color-kern-500)')).toBe(false)
    expect(looksLikeProse('https://trifinity.nl/prijzen')).toBe(false)
    expect(looksLikeProse('/toekomst/doelen')).toBe(false)
    expect(looksLikeProse('#1a1a1a')).toBe(false)
  })

  it('normalize maakt inspringing en regelafbreking irrelevant', () => {
    expect(normalize('  een\n   zin\t hier  ')).toBe('een zin hier')
  })
})

describe('merkstem/extract-copy — bronsecties', () => {
  it('snijdt één == NAAM ==-sectie uit een DNA-bestand', () => {
    const dna = 'export const X = `kop\n\n== FRAMING ==\n- regel een\n\n== TOON ==\n- regel twee\n\n== FORMATTING ==\n- regel drie\n`\n'
    expect(extractDnaSection(dna, 'TOON')).toBe('- regel twee')
    expect(extractDnaSection(dna, 'FRAMING')).toBe('- regel een')
    // Een hernoemde/verdwenen sectie is null — de caller moet dat hard als drift
    // behandelen, nooit stil als "geen wijziging".
    expect(extractDnaSection(dna, 'STIJL')).toBeNull()
  })

  it('snijdt één ## kop-sectie uit een markdown-bestand', () => {
    const md = '# Titel\n\n## De claimlijst\n\nWel zeggen: dit.\n\n## De uitzonderingsroute\n\nIets anders.\n'
    expect(extractMarkdownSection(md, 'De claimlijst')).toBe('Wel zeggen: dit.')
    expect(extractMarkdownSection(md, 'Bestaat niet')).toBeNull()
  })
})
