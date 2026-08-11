import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
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
  it('/core/cash redirect naar de canonieke cashflow-landing', async () => {
    const rules = await rulesFor('/core/cash')
    expect(rules).toHaveLength(1)
    expect(rules[0].destination).toBe('/overzicht/cashflow')
    // Bewust tijdelijk (307), niet permanent (308): browsers cachen een 308
    // agressief, en deze migratie moet omkeerbaar blijven.
    expect(rules[0].permanent).toBe(false)
  })

  it('/horizon/whatif houdt beide takken van de oude server-component', async () => {
    const rules = await rulesFor('/horizon/whatif')
    expect(rules).toHaveLength(2)

    // De dreamgate-variant MOET eerst staan: Next pakt de eerste match, dus met
    // de catch-all vooraan zou ?via=dreamgate nooit de volledige what-if-
    // ervaring bereiken.
    const [dreamgate, fallback] = rules
    expect(dreamgate.has).toEqual([{ type: 'query', key: 'via', value: 'dreamgate' }])
    expect(dreamgate.destination).toBe('/toekomst/whatif?via=dreamgate')

    expect(fallback.has).toBeUndefined()
    expect(fallback.destination).toBe('/toekomst?whatif=open')
  })

  it('/horizon/strategie en /horizon/uitgaven-na-pensioen landen op de /toekomst-panes', async () => {
    for (const [source, destination] of [
      ['/horizon/strategie', '/toekomst?strategie=open'],
      ['/horizon/uitgaven-na-pensioen', '/toekomst?uitgaven=open'],
      ['/toekomst/uitgaven-na-pensioen', '/toekomst?uitgaven=open'],
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

    // Zelfde volgorde-eis als bij /horizon/whatif: de gerichte variant eerst,
    // anders vangt de catch-all elke ?focus= af en landt alles op `aow`.
    const [gericht, fallback] = rules
    expect(gericht.has).toEqual([
      { type: 'query', key: 'focus', value: '(?<focus>aow|pensioen|huis)' },
    ])
    expect(gericht.destination).toBe('/toekomst/gebeurtenissen?strategie=:focus')

    expect(fallback.has).toBeUndefined()
    expect(fallback.destination).toBe('/toekomst/gebeurtenissen?strategie=aow')
  })

  it('geen page.tsx meer op de zes routes — anders is de runtime-redirect terug', () => {
    // Een `page.tsx` hier zou opnieuw een React-boom bouwen die zichzelf
    // meteen wegredirect: precies de trigger die deze fix wegnam.
    for (const route of [
      'app/(app)/core/cash/page.tsx',
      'app/(app)/horizon/whatif/page.tsx',
      'app/(app)/horizon/strategie/page.tsx',
      'app/(app)/horizon/uitgaven-na-pensioen/page.tsx',
      'app/(app)/toekomst/strategie/page.tsx',
      'app/(app)/toekomst/uitgaven-na-pensioen/page.tsx',
    ]) {
      expect(existsSync(path.join(process.cwd(), route)), `${route} hoort niet te bestaan`).toBe(
        false,
      )
    }
  })

  it('de redirect-doelen zijn zelf geen redirect-only route (geen keten)', () => {
    // /toekomst/whatif en /toekomst renderen echte pagina's; zou een doel zelf
    // een runtime-redirect zijn, dan was de trigger alleen verplaatst.
    for (const target of [
      'app/(app)/toekomst/whatif/page.tsx',
      'app/(app)/toekomst/page.tsx',
      'app/(app)/toekomst/gebeurtenissen/page.tsx',
    ]) {
      expect(existsSync(path.join(process.cwd(), target))).toBe(true)
    }
  })
})
