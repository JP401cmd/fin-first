import { describe, it, expect } from 'vitest'
import {
  stripHtml,
  decodeEntities,
  extractSecties,
  extractLinks,
  kopUitLinktekst,
  knipTekens,
  extractBronDatums,
  paginaTitel,
  isStoringspagina,
  STORING_MAX_TEKENS,
} from './news-html'
import {
  BELASTINGDIENST_STORING_HTML,
  STORING_ZONDER_KOP_HTML,
  STORING_BRON_KOP,
  STORING_BRON_FRAGMENT,
} from './news-storing.fixture'

// Een Rijksoverheid-achtige themapagina: JSON-LD en een Next-payload vóóraan,
// navigatie, dan de inhoud met h2-secties.
const THEMAPAGINA = `<!doctype html><html><head>
<title>Belastingplan | Rijksoverheid.nl</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","datePublished":"2025-09-16T15:00:00+02:00","dateModified":"2026-09-17T10:30:00+02:00"}</script>
<style>.x{color:red}</style>
</head><body>
<header><nav><a href="/themas">Alle thema's en onderwerpen</a></nav></header>
<script>self.__next_f.push([1,"{\\"heffing\\":999}"])</script>
<main>
<h1>Belastingplan</h1>
<p>Elk jaar op Prinsjesdag dient het kabinet het Belastingplan in. Daarin staan de wijzigingen in de belastingen voor het komende jaar.</p>
<h2>Wat verandert er in 2026?</h2>
<p>Het tarief in box 3 gaat in 2026 naar 36 procent. Het heffingsvrij vermogen blijft &euro; 57.684 per persoon.</p>
<!-- verborgen commentaar met 12345 -->
<h2>Kort</h2><p>Te kort.</p>
<h2>Wat verandert er in 2026?</h2>
<p>Het tarief in box 3 gaat in 2026 naar 36 procent. Het heffingsvrij vermogen blijft &euro; 57.684 per persoon.</p>
</main>
<footer><a href="/contact">Contact met de Rijksoverheid</a></footer>
</body></html>`

// Een CBS-achtige lijstpagina met nieuwsitems en navigatie.
const LIJSTPAGINA = `<html><body>
<nav><a href="https://www.cbs.nl/nl-nl/cijfers">StatLine en open data</a></nav>
<main>
<h1>Prijzen</h1>
<ul>
<li><a href="https://www.cbs.nl/nl-nl/nieuws/2026/36/woninghuur-stijgt-gemiddeld-met-4-4-procent">Woninghuur stijgt gemiddeld met 4,4 procent</a> <span>4-9-2026 06:30</span></li>
<li><a href="/nl-nl/nieuws/2026/37/inflatie-stijgt-naar-3-3-procent-in-augustus#top">Inflatie stijgt naar 3,3 procent in augustus</a> <span>8-9-2026 06:30</span></li>
<li><a href="/nl-nl/nieuws/2026/37/inflatie-stijgt-naar-3-3-procent-in-augustus">Inflatie stijgt naar 3,3 procent in augustus (dubbel)</a></li>
<li><a href="https://www.externe-site.nl/artikel-over-prijzen">Een artikel op een andere site</a></li>
<li><a href="//press/pr/date/2026/html/index.html">Protocol-relatieve link naar host press</a></li>
<li><a href="mailto:info@cbs.nl">Mail het CBS over prijzen</a></li>
<li><a href="/nl-nl/economie/prijzen">Prijzen (de pagina zelf)</a></li>
<li><a href="/meer">Meer</a></li>
</ul>
</main></body></html>`

describe('stripHtml — script, style, JSON-LD en commentaar gaan er MET inhoud uit', () => {
  it('houdt alleen lezerstekst over', () => {
    const t = stripHtml(THEMAPAGINA)
    expect(t).not.toMatch(/schema\.org|dateModified|__next_f|999|color:red|12345/)
    expect(t).toContain('Het tarief in box 3 gaat in 2026 naar 36 procent.')
    expect(t).toContain('€ 57.684')
  })

  it('decodeert benoemde en numerieke entiteiten', () => {
    expect(decodeEntities('Thema&#039;s &amp; Financi&#235;n &#x27;x&#x27;')).toBe("Thema's & Financiën 'x'")
  })
})

describe('knipTekens — op codepoints', () => {
  it('halveert nooit een surrogaatpaar en laat korte tekst ongemoeid', () => {
    expect(knipTekens('ab📈cd', 3)).toBe('ab📈')
    expect(knipTekens('ab📈cd', 2)).toBe('ab')
    expect(knipTekens('kort', 10)).toBe('kort')
  })
})

describe('extractSecties — web_pagina: server-geknipte secties', () => {
  it('knipt op h1–h3, zonder kaders, te korte secties en dubbelen', () => {
    const { secties, afgekapt } = extractSecties(THEMAPAGINA, 12)
    expect(secties.map((s) => s.kop)).toEqual(['Belastingplan', 'Wat verandert er in 2026?'])
    expect(secties[1].tekst).toMatch(/^Het tarief in box 3/)
    expect(secties.some((s) => /Contact|thema's/.test(s.tekst))).toBe(false)
    expect(afgekapt).toBe(0)
  })

  it('is deterministisch en draagt een expliciete cap', () => {
    expect(extractSecties(THEMAPAGINA, 12)).toEqual(extractSecties(THEMAPAGINA, 12))
    const { secties, afgekapt } = extractSecties(THEMAPAGINA, 1)
    expect(secties).toHaveLength(1)
    expect(afgekapt).toBe(1)
  })

  it('stabiel: twee fetches die alleen in het nieuws-/teaserblok verschillen, geven dezelfde secties (M3)', () => {
    const variant = (teaser: string) => THEMAPAGINA.replace(
      '<!-- verborgen commentaar met 12345 -->',
      `<ul><li><a href="/nieuws/1" class="card"><div class="card__body"><span>${teaser}</span><span>Lees verder</span></div></a></li>
       <li><a href="/nieuws/2">${teaser} 15-09-2026 15:35</a></li></ul>
       <p>Zie ook de <a href="/box3">pagina over box 3</a> voor de voorwaarden van het heffingsvrij vermogen.</p>`,
    )
    const a = extractSecties(variant('Kabinet presenteert Belastingplan 2027'), 12).secties
    const b = extractSecties(variant('Kamer stemt in met aanpassing box 3'), 12).secties
    expect(a).toEqual(b)
    // De inline link in lopende tekst blijft wél staan.
    expect(a.some((s) => s.tekst.includes('pagina over box 3'))).toBe(true)
    expect(a.some((s) => /Lees verder|Kabinet presenteert/.test(s.tekst))).toBe(false)
  })

  it('paginatitel: h1, anders <title> zonder sitestaart', () => {
    expect(paginaTitel(THEMAPAGINA)).toBe('Belastingplan')
    expect(paginaTitel('<title>Box 3 | Belastingdienst</title><body><p>x</p></body>')).toBe('Box 3')
  })
})

describe('extractLinks — web_lijst: alleen hrefs die op de pagina staan', () => {
  const PAGINA = 'https://www.cbs.nl/nl-nl/economie/prijzen'

  it('levert absolute URL\'s van dezelfde site, zonder anker, ontdubbeld, met de lijstregel als fragment', () => {
    const { links } = extractLinks(LIJSTPAGINA, PAGINA, 120)
    expect(links.map((l) => l.url)).toEqual([
      'https://www.cbs.nl/nl-nl/nieuws/2026/36/woninghuur-stijgt-gemiddeld-met-4-4-procent',
      'https://www.cbs.nl/nl-nl/nieuws/2026/37/inflatie-stijgt-naar-3-3-procent-in-augustus',
    ])
    expect(links[0].tekst).toBe('Woninghuur stijgt gemiddeld met 4,4 procent')
    expect(links[0].fragment).toBe('Woninghuur stijgt gemiddeld met 4,4 procent 4-9-2026 06:30')
  })

  it('weert navigatie, andere sites, protocol-relatieve hosts, mailto, de pagina zelf en korte menu-items', () => {
    const urls = extractLinks(LIJSTPAGINA, PAGINA, 120).links.map((l) => l.url)
    expect(urls.some((u) => /externe-site|press|mailto|statline|\/cijfers$|\/meer$/i.test(u))).toBe(false)
    expect(urls).not.toContain(PAGINA)
  })

  it('slaat filtervarianten van de pagina zelf over (CPB ?facet_author=) — die vulden de cap', () => {
    const filters = Array.from({ length: 200 }, (_, i) => `<a href="/nl-nl/economie/prijzen?facet_author=${i}">Filter op auteur nummer ${i}</a>`).join('')
    const html = `<main>${filters}<a href="/nl-nl/nieuws/2026/38/echte-publicatie">Een echte publicatie van deze week</a></main>`
    const { links, afgekapt } = extractLinks(html, PAGINA, 120)
    expect(links.map((l) => l.url)).toEqual(['https://www.cbs.nl/nl-nl/nieuws/2026/38/echte-publicatie'])
    expect(afgekapt).toBe(0)
  })

  it('"dezelfde site" volgt de geconfigureerde bron-URL, niet het eindadres na een redirect', () => {
    const html = '<main><a href="https://www.cbs.nl/nl-nl/nieuws/x">Een nieuwsbericht op de bronsite</a><a href="https://elders.nl/y">Een bericht op de redirect-site</a></main>'
    const urls = extractLinks(html, 'https://elders.nl/lijst', 120, PAGINA).links.map((l) => l.url)
    expect(urls).toEqual(['https://www.cbs.nl/nl-nl/nieuws/x'])
  })

  it('blijft lineair op een vijandige pagina vol ongesloten tags', () => {
    const vijandig = '<main>' + '<a href="/x">'.repeat(40_000) + '<script>'.repeat(40_000) + '<'.repeat(200_000) + '</main>'
    const t0 = Date.now()
    extractLinks(vijandig, PAGINA, 120)
    extractSecties(vijandig, 12)
    stripHtml(vijandig)
    expect(Date.now() - t0).toBeLessThan(3_000)
  })

  it('kopUitLinktekst haalt een datum in de linktekst weg, en laat een te korte rest staan', () => {
    expect(kopUitLinktekst('Woninghuur stijgt gemiddeld met 4,4 procent 4-9-2026 06:30')).toBe('Woninghuur stijgt gemiddeld met 4,4 procent')
    expect(kopUitLinktekst('14 augustus 2026 Concept-Macro Economische Verkenning (cMEV) 2027')).toBe('Concept-Macro Economische Verkenning (cMEV) 2027')
    expect(kopUitLinktekst('12 maart 2026 CEP')).toBe('12 maart 2026 CEP')
  })

  it('de cap is expliciet', () => {
    const { links, afgekapt } = extractLinks(LIJSTPAGINA, PAGINA, 1)
    expect(links).toHaveLength(1)
    expect(afgekapt).toBe(1)
  })
})

describe('extractBronDatums — datums uit metadata, nooit uit tekst', () => {
  it('leest JSON-LD dateModified/datePublished als ISO', () => {
    expect(extractBronDatums(THEMAPAGINA)).toEqual({
      gewijzigd: '2026-09-17T08:30:00.000Z',
      gepubliceerd: '2025-09-16T13:00:00.000Z',
    })
  })

  it('valt terug op article:*-meta en geeft null zonder metadata', () => {
    const og = '<meta property="article:published_time" content="2026-09-04T06:30:00+02:00">'
    expect(extractBronDatums(og)).toEqual({ gewijzigd: null, gepubliceerd: '2026-09-04T04:30:00.000Z' })
    expect(extractBronDatums(LIJSTPAGINA)).toEqual({ gewijzigd: null, gepubliceerd: null })
  })
})

// ── Storings- en onderhoudspagina's (27 sep 2026) ────────────────────

/** Een pagina met precies deze lezerstekst in `<main>` en zonder titel. */
const kalePagina = (tekst: string) => `<html><body><main><p>${tekst}</p></main></body></html>`

describe('isStoringspagina — een onderhoudsmelding wordt nooit een artikel', () => {
  it('de fixture is getrouw: de ingest had uit deze HTML precies de productierij 41f41a58 geknipt', () => {
    // Zonder deze toets zou de regressietest een verzonnen pagina toetsen.
    const { secties } = extractSecties(BELASTINGDIENST_STORING_HTML, 12)
    expect(secties).toEqual([{ kop: STORING_BRON_KOP, tekst: STORING_BRON_FRAGMENT }])
  })

  it('tak 1: de paginatitel meldt de storing (de echte Belastingdienst-pagina van 26 sep)', () => {
    expect(isStoringspagina(BELASTINGDIENST_STORING_HTML)).toBe(true)
  })

  it('tak 2: zonder kop, maar een korte pagina met de melding in de aanhef', () => {
    expect(paginaTitel(STORING_ZONDER_KOP_HTML)).toBe('Belastingdienst')
    expect(isStoringspagina(STORING_ZONDER_KOP_HTML)).toBe(true)
  })

  it('een gewone themapagina is geen storing', () => {
    expect(isStoringspagina(THEMAPAGINA)).toBe(false)
    expect(isStoringspagina(LIJSTPAGINA)).toBe(false)
  })

  it('geen vals-positief op een losse zin diep in een lange pagina', () => {
    const lang = `<html><head><title>Toeslagen</title></head><body><main><h1>Toeslagen</h1>
<p>${'Over de toeslagen die u kunt krijgen en hoe u ze aanvraagt. '.repeat(20)}</p>
<h2>Mijn toeslagen</h2><p>Mijn toeslagen is tijdelijk niet beschikbaar wegens gepland onderhoud. Probeer het later opnieuw.</p>
</main></body></html>`
    expect(isStoringspagina(lang)).toBe(false)
  })

  it('gangbare onderhoudsformuleringen in de kop tellen (eindreview 27 sep)', () => {
    for (const kop of ['Mijn Belastingdienst is tijdelijk in onderhoud', 'We zijn bezig met onderhoud', 'De site is in onderhoud']) {
      expect(isStoringspagina(`<html><body><main><h1>${kop}</h1><p>Excuses voor het ongemak.</p></main></body></html>`)).toBe(true)
    }
  })

  it('"onderhoud" alléén in de kop is geen storing (Onderhoud eigen woning)', () => {
    const html = `<html><body><main><h1>Onderhoud eigen woning</h1><p>Kosten voor onderhoud van uw eigen woning zijn niet aftrekbaar in box 1.</p></main></body></html>`
    expect(isStoringspagina(html)).toBe(false)
  })

  it('tak 2, lengtegrens aan béíde kanten: precies de grens telt nog, één teken meer niet', () => {
    const melding = 'Deze website is niet beschikbaar.'
    const opGrens = melding + ' ' + 'x'.repeat(STORING_MAX_TEKENS - melding.length - 1)
    expect(opGrens).toHaveLength(STORING_MAX_TEKENS)
    expect(isStoringspagina(kalePagina(opGrens))).toBe(true)
    expect(isStoringspagina(kalePagina(opGrens + 'x'))).toBe(false)
  })

  it('tak 2, aanhefgrens aan béíde kanten: de melding moet binnen de eerste 300 tekens vallen', () => {
    const melding = 'niet beschikbaar' // 16 tekens
    const binnen = 'x'.repeat(283) + ' ' + melding // eindigt op teken 300
    const erbuiten = 'x'.repeat(284) + ' ' + melding // laatste letter valt op teken 301
    expect(isStoringspagina(kalePagina(binnen))).toBe(true)
    expect(isStoringspagina(kalePagina(erbuiten))).toBe(false)
  })
})
