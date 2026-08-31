/**
 * Regressie bij UR2-15 — hydration-mismatch op /overzicht/belasting/box3.
 *
 * ## Waarom dit een BRON-test is en geen render-test
 *
 * Het defect ontstaat in de COMPILER, niet in de runtime. TriFinity draait met
 * `reactCompiler: true` (next.config.ts). Next past die Babel-plugin alléén toe
 * op de browserlaag: in een productie-build komt `useMemoCache` in
 * `.next/static/chunks/**` voor en in `.next/server/chunks/ssr/**` nergens. De
 * browserlaag gaat dus door Babel, de ssr-laag door SWC alleen — twee
 * implementaties van dezelfde JSX-witruimteregels.
 *
 * Ze lopen uiteen zodra een JSX-tekstkind (a) begint met een spatie die alleen
 * volgt uit "op dezelfde regel blijven staan als de vorige tag", (b) doorloopt
 * op een volgende bronregel én (c) een HTML-entiteit draagt. Gemeten in één
 * productie-build (29 aug 2026), bestand box3-heffingsvrij.tsx:
 *
 *   browserlaag : " extra Box 3-vermogen kost zo'n"
 *   ssr-laag    : "extra Box 3-vermogen kost zo'n"
 *
 * Eén spatie verschil = "server rendered text didn't match" → React gooit de
 * hele boom weg en rendert client-side opnieuw, bij élke Box 3-load.
 *
 * Een gewone render-test kan dit niet zien: vitest compileert server- en
 * clientpad met dezelfde transform, dus daar is er per definitie geen verschil.
 * Wat we wél kunnen bewaken is de BRONVORM. Een tekstkind zonder impliciete
 * rand-witruimte (spatie als expliciete {' '}-expressie, zin op één regel) kan
 * niet uiteenlopen, ongeacht welke transform 'm verwerkt.
 *
 * Scope = components/overview/** (het oppervlak van deze kaart). Elders in de
 * repo staat dezelfde vorm nog op ~18 plekken; die zijn los in kaart gebracht.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// vitest draait vanuit de repo-root (vitest.config.ts staat daar).
const ROOT = path.resolve(process.cwd(), 'components/overview')

/** Eén gevonden overtreding: bestand, regelnummer en het tekstkind. */
interface Finding {
  file: string
  line: number
  text: string
}

/**
 * Zoekt tekstkinderen met impliciete voorloopwitruimte ná een tag, die op een
 * volgende regel doorlopen en een HTML-entiteit dragen — de vorm waarop de
 * twee compilatielagen bewezen uiteenlopen.
 */
export function findDivergentJsxText(source: string, file: string): Finding[] {
  const lines = source.split('\n')
  const found: Finding[] = []

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue

    // Tekst begint met een spatie direct na een sluitende/self-closing tag en
    // loopt door tot het regeleinde (geen nieuwe tag of expressie meer).
    const m = /(?:\/>|<\/[A-Za-z][\w.]*>) ([^<>{}]*[^\s<>{}][^<>{}]*)$/.exec(line)
    if (!m) continue

    // Het tekstkind moet doorlopen op een volgende bronregel — een éénregelig
    // kind kent de regelovergang niet waar de twee transforms op uiteenlopen.
    const follow = lines[i + 1].trim()
    if (!follow || /^[<{)]/.test(follow)) continue

    // Verzamel de rest van het tekstkind: volgende regels tot een tag of
    // expressie het kind afsluit.
    let text = m[1]
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim()
      if (!next || /^[<{)]/.test(next)) break
      const cut = next.search(/[<{]/)
      text += ' ' + (cut >= 0 ? next.slice(0, cut) : next)
      if (cut >= 0) break
    }

    if (/&[a-zA-Z]+;|&#\d+;/.test(text)) {
      found.push({ file, line: i + 1, text: text.trim() })
    }
  }

  return found
}

function collectTsx(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) collectTsx(p, acc)
    else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) acc.push(p)
  }
  return acc
}

describe('JSX-witruimte — geen tekstkind dat tussen de compilatielagen uiteen kan lopen', () => {
  /*
    Positieve controle. Zonder deze zou een groene suite óók groen zijn als de
    detector kapot is — precies de val bij een bron-scannende test. Dit fragment
    is de bronvorm van box3-heffingsvrij.tsx zoals hij vóór de fix stond.
  */
  it('detecteert de bronvorm die het defect veroorzaakte', () => {
    const before = [
      '<p className="text-[var(--ink-3)]">',
      '  Elke <span className="not-italic font-mono tabular-nums">{fc(1000)}</span> extra Box 3-vermogen',
      "  kost zo&apos;n{' '}",
      '  <span>x</span>',
      '</p>',
    ].join('\n')

    const hits = findDivergentJsxText(before, 'fixture.tsx')
    expect(hits).toHaveLength(1)
    expect(hits[0].text).toContain('extra Box 3-vermogen')
  })

  it('laat de gerepareerde bronvorm met rust', () => {
    const after = [
      '<p className="text-[var(--ink-3)]">',
      "  Elke <span className=\"not-italic font-mono tabular-nums\">{fc(1000)}</span>{' '}",
      "  extra Box 3-vermogen kost zo&apos;n{' '}",
      '  <span>x</span>',
      '</p>',
    ].join('\n')

    expect(findDivergentJsxText(after, 'fixture.tsx')).toEqual([])
  })

  it('components/overview/** draagt de vorm nergens', () => {
    const findings = collectTsx(ROOT).flatMap((file) =>
      findDivergentJsxText(fs.readFileSync(file, 'utf8'), path.relative(ROOT, file)),
    )

    expect(
      findings.map((f) => `${f.file}:${f.line} — ${f.text}`),
      'JSX-tekstkind met impliciete voorloopspatie + HTML-entiteit: zet de spatie ' +
        "als expliciete {' '}-expressie en houd de zin op één bronregel",
    ).toEqual([])
  })
})
