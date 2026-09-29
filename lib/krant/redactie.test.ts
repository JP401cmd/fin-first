// ── Redactieregels (ADR 0191) — elke tak aan beide uiteinden ────────────────

import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readSourceLF } from '@/lib/test-utils/read-source'
import { PAGINA_DATUM_PATRONEN } from '@/lib/news-sources'
import {
  AANHEF_TEKENS,
  CARIBISCH_MIN_TREFFERS_AANHEF,
  heeftEchteDatum,
  isBasisSectie,
  isBufferBericht,
  isCaribischBericht,
  lezersDatum,
} from './redactie'

describe('regel 1 — isBasisSectie', () => {
  it('web_pagina: alleen "gewijzigd" is nieuws; basis en ontbrekend (voorzichtig) zijn de stand van zaken', () => {
    expect(isBasisSectie({ bron_soort: 'web_pagina', bron_wijziging: 'basis' })).toBe(true)
    expect(isBasisSectie({ bron_soort: 'web_pagina', bron_wijziging: null })).toBe(true)
    expect(isBasisSectie({ bron_soort: 'web_pagina' })).toBe(true)
    expect(isBasisSectie({ bron_soort: 'web_pagina', bron_wijziging: 'gewijzigd' })).toBe(false)
  })

  it('rss en web_lijst zijn nieuwsberichten, nooit basis — ook zonder bronsoort (oude fixtures)', () => {
    expect(isBasisSectie({ bron_soort: 'rss', bron_wijziging: null })).toBe(false)
    expect(isBasisSectie({ bron_soort: 'web_lijst', bron_wijziging: null })).toBe(false)
    expect(isBasisSectie({})).toBe(false)
  })
})

describe('regel 2a — isCaribischBericht', () => {
  it('een treffer in de kop is genoeg (de twee berichten uit de steekproef)', () => {
    expect(isCaribischBericht('Caribisch Nederland: leidraad voor hypotheekadvisering in Caribisch Nederland beschikbaar', null)).toBe(true)
    expect(isCaribischBericht('Inflatie Caribisch Nederland', 'De prijzen stegen.')).toBe(true)
    expect(isCaribischBericht('Benoeming nieuw lid College financieel toezicht Curaçao en Sint Maarten', null)).toBe(true)
    expect(isCaribischBericht('Koning bezoekt Sint Eustatius', null)).toBe(true)
    expect(isCaribischBericht('Nieuwe regels voor de BES-eilanden', null)).toBe(true)
    expect(isCaribischBericht('Minimumloon BES stijgt', null)).toBe(true)
  })

  it('in het fragment: pas vanaf twee treffers in de aanhef', () => {
    const tweeKeer = 'De huurtoeslag verandert. Dat geldt voor Bonaire, Sint Eustatius en Saba.'
    expect(isCaribischBericht('Huurtoeslag verandert per 2027', tweeKeer)).toBe(true)
    // Precies één treffer: terloops, niet uitsluiten.
    const eenKeer = 'Het minimumloon stijgt per 1 januari met 2 procent. Ook op Bonaire gelden nieuwe bedragen.'
    expect(isCaribischBericht('Minimumloon stijgt per 1 januari', eenKeer)).toBe(false)
    expect(CARIBISCH_MIN_TREFFERS_AANHEF).toBe(2)
  })

  it('treffers diep in een lang artikel (na de aanhef) sluiten niets uit', () => {
    const lang = `Het minimumloon stijgt per 1 januari. ${'Werkgevers passen de lonen aan. '.repeat(40)} Bonaire en Saba volgen later.`
    expect(lang.indexOf('Bonaire')).toBeGreaterThan(AANHEF_TEKENS)
    expect(isCaribischBericht('Minimumloon stijgt per 1 januari', lang)).toBe(false)
  })

  it('woordgrenzen: Sint Maartensdijk, WolBES en "bes" in lopende tekst zijn geen treffer', () => {
    expect(isCaribischBericht('Nieuwe woningen in Sint Maartensdijk', null)).toBe(false)
    expect(isCaribischBericht('Herzieningswet WolBES en FinBES naar Raad van State', null)).toBe(false)
    expect(isCaribischBericht('Een bes in de pap', 'bes bes bes')).toBe(false)
    expect(isCaribischBericht('Inflatie stijgt naar 3,3 procent in augustus', null)).toBe(false)
  })
})

describe('regel 2b — isBufferBericht', () => {
  it('de kop noemt een buffer → bufferbericht (de AFM-blog uit de steekproef)', () => {
    expect(isBufferBericht('Blog: betaal jezelf eerst: spaarbuffer', null)).toBe(true)
    expect(isBufferBericht('Hoe groot moet je noodbuffer zijn?', null)).toBe(true)
  })

  it('de kop noemt rente → rentebericht, ook als het fragment een buffer noemt', () => {
    expect(isBufferBericht('Spaarrente daalt verder', 'Een financiële buffer blijft verstandig.')).toBe(false)
    expect(isBufferBericht('ECB verlaagt rente: gevolgen voor je buffer', null)).toBe(false)
  })

  it('zonder buffer in de kop beslist een vaste formulering in de aanhef', () => {
    expect(isBufferBericht('Veel huishoudens kwetsbaar', 'Een op de vijf huishoudens heeft minder dan € 1.000 spaargeld.')).toBe(true)
    expect(isBufferBericht('Veel huishoudens kwetsbaar', 'Een op de vijf huishoudens heeft geen spaargeld.')).toBe(true)
    expect(isBufferBericht('Spaarders zetten meer opzij', 'Het totale spaargeld groeide naar 500 miljard euro.')).toBe(false)
    expect(isBufferBericht('Spaarders zetten meer opzij', null)).toBe(false)
  })

  it('een bufferformulering ná de aanhef telt niet', () => {
    const lang = `${'Spaarders zetten meer opzij. '.repeat(30)} Wie geen spaargeld heeft, merkt dat.`
    expect(isBufferBericht('Spaargeld groeit', lang)).toBe(false)
  })
})

describe('regel 3 — de echte datum', () => {
  it('feed, meta en pagina zijn echt; eerste_gezien en ontbrekend niet', () => {
    for (const b of ['feed', 'meta', 'pagina']) expect(heeftEchteDatum(b)).toBe(true)
    for (const b of ['eerste_gezien', null, undefined, 'iets-anders']) expect(heeftEchteDatum(b)).toBe(false)
  })

  it('lezersDatum: een echte datum is gepubliceerd; anders "gezien op" het ophaalmoment — nooit beide', () => {
    const fetched_at = '2026-09-22T05:25:00.000Z'
    expect(lezersDatum({ published_at: '2026-08-24T00:00:00.000Z', published_bron: 'pagina', fetched_at })).toEqual({
      gepubliceerd: '2026-08-24T00:00:00.000Z',
      gezienOp: null,
    })
    // Bij eerste_gezien is published_at het ophaalmoment: dat is nooit een publicatiedatum.
    expect(lezersDatum({ published_at: fetched_at, published_bron: 'eerste_gezien', fetched_at })).toEqual({ gepubliceerd: null, gezienOp: fetched_at })
    expect(lezersDatum({ published_at: null, published_bron: 'feed', fetched_at })).toEqual({ gepubliceerd: null, gezienOp: fetched_at })
    expect(lezersDatum({ published_at: fetched_at, fetched_at })).toEqual({ gepubliceerd: null, gezienOp: fetched_at })
  })
})

describe('migratie 20261009120000 — tekstueel: herhaalbaar en gelijk aan de code', () => {
  const sql = readSourceLF(join(process.cwd(), 'supabase/migrations/20261009120000_news_articles_redactieregels.sql'))

  it('één transactie', () => {
    expect(sql).toMatch(/^begin;$/m)
    expect(sql).toMatch(/^commit;$/m)
    expect(sql.indexOf('begin;')).toBeLessThan(sql.indexOf('commit;'))
  })

  it('kolom en CHECKs zijn herhaalbaar (if not exists / pg_constraint / drop if exists)', () => {
    expect(sql).toContain('add column if not exists bron_wijziging text')
    expect(sql).toContain("conname = 'news_articles_bron_wijziging_check'")
    expect(sql).toContain("conname = 'news_articles_bron_wijziging_soort_check'")
    expect(sql).toContain('drop constraint if exists news_articles_published_bron_check')
    expect(sql).toContain("published_bron in ('feed', 'meta', 'pagina', 'eerste_gezien')")
  })

  it('backfill bron_wijziging raakt alleen rijen zonder status: een tweede run verandert niets', () => {
    const blok = sql.slice(sql.indexOf('── 3.'), sql.indexOf('── 4.'))
    expect(blok.match(/and a\.bron_wijziging is null/g)).toHaveLength(1)
    expect(blok).toContain("where bron_soort = 'web_pagina' and bron_wijziging is null")
    expect(blok).toContain("case when a.fetched_at = e.eerste_run then 'basis' else 'gewijzigd' end")
  })

  it('backfill datum raakt alleen eerste_gezien (daarna "pagina") en alleen gelezen artikeltekst', () => {
    const blok = sql.slice(sql.indexOf('── 4.'), sql.indexOf('── 5.'))
    expect(blok).toContain("and published_bron = 'eerste_gezien'")
    expect(blok).toContain("and bron_detail = 'gelezen'")
    expect(blok).toContain("where id = r.id and published_bron = 'eerste_gezien'")
    expect(blok).toContain('left(r.bron_fragment, 400)')
    expect(blok).toContain('- 730')
  })

  it('backfill datum gebruikt per host exact het patroon van PAGINA_DATUM_PATRONEN', () => {
    const blok = sql.slice(sql.indexOf('── 4.'), sql.indexOf('── 5.'))
    for (const [host, def] of Object.entries(PAGINA_DATUM_PATRONEN)) {
      expect(blok).toContain(`r.source_url like 'https://${host}/%'`)
      // JS escapet de slash in een regex-literal; Postgres niet.
      expect(blok).toContain(`'${def.patroon.source.replace(/\\\//g, '/')}'`)
    }
  })

  it('de momentopnamen: alleen items zonder gezienOp (herhaalbaar)', () => {
    const blok = sql.slice(sql.indexOf('── 5.'))
    expect(blok).toContain("and not (i.snapshot ? 'gezienOp')")
    expect(blok).toContain("x ? 'gezienOp' then x")
    expect(blok).toContain('e.algemeen is distinct from')
  })
})
