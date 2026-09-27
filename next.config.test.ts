import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { stringify } from 'node:querystring'
import {
  matchHas,
  prepareDestination,
} from 'next/dist/shared/lib/router/utils/prepare-destination'
import nextConfig from './next.config'

/**
 * Regressietest bij de productiebug "Minified React error #310" op
 * /core/cash en /horizon/whatif (error_logs, 29 jul – 4 aug 2026).
 *
 * ## Waarom dit een configuratie-test is en geen render-test
 *
 * De crash zat NIET in TriFinity-code maar in de AppRouter van Next.js zelf
 * (node_modules/next/dist/client/components/app-router.js). Die component gooit
 * middenin zijn hook-lijst `throw unresolvedThenable` zodra
 * `pushRef.mpaNavigation` waar is, en rendert bij een volgende render wél alle
 * hooks — "Rendered more hooks than during the previous render". Next erkent de
 * schending in de comment ernaast ("violates the rules of hooks").
 *
 * Wij bezitten die code niet; wat we wél bezitten is de TRIGGER. Beide routes
 * waren server-componenten die bij render meteen `redirect()` aanriepen, wat de
 * client-router bij een SPA-navigatie het harde-navigatie-pad in duwt. Alle zes
 * #310-events ooit kwamen van precies deze twee routes — nul op een echte
 * pagina. De fix haalt de trigger weg door op de ROUTING-laag te redirecten.
 *
 * Deze suite bewaakt daarom twee dingen: dat de routing-laag-redirects er zijn
 * én dat er geen `page.tsx` terugkomt die de runtime-redirect herintroduceert.
 *
 * TWEEDE LICHTING (11 aug 2026). Vier routes droegen ná die fix nog exact
 * hetzelfde patroon — latent: nul #310-events op hun naam, maar dezelfde
 * trigger bij het eerste bezoek. /horizon/strategie,
 * /horizon/uitgaven-na-pensioen, /toekomst/strategie en
 * /toekomst/uitgaven-na-pensioen zijn met hetzelfde middel behandeld en staan
 * hieronder onder dezelfde bewaking.
 */

type RedirectRule = Awaited<ReturnType<NonNullable<typeof nextConfig.redirects>>>[number]

async function rulesFor(source: string): Promise<RedirectRule[]> {
  const all = await nextConfig.redirects!()
  return all.filter((r) => r.source === source)
}

describe('next.config redirects — legacy routes redirecten op de routing-laag (React #310)', () => {
  it('/core/cash redirect naar de rekeningen bij de bezittingen', async () => {
    // Wees eerst naar de cashflow-hub; die is opgeheven (UR3-28) en de
    // rekeningen wonen sindsdien op hun eigen bezitgroep-pagina.
    const rules = await rulesFor('/core/cash')
    expect(rules).toHaveLength(1)
    expect(rules[0].destination).toBe('/overzicht/bezittingen/cash')
    // Bewust tijdelijk (307), niet permanent (308): browsers cachen een 308
    // agressief, en deze migratie moet omkeerbaar blijven.
    expect(rules[0].permanent).toBe(false)
  })

  it('/horizon/strategie en uitgaven-na-pensioen landen op hun rij in Instellingen (ADR 0179 fase 3)', async () => {
    for (const [source, destination] of [
      // Rechtstreeks naar de rij, geen hop via /toekomst?strategie=open of ?uitgaven=open.
      ['/horizon/strategie', '/toekomst/instellingen?rij=stopmoment'],
      ['/horizon/uitgaven-na-pensioen', '/toekomst/instellingen?rij=uitgave-na-pensioen'],
      ['/toekomst/uitgaven-na-pensioen', '/toekomst/instellingen?rij=uitgave-na-pensioen'],
    ]) {
      const rules = await rulesFor(source)
      expect(rules, `${source} mist een routing-laag-redirect`).toHaveLength(1)
      expect(rules[0].destination).toBe(destination)
      expect(rules[0].permanent).toBe(false)
    }
  })

  it('/toekomst/strategie houdt de focus-vertakking van de oude server-component', async () => {
    const rules = await rulesFor('/toekomst/strategie')
    expect(rules).toHaveLength(2)

    // Volgorde-eis: de gerichte variant eerst,
    // anders vangt de catch-all elke ?focus= af en landt alles op `aow`.
    const [gericht, fallback] = rules
    expect(gericht.has).toEqual([
      { type: 'query', key: 'focus', value: '(?<focus>aow|pensioen|huis|werk)' },
    ])
    // Sinds 27 sep 2026 staan de levensstrategieën op Plan (ADR 0179 addendum (e)).
    expect(gericht.destination).toBe('/toekomst?rij=:focus#levensstrategieen')

    expect(fallback.has).toBeUndefined()
    expect(fallback.destination).toBe('/toekomst?rij=aow#levensstrategieen')
  })

  it('/horizon/whatif en /toekomst/whatif landen kaal op het lab in katern Doelen (ADR 0144, 0179)', async () => {
    // Eén regel per route, zonder `has`/`missing`: ook een oude ?via=dreamgate
    // valt er gewoon onder — er is geen losse Wat-Als-pagina meer.
    for (const source of ['/horizon/whatif', '/toekomst/whatif']) {
      const rules = await rulesFor(source)
      expect(rules, `${source} mist een routing-laag-redirect`).toHaveLength(1)
      expect(rules[0].has).toBeUndefined()
      expect(rules[0].missing).toBeUndefined()
      // Rechtstreeks naar het katern, geen hop via /toekomst (ADR 0179 stap 16).
      expect(rules[0].destination).toBe('/toekomst/doelen')
      expect(rules[0].permanent).toBe(false)
    }
  })

  it('/toekomst/voorkeuren gaat op in Instellingen, /toekomst/gebeurtenissen landt onder het plan (ADR 0179, addendum 26 sep)', async () => {
    const voorkeuren = await rulesFor('/toekomst/voorkeuren')
    expect(voorkeuren).toHaveLength(2)
    for (const r of voorkeuren) expect(r.permanent).toBe(false)
    // Eerst de levensstrategieën: die staan sinds 27 sep 2026 op Plan (addendum (e)).
    expect(voorkeuren[0].has).toEqual([
      { type: 'query', key: 'strategie', value: '(?:aow|pensioen|huis|werk)' },
    ])
    expect(voorkeuren[0].destination).toBe('/toekomst#levensstrategieen')
    // Daarna de rest naar Instellingen, zonder `has`-filter: elke overige query (?regel=) gaat mee.
    expect(voorkeuren[1].destination).toBe('/toekomst/instellingen')
    expect(voorkeuren[1].has).toBeUndefined()

    const gebeurtenissen = await rulesFor('/toekomst/gebeurtenissen')
    expect(gebeurtenissen).toHaveLength(2)
    for (const r of gebeurtenissen) expect(r.permanent).toBe(false)
  })

  it('geen redirect wijst nog naar de opgeheven routes (geen dubbele hop)', async () => {
    const all = await nextConfig.redirects!()
    for (const r of all) {
      expect(r.destination, `${r.source} → ${r.destination}`).not.toMatch(
        /^\/toekomst\/(voorkeuren|gebeurtenissen)(\?|#|$)/,
      )
    }
  })

  it('geen page.tsx meer op de negen routes — anders is de runtime-redirect terug', () => {
    // Een `page.tsx` hier zou opnieuw een React-boom bouwen die zichzelf
    // meteen wegredirect: precies de trigger die deze fix wegnam.
    for (const route of [
      'app/(app)/core/cash/page.tsx',
      'app/(app)/horizon/whatif/page.tsx',
      'app/(app)/toekomst/whatif/page.tsx',
      'app/(app)/horizon/strategie/page.tsx',
      'app/(app)/horizon/uitgaven-na-pensioen/page.tsx',
      'app/(app)/toekomst/strategie/page.tsx',
      'app/(app)/toekomst/uitgaven-na-pensioen/page.tsx',
      'app/(app)/toekomst/voorkeuren/page.tsx',
      'app/(app)/toekomst/gebeurtenissen/page.tsx',
    ]) {
      expect(existsSync(path.join(process.cwd(), route)), `${route} hoort niet te bestaan`).toBe(
        false,
      )
    }
  })

  it('de redirect-doelen zijn zelf geen redirect-only route (geen keten)', () => {
    // /toekomst en /toekomst/instellingen renderen echte pagina's; zou een doel
    // zelf een runtime-redirect zijn, dan was de trigger alleen verplaatst.
    // Sinds de katern-layout (ADR 0179 fase 1 stap 15) staan de katernen in de
    // route-groep `(katern)/`, die geen URL-segment toevoegt.
    for (const target of [
      'app/(app)/toekomst/(katern)/page.tsx',
      'app/(app)/toekomst/(katern)/instellingen/page.tsx',
    ]) {
      expect(existsSync(path.join(process.cwd(), target))).toBe(true)
    }
  })
})

/**
 * Oude `/toekomst?tab=`- en `?modal=withdrawal`-deeplinks (ADR 0179, besluit Q2).
 *
 * Verhuisd uit `app/(app)/toekomst/redirect-guard.test.ts`: de guard
 * (`resolveTabRedirect`) is vervangen door `has`-regels. Deze cases lopen door
 * Next's EIGEN matcher (`matchHas`) en bestemmingsbouwer (`prepareDestination`),
 * in dezelfde volgorde als de router (eerste treffer wint) — zo toetsen ze de
 * echte Location, inclusief volgorde-eisen en het doorgeven van de query.
 */
async function resolveLocation(url: string): Promise<string | null> {
  const [pathAndQuery, hashIn] = url.split('#')
  if (hashIn !== undefined) throw new Error('een hash bereikt de server niet')
  const [pathname, qs = ''] = pathAndQuery.split('?')
  const query: Record<string, string | string[]> = {}
  for (const [k, v] of new URLSearchParams(qs)) {
    const prev = query[k]
    query[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v]
  }
  for (const rule of await nextConfig.redirects!()) {
    if (rule.source !== pathname) continue
    const params = matchHas({ headers: {} } as never, query, rule.has, rule.missing)
    if (!params) continue
    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: false,
      destination: rule.destination,
      params,
      query,
    })
    const search = stringify(parsedDestination.query as Record<string, string | string[]>)
    return `${parsedDestination.pathname}${search ? `?${search}` : ''}${parsedDestination.hash ?? ''}`
  }
  return null
}

describe('next.config redirects — /toekomst/gebeurtenissen (ADR 0179, addendum 26 sep)', () => {
  it('kaal en met ?nieuw= → Plan, bij de gebeurtenissen; de query reist mee', async () => {
    expect(await resolveLocation('/toekomst/gebeurtenissen')).toBe('/toekomst#gebeurtenissen')
    expect(await resolveLocation('/toekomst/gebeurtenissen?nieuw=1')).toBe('/toekomst?nieuw=1#gebeurtenissen')
  })

  it('met een levensstrategie → Plan, bij de levensstrategieën (sinds 27 sep 2026, addendum (e))', async () => {
    for (const key of ['aow', 'pensioen', 'huis', 'werk']) {
      expect(await resolveLocation(`/toekomst/gebeurtenissen?strategie=${key}`)).toBe(
        `/toekomst?strategie=${key}#levensstrategieen`,
      )
    }
    expect(await resolveLocation('/toekomst/gebeurtenissen?strategie=aowx')).toBe(
      '/toekomst?strategie=aowx#gebeurtenissen',
    )
  })
})

describe('next.config redirects — oude /toekomst?tab= en ?modal=withdrawal (ADR 0179 Q2)', () => {
  it('tab=voorkeuren → Instellingen', async () => {
    expect(await resolveLocation('/toekomst?tab=voorkeuren')).toBe(
      '/toekomst/instellingen?tab=voorkeuren',
    )
  })

  it('tab=gebeurtenissen blijft op Plan: geen redirect (dat zou een lus zijn); OudeTabParam zet het anker', async () => {
    expect(await resolveLocation('/toekomst?tab=gebeurtenissen')).toBeNull()
    expect(await resolveLocation('/toekomst?tab=gebeurtenissen&nieuw=1')).toBeNull()
  })

  it('tab=gebeurtenissen mét levensstrategie blijft op Plan: geen redirect; OudeTabParam en de editor-host doen de rest', async () => {
    // Sinds 27 sep 2026 staan de levensstrategieën op Plan zelf (addendum (e)): een redirect
    // van /toekomst naar /toekomst zou een lus zijn. OudeTabParam haalt `tab` weg, de
    // editor-host leest `strategie` en opent de levensstrategie.
    for (const key of ['aow', 'pensioen', 'huis', 'werk']) {
      expect(await resolveLocation(`/toekomst?tab=gebeurtenissen&strategie=${key}`)).toBeNull()
    }
    // Geen levensstrategie-sleutel (een prefix-truc): geen regel, dus Plan — waar
    // OudeTabParam het anker #gebeurtenissen zet (addendum 26 sep).
    for (const waarde of ['aowx', 'xwerk']) {
      expect(await resolveLocation(`/toekomst?tab=gebeurtenissen&strategie=${waarde}`)).toBeNull()
    }
    // `strategie=open` is de tijdas-param: die heeft zijn eigen regel naar de rij Stopmoment.
    expect(await resolveLocation('/toekomst?tab=gebeurtenissen&strategie=open')).toBe(
      '/toekomst/instellingen?tab=gebeurtenissen&strategie=open&rij=stopmoment',
    )
  })

  it('tab=doelen → Doelen, overige params mee', async () => {
    expect(await resolveLocation('/toekomst?tab=doelen')).toBe('/toekomst/doelen?tab=doelen')
    expect(await resolveLocation('/toekomst?tab=doelen&focus=g1&mode=edit')).toBe(
      '/toekomst/doelen?tab=doelen&focus=g1&mode=edit',
    )
  })

  it('tab=rekenhulp → Rekenhulp', async () => {
    expect(await resolveLocation('/toekomst?tab=rekenhulp')).toBe('/toekomst/rekenhulp?tab=rekenhulp')
  })

  it('modal=withdrawal → Instellingen, rij Onttrekking open', async () => {
    expect(await resolveLocation('/toekomst?modal=withdrawal')).toBe(
      '/toekomst/instellingen?modal=withdrawal&rij=onttrekking',
    )
  })

  it('uitgaven=open → Instellingen, rij Uitgave na pensioen (ADR 0179 fase 3: de pane op Plan is weg)', async () => {
    expect(await resolveLocation('/toekomst?uitgaven=open')).toBe(
      '/toekomst/instellingen?uitgaven=open&rij=uitgave-na-pensioen',
    )
    expect(await resolveLocation('/toekomst?uitgaven=dicht')).toBeNull()
  })

  it('?strategie=open en ?modal=strategie landen op de rij Stopmoment in Instellingen (ADR 0179 fase 3)', async () => {
    expect(await resolveLocation('/toekomst?strategie=open')).toBe(
      '/toekomst/instellingen?strategie=open&rij=stopmoment',
    )
    expect(await resolveLocation('/toekomst?modal=strategie')).toBe(
      '/toekomst/instellingen?modal=strategie&rij=stopmoment',
    )
    // `?strategie=<levensstrategie>` hoort bij Instellingen zelf, niet bij /toekomst.
    expect(await resolveLocation('/toekomst?strategie=huis')).toBeNull()
  })

  it('?whatif=open landt op het lab in katern Doelen; de query reist mee (ADR 0179 stap 16)', async () => {
    expect(await resolveLocation('/toekomst?whatif=open')).toBe('/toekomst/doelen?whatif=open')
    expect(await resolveLocation('/toekomst?whatif=open&via=dreamgate')).toBe(
      '/toekomst/doelen?whatif=open&via=dreamgate',
    )
    // Alleen de waarde `open`: een onbekende waarde blijft op Plan.
    expect(await resolveLocation('/toekomst?whatif=dicht')).toBeNull()
  })

  it('niet redirecten: geen tab, onbekende tab, de tijdas-params en de overige modals', async () => {
    for (const url of [
      '/toekomst',
      '/toekomst?tab=bestaat-niet',
      '/toekomst?tab=',
      '/toekomst?planreview=open',
      '/toekomst?modal=life_events',
      '/toekomst?modal=scenarios',
    ]) {
      expect(await resolveLocation(url), url).toBeNull()
    }
  })

  it('geen lus: het doel van elke /toekomst-queryregel matcht zelf geen regel', async () => {
    // Next geeft de query (incl. `tab`/`modal`) door aan het doel. Dat mag alleen
    // omdat geen enkele regel op een doelpad matcht — anders was dit een lus.
    const doelen = (await nextConfig.redirects!())
      .filter((r) => r.source === '/toekomst' && r.has)
      .map((r) => r.destination.split(/[?#]/)[0])
    expect(doelen.length).toBeGreaterThanOrEqual(6)
    for (const doel of new Set(doelen)) {
      expect(doel).not.toBe('/toekomst')
      expect(await resolveLocation(`${doel}?tab=voorkeuren&modal=withdrawal`), doel).toBeNull()
      // Het doel is een echte pagina — ook nadat hij in de `(katern)`-groep verhuist.
      const rest = doel.replace(/^\/toekomst/, '')
      const kandidaten = [
        path.join(process.cwd(), 'app/(app)', doel, 'page.tsx'),
        path.join(process.cwd(), 'app/(app)/toekomst/(katern)', rest, 'page.tsx'),
      ]
      expect(kandidaten.some((p) => existsSync(p)), doel).toBe(true)
    }
  })

  it('de oude render-guard is weg (redirect-only-trigger, React #310)', () => {
    // /toekomst rendert een echte pagina; zijn render mag niet zelf redirecten.
    // Stap 15 verhuist de page naar de `(katern)`-groep; de toets volgt hem.
    const pagina = ['app/(app)/toekomst/page.tsx', 'app/(app)/toekomst/(katern)/page.tsx']
      .map((p) => path.join(process.cwd(), p))
      .find((p) => existsSync(p))
    expect(pagina, 'de /toekomst-page is niet gevonden').toBeDefined()
    const code = readFileSync(pagina!, 'utf8')
    expect(code).not.toMatch(/resolveTabRedirect|from 'next\/navigation'/)
  })
})

/**
 * Content-Security-Policy — de report-only/enforce-koppeling.
 *
 * Aanleiding: de Lighthouse-nulmeting (11 aug 2026) hield Best practices op 96
 * op ÉLKE pagina door één console-error: "The Content Security Policy directive
 * `upgrade-insecure-requests` is ignored when delivered in a report-only
 * policy." De directive is daar per spec inert — hij deed dus geen werk en
 * kostte wel een punt. In enforce-modus hoort hij er juist wél in te staan.
 *
 * Die koppeling is het enige dat hier bewaakt wordt: niet "de directive is weg"
 * (dat zou een latere enforce-switch blokkeren) maar "hij hoort bij enforce".
 */
describe('next.config security-headers — CSP', () => {
  async function cspHeader() {
    const groups = await nextConfig.headers!()
    const found = groups
      .flatMap((g) => g.headers)
      .filter((h) => h.key.startsWith('Content-Security-Policy'))

    // Twee CSP-headers tegelijk zou betekenen dat de enforce-switch de
    // report-only-variant niet vervangt maar ernaast zet.
    expect(found).toHaveLength(1)
    return found[0]
  }

  it('stuurt upgrade-insecure-requests alleen mee in enforce-modus', async () => {
    const csp = await cspHeader()
    const isReportOnly = csp.key === 'Content-Security-Policy-Report-Only'

    expect(csp.value.includes('upgrade-insecure-requests')).toBe(!isReportOnly)
  })

  it('houdt de directives die los van de modus altijd gelden', async () => {
    const csp = await cspHeader()

    for (const directive of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ]) {
      expect(csp.value, `${directive} mag niet stilletjes verdwijnen`).toContain(directive)
    }
  })

  it('levert de niet-CSP-beveiligingsheaders op elke route', async () => {
    // Deze vier hangen aan geen enkele schakelaar en kunnen dus stil sneuvelen
    // bij een refactor van SECURITY_HEADERS. HSTS met een korte max-age zou
    // net zo stil de bescherming uithollen — vandaar de waarde erbij.
    const groups = await nextConfig.headers!()
    const root = groups.find((g) => g.source === '/:path*')
    expect(root, 'security-headers horen op álle routes te staan').toBeDefined()

    const byKey = new Map(root!.headers.map((h) => [h.key, h.value]))
    expect(byKey.get('Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains',
    )
    expect(byKey.get('X-Content-Type-Options')).toBe('nosniff')
    expect(byKey.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    // SAMEORIGIN, niet DENY: de beheer-mobielpreview rendert een same-origin
    // iframe (components/app/beheer/mobile-preview-frame.tsx).
    expect(byKey.get('X-Frame-Options')).toBe('SAMEORIGIN')
  })
})
