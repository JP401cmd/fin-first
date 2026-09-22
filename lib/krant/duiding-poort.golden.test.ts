// ── De bijt-proef van 1F fase 2: grondslag A versus grondslag B ─────────────
//
// Vier ECHTE regressiegevallen (ADR 0176, vastgelegd 22-09-2026 vóór het wissen
// van de oude artikelbak): de productierij met de échte modeluitvoer van toen,
// plus de opnieuw opgehaalde bronpagina. `brongetrouwheid.golden.test.ts`
// bewaakt dat die fixtures heel zijn; deze test bewaakt wat de CONTROLES ermee
// doen.
//
// Het punt is het VERSCHIL, niet de eindstatus. Dezelfde modeluitvoer gaat twee
// keer door `controleerDuiding`:
//
//   grondslag A  de hele paginatekst, zoals de oude code hem bouwde — een
//                overzichtspagina met tientallen items;
//   grondslag B  het eigen `bron_fragment` van de rij, zoals fase 2 hem bouwt.
//
// Wat onder A doorkwam en onder B valt, is precies de P1-klasse: een getal van
// een buur-item dat een verzonnen bewering "grondde".
//
// TWEE EERLIJKE AFWIJKINGEN van "A: door" — allebei een BEVINDING, niet een
// tekortkoming van de proef (zie het rapport van deze fase):
//   - G3 (meta-commentaar) en G6 (het lexicon) zijn nieuw in fase 2 en kijken
//     niet naar de grondslag. Die bijten dus in BEIDE werelden. Bij bf458a7b
//     assert deze test daarom dat A niet op de GRONDSLAG-controles valt (G1/G2)
//     en B wél — dat is de vergelijking die over de grondslag gaat.
//   - bf458a7b draait óók om de bronmetadata: onder A krijgt de rij de
//     bronmetadata die de oude ingest suggereerde (published_at als "de datum
//     van de bron"), onder B de eerlijke `eerste_gezien`. Dat ís de fout: de
//     prompt droeg een datum die wij zelf hadden verzonnen.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { controleerDuiding, POORT_CODE, type ControleBron } from './duiding-controles'
import { buildDuidingPrompt, type WachtendArtikel } from './duiding'
import type { DuidingMetaZonderPoort } from './duiding-schema'

interface BronFixture {
  geval: string
  vangtHet: string[]
  rij: {
    id: string
    source_url: string
    published_at: string
    duiding: { samenvatting: string; doelgroep: unknown[] } & Record<string, unknown>
  }
  bron: { paginaUrl: string; fragment: string; paginaTekst: string }
}

const laad = (id: string): BronFixture =>
  JSON.parse(readFileSync(join(__dirname, '__golden__', `bron-${id}.json`), 'utf8')) as BronFixture

const META: DuidingMetaZonderPoort = {
  grondslag: 'fragment',
  grondslagSha256: 'b'.repeat(64),
  tekens: 0,
  model: 'golden',
  kopBron: 'bron',
  modeltekst: false,
}

/**
 * De modeluitvoer van toen, terug naar de vorm die `duidingModelSchema`
 * verwacht: `grond` is daar een LIJST (in de opgeslagen v1-vorm is het een
 * record) en `versie`/`meta` horen er niet in.
 */
function modelUitvoer(f: BronFixture): unknown {
  const { versie: _v, meta: _m, grond, ...rest } = f.rij.duiding as Record<string, unknown>
  return {
    ...rest,
    grond: Object.entries((grond ?? {}) as Record<string, string>).map(([param, citaat]) => ({ param, citaat })),
  }
}

/** Grondslag A: de hele pagina + de bronmetadata zoals de oude ingest ze suggereerde. */
function grondslagA(f: BronFixture): ControleBron {
  return { tekst: f.bron.paginaTekst, published_at: f.rij.published_at, published_bron: 'feed' }
}

/** Grondslag B: het eigen fragment + de eerlijke herkomst van de datum (ADR 0176). */
function grondslagB(f: BronFixture): ControleBron {
  return { tekst: f.bron.fragment, published_at: f.rij.published_at, published_bron: 'eerste_gezien' }
}

function uitkomst(f: BronFixture, bron: ControleBron) {
  const r = controleerDuiding(modelUitvoer(f), bron, META)
  return r.ok
    ? { soort: 'geduid' as const, poort: r.duiding.meta.poort, samenvatting: r.duiding.samenvatting }
    : { soort: 'afgewezen' as const, code: r.code }
}

describe('Krant 1F fase 2 — het eigen fragment bijt waar de hele pagina doorliet', () => {
  it('059ba103: het procentpunt staat op de pagina, niet in het eigen fragment (G1)', () => {
    const f = laad('059ba103')
    const a = uitkomst(f, grondslagA(f))
    expect(a.soort).toBe('geduid')
    expect(a.soort === 'geduid' && a.poort.status).toBe('groen')
    expect(a.soort === 'geduid' && a.samenvatting).toBe(f.rij.duiding.samenvatting)

    const b = uitkomst(f, grondslagB(f))
    expect(b.soort).toBe('geduid') // B26: degraderen, niet afwijzen
    expect(b.soort === 'geduid' && b.poort).toEqual({ status: 'gedegradeerd', reden: POORT_CODE.ongegrondGetal })
    expect(b.soort === 'geduid' && b.samenvatting).toBeNull()
  })

  it('41ed4267: idem — 0,2 procentpunt komt van een buur-item op dezelfde pagina (G1)', () => {
    const f = laad('41ed4267')
    const a = uitkomst(f, grondslagA(f))
    expect(a.soort === 'geduid' && a.poort.status).toBe('groen')

    const b = uitkomst(f, grondslagB(f))
    expect(b.soort === 'geduid' && b.poort).toEqual({ status: 'gedegradeerd', reden: POORT_CODE.ongegrondGetal })
  })

  it('bf458a7b: de publicatiedatum kwam uit onze eigen published_at, niet uit de bron (G2)', () => {
    const f = laad('bf458a7b')
    const a = uitkomst(f, grondslagA(f))
    // A valt NIET op een grondslag-controle: met de hele pagina én met
    // published_at als "bronDatum" kloppen het getal en de datum. Dat hij
    // alsnog degradeert, komt door G3 — een nieuwe, grondslag-onafhankelijke
    // controle op meta-commentaar ("De tekst bevat geen concrete tarieven").
    expect(a.soort === 'geduid' && a.poort.reden).toBe(POORT_CODE.meta)

    const b = uitkomst(f, grondslagB(f))
    expect(b.soort === 'geduid' && b.poort).toEqual({ status: 'gedegradeerd', reden: POORT_CODE.datum })
    expect(b.soort === 'geduid' && b.samenvatting).toBeNull()
  })

  it('bf458a7b: de prompt draagt bij published_bron = eerste_gezien géén datum', () => {
    const f = laad('bf458a7b')
    const artikel = (published_bron: WachtendArtikel['published_bron']): WachtendArtikel => ({
      id: f.rij.id,
      bron_soort: 'web_pagina',
      bron_kop: 'Belastingplan 2026',
      bron_fragment: f.bron.fragment,
      source_name: 'Rijksoverheid',
      category: 'fiscaal',
      published_at: f.rij.published_at,
      published_bron,
      duiding_pogingen: 0,
    })
    const zonder = buildDuidingPrompt(artikel('eerste_gezien'), f.bron.fragment)
    expect(zonder).toContain('Datum: onbekend')
    expect(zonder).not.toContain('2026-01-01')
    // En de kop komt van de BRON, nooit van het model (B27/G4).
    expect(zonder).toContain('Titel: Belastingplan 2026')
    // Komt de datum wél uit de feed, dan mag hij mee.
    expect(buildDuidingPrompt(artikel('feed'), f.bron.fragment)).toContain('Datum: 2026-01-01')
  })

  it('7ce838c7: de sectorverdeling is verzonnen — doelgroep hard afgewezen (G6)', () => {
    const f = laad('7ce838c7')
    const b = uitkomst(f, grondslagB(f))
    expect(b).toEqual({ soort: 'afgewezen', code: 'doelgroep:ongegrond:wonen' })
    // Ook met de hele pagina: "sociale sector" en "vrije sector" staan er niet —
    // G6 is hier dus niet de grondslag-winst maar een nieuwe controle.
    expect(uitkomst(f, grondslagA(f))).toEqual({ soort: 'afgewezen', code: 'doelgroep:ongegrond:wonen' })
  })

  it('7ce838c7: zonder die doelgroep valt dezelfde zin op het lexicon, en degradeert alleen de tekst', () => {
    const f = laad('7ce838c7')
    const zonderDoelgroep = { ...(modelUitvoer(f) as Record<string, unknown>), doelgroep: [] }
    const r = controleerDuiding(zonderDoelgroep, grondslagB(f), META)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.duiding.meta.poort).toEqual({ status: 'gedegradeerd', reden: POORT_CODE.lexicon })
    expect(r.duiding.samenvatting).toBeNull()
  })
})
