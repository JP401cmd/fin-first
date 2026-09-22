// ── Bron-scan: de grondslag van de duiding is het EIGEN fragment ────────────
//
// Dit is de vangrail onder de P1-fix van 1F fase 2. Een gedragstest bewijst dat
// de grondslag vandaag klopt; deze scan bewijst dat er geen tweede bron
// terugsluipt — een `?? artikel.raw_content` als terugval, een paginatekst die
// "even" wordt meegegeven, een `title` die het fragment aanvult. Precies dat
// soort terugval maakte van een overzichtspagina een grondslag.
//
// De kaart vroeg om `isWebItem` op `bron_soort` te laten draaien in plaats van
// op het URL-patroon. Fase 2 doet iets sterkers: het ONDERSCHEID vervalt, omdat
// élke bronsoort dezelfde twee kolommen leest. Deze test legt dát vast — er is
// geen bronsoort-tak meer om verkeerd te krijgen.
//
// Leest de bron met `readSourceLF` (CRLF-checkouts breken anders stil de
// comment-strip; zie lib/test-utils/read-source.ts).

import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { WACHTEND_ARTIKEL_KOLOMMEN, bepaalGrondslag, type WachtendArtikel } from './duiding'

const BRON = readSourceLF(join(__dirname, 'duiding.ts'))

/** Alleen de code: blok- en regelcommentaar eruit, zodat een woord in een uitleg niet meetelt. */
const CODE = BRON.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/** Wat een grondslag NOOIT mag zijn. */
const VERBODEN: ReadonlyArray<{ patroon: RegExp; waarom: string }> = [
  { patroon: /\braw_content\b/, waarom: 'de rauwe RSS-teaser is vóór ADR 0176 modeltekst geweest' },
  // Op de VELDVORM (`.summary`, `.title`), niet op het kale woord: `summary`
  // is ook de naam van de lokale telling (DuidingSummary) en `title` staat in
  // de prompt-tekst. De kolomLIJST wordt hieronder apart vastgepind.
  { patroon: /\.summary\b/, waarom: 'summary is door categorizeArticles herschreven modeltekst' },
  { patroon: /\.title\b/, waarom: 'de kop komt uit bron_kop, nooit uit de modelkop title' },
  { patroon: /\bsource_url\b/, waarom: 'de sleutel is geen grondslag en nodigt uit tot een fetch' },
  { patroon: /runTekstByPaginaUrl|webPaginaUrls|paginaTekst/, waarom: 'de paginatekst van een overzichtspagina is de P1-oorzaak' },
  { patroon: /fetchWebContent|isRegelbron|haalVolledigeTekst/, waarom: 'per-item ophalen komt terug in fase 3, achter een security-run' },
]

describe('lib/krant/duiding.ts — de grondslag leest alleen de eigen kolommen', () => {
  for (const { patroon, waarom } of VERBODEN) {
    it(`noemt ${patroon.source} nergens in de code — ${waarom}`, () => {
      expect(CODE).not.toMatch(patroon)
    })
  }

  it('leest precies de toegestane kolommen uit news_articles', () => {
    expect(WACHTEND_ARTIKEL_KOLOMMEN.split(',').map((k) => k.trim()).sort()).toEqual([
      'bron_fragment',
      'bron_kop',
      'bron_soort',
      'category',
      'duiding_pogingen',
      'id',
      'published_at',
      'published_bron',
      'source_name',
    ])
  })

  it('slaat legacy-rijen zonder bron_soort over (B29: die dragen geen eigen fragment)', () => {
    expect(CODE).toMatch(/\.not\('bron_soort', 'is', null\)/)
  })
})

describe('bepaalGrondslag', () => {
  const basis: WachtendArtikel = {
    id: 'a1',
    bron_soort: 'rss',
    bron_kop: null,
    bron_fragment: null,
    source_name: 'Bron',
    category: null,
    published_at: null,
    published_bron: 'feed',
    duiding_pogingen: 0,
  }

  it('kop + fragment vormen samen de grondslag, soort = fragment', () => {
    expect(bepaalGrondslag({ ...basis, bron_kop: 'Kop', bron_fragment: 'Het fragment.' })).toEqual({
      tekst: 'Kop\n\nHet fragment.',
      soort: 'fragment',
    })
  })

  it('zonder fragment blijft de kop over, soort = kop', () => {
    expect(bepaalGrondslag({ ...basis, bron_kop: 'Alleen een kop' })).toEqual({ tekst: 'Alleen een kop', soort: 'kop' })
  })

  it('zonder kop telt het fragment alleen', () => {
    expect(bepaalGrondslag({ ...basis, bron_fragment: 'Alleen tekst' })).toEqual({ tekst: 'Alleen tekst', soort: 'fragment' })
  })

  it('beide leeg (of alleen witruimte) → null: er valt niets te duiden en niets te gronden', () => {
    expect(bepaalGrondslag(basis)).toBeNull()
    expect(bepaalGrondslag({ ...basis, bron_kop: '   ', bron_fragment: '\n' })).toBeNull()
  })

  it('de bronsoort speelt geen rol: rss, web_lijst en web_pagina krijgen dezelfde grondslag', () => {
    const soorten = ['rss', 'web_lijst', 'web_pagina'] as const
    const uitkomsten = soorten.map((bron_soort) =>
      bepaalGrondslag({ ...basis, bron_soort, bron_kop: 'Kop', bron_fragment: 'Tekst' }),
    )
    expect(new Set(uitkomsten.map((u) => JSON.stringify(u))).size).toBe(1)
  })
})
