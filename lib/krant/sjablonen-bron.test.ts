// ── Geen lezerstekst buiten de catalogus (catalogus v2, Krant 1C) ────────────
//
// Het attest (sjablonen-attest.json) dekt alleen wat in sjablonen-catalogus.ts
// staat. Tot v2 stonden de fragmenten ("of meer", "tot", "maanden", de
// veldnamen, het partnerfragment) in sjablonen.ts en matcher.ts: wijzigde daar
// een woord, dan bleef het attest groen terwijl de lezer iets anders las
// (compliance-check 28 sep, §4 punt 3). Deze test bewaakt dat de renderer en de
// matcher alleen nog codes en lijm bevatten.
//
// Regel: een string-literal (enkel, dubbel of template) die na het weghalen
// van `${…}` een Nederlands woord van twee of meer letters ÉN een spatie bevat,
// is lezerstekst — behalve in een `new Error(` / `throw` (ontwikkelaarstekst).

import { describe, expect, it } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'

function zonderCommentaar(bron: string): string {
  return bron.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

function scanBron(ruw: string): string[] {
  const bron = zonderCommentaar(ruw)
  const treffers: string[] = []
  for (const regel of bron.split('\n')) {
    if (/new Error\(|throw /.test(regel)) continue
    for (const m of regel.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g)) {
      const inhoud = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, '')
      if (/\s/.test(inhoud) && /[a-zà-ÿ]{2,}/i.test(inhoud)) treffers.push(m[0])
    }
  }
  return treffers
}

describe('sjablonen — alle lezerstekst staat in de catalogus', () => {
  it.each(['lib/krant/sjablonen.ts', 'lib/krant/matcher.ts'])('%s draagt geen lezerstekst', (pad) => {
    expect(scanBron(readSourceLF(pad))).toEqual([])
  })

  it('de scan vangt wat hij moet vangen, en laat codes, lijm en foutmeldingen staan (sentinel)', () => {
    expect(scanBron("const p = ' (samen met je fiscale partner)'")).toHaveLength(1)
    expect(scanBron('const t = `${a} tot ${b}`')).toHaveLength(1)
    expect(scanBron("waarom.push('impact:nul')")).toEqual([])
    expect(scanBron('return `${voorbehoud} ${regel}`')).toEqual([])
    expect(scanBron("throw new Error('sjabloon mist slot')")).toEqual([])
    expect(scanBron("// een commentaar met woorden")).toEqual([])
  })
})
