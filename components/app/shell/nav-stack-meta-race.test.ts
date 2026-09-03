/**
 * Regressie: NavStackMeta-titel landde op de entry van de VORIGE pagina
 * (UAT WF-REKEN-08-bug1, 2 sep 2026).
 *
 * WAT ER MISGING: /toekomst/bibliotheek → detail "Aflossen vs. beleggen" →
 * harde navigatie terug naar /toekomst/bibliotheek: de sr-only <h1> toonde nog
 * "Aflossen vs. beleggen", en sessionStorage['fintwo:nav-stacks'] droeg die
 * titel op de bibliotheek-entry zelf. Oorzaak: het meta-event droeg geen
 * afzender; de listener schreef `detail.title` blind op de top-entry. Omdat
 * React kind-effects vóór ouder-effects draait, vuurde de <NavStackMeta> van
 * de detailpagina vóórdat de pathname-watcher van de provider de nieuwe entry
 * had gepusht → de titel kwam op de nog-actieve bibliotheek-entry terecht.
 *
 * DE FIX: het event draagt `pathname` (usePathname() in NavStackMeta); de
 * listener werkt alleen de top-entry bij als die de afzender is en parkeert
 * het event anders per pathname; de watcher past geparkeerde meta toe zodra
 * hij de entry aanmaakt (push/root) of activeert (pop). Beide effect-volgordes
 * geven zo hetzelfde resultaat.
 *
 * Twee lagen: (1) de pure listener-kern + buffer, met de repro-stack;
 * (2) een bron-grendel op de bedrading (afzender-pathname op het event, de
 * watcher consumeert de buffer in alle drie scenario's).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applyNavStackMetaToStack,
  deferNavStackMeta,
  takeDeferredNavStackMeta,
  withNavStackMeta,
  type NavStackMetaDetail,
  type StackEntry,
} from './nav-stack-provider'

const BIBLIOTHEEK = '/toekomst/bibliotheek'
const DETAIL = '/toekomst/bibliotheek/9d48fcbe-8be4-49db-84fb-d4f1075c24dc'

function entry(pathname: string, title = ''): StackEntry {
  return { pathname, title, scrollY: 0, topBar: { kind: 'simple' }, bottomBar: { kind: 'hidden' } }
}

/** Precies wat de detailpagina stuurt: `<NavStackMeta title={calculator.name} bottomBar={{ kind: 'tabs' }} />`. */
const DETAIL_META: NavStackMetaDetail = {
  pathname: DETAIL,
  title: 'Aflossen vs. beleggen',
  bottomBar: { kind: 'tabs' },
  topBar: { kind: 'simple' },
}

describe('NavStackMeta vóór de push (kind-effect eerst) — WF-REKEN-08-bug1', () => {
  it('schrijft de titel van de detailpagina NIET op de bibliotheek-entry', () => {
    const stack = [entry('/toekomst'), entry(BIBLIOTHEEK)]
    const outcome = applyNavStackMetaToStack(stack, DETAIL_META)
    expect(outcome.kind).toBe('defer')
    // De stack zelf is onaangeroerd — de bibliotheek-entry houdt haar lege
    // titel (→ resolveRouteTitle: "Rekenhulp-bibliotheek").
    expect(stack[1]!.title).toBe('')
  })

  it('parkeert de meta en de watcher zet \'m op de NIEUWE entry', () => {
    deferNavStackMeta(DETAIL_META)
    // Watcher-scenario 3: push van de detail-entry.
    const deferred = takeDeferredNavStackMeta(DETAIL)
    expect(deferred).toEqual(DETAIL_META)
    const pushed = withNavStackMeta(entry(DETAIL), deferred!)
    expect(pushed.pathname).toBe(DETAIL)
    expect(pushed.title).toBe('Aflossen vs. beleggen')
    expect(pushed.bottomBar).toEqual({ kind: 'tabs' })
    // Eén keer toepasbaar: de buffer is daarna leeg.
    expect(takeDeferredNavStackMeta(DETAIL)).toBeUndefined()
  })

  it('parkeert ook bij een lege stack (allereerste pagina in een verse sessie)', () => {
    expect(applyNavStackMetaToStack([], DETAIL_META).kind).toBe('defer')
  })

  it('parkeert nooit een legacy-event zonder pathname', () => {
    const legacy: NavStackMetaDetail = { title: 'X', bottomBar: { kind: 'hidden' }, topBar: { kind: 'simple' } }
    deferNavStackMeta(legacy)
    expect(applyNavStackMetaToStack([], legacy).kind).toBe('noop')
  })
})

describe('NavStackMeta ná de push (gewone volgorde)', () => {
  it('werkt de top-entry bij wanneer die de afzender is', () => {
    const stack = [entry('/toekomst'), entry(BIBLIOTHEEK), entry(DETAIL)]
    const outcome = applyNavStackMetaToStack(stack, DETAIL_META)
    expect(outcome.kind).toBe('update')
    if (outcome.kind !== 'update') return
    expect(outcome.stack).toHaveLength(3)
    expect(outcome.stack[2]!.title).toBe('Aflossen vs. beleggen')
    expect(outcome.stack[1]!.title).toBe('')
    // scrollY/pathname van de entry blijven staan.
    expect(outcome.stack[2]!.pathname).toBe(DETAIL)
  })

  it('is een no-op bij identieke meta (geen re-render, geen sessionStorage-write)', () => {
    const stack = [entry(BIBLIOTHEEK), withNavStackMeta(entry(DETAIL), DETAIL_META)]
    expect(applyNavStackMetaToStack(stack, DETAIL_META).kind).toBe('noop')
  })

  it('houdt voor een legacy-event zonder pathname het top-entry-gedrag', () => {
    const stack = [entry(BIBLIOTHEEK), entry(DETAIL)]
    const legacy: NavStackMetaDetail = { title: 'Legacy', bottomBar: { kind: 'hidden' }, topBar: { kind: 'simple' } }
    const outcome = applyNavStackMetaToStack(stack, legacy)
    expect(outcome.kind).toBe('update')
    if (outcome.kind !== 'update') return
    expect(outcome.stack[1]!.title).toBe('Legacy')
  })
})

describe('bedrading (bron-grendel)', () => {
  const dir = join(process.cwd(), 'components', 'app', 'shell')
  const meta = readFileSync(join(dir, 'nav-stack-meta.tsx'), 'utf8')
  const provider = readFileSync(join(dir, 'nav-stack-provider.tsx'), 'utf8')

  it('NavStackMeta stuurt zijn eigen route mee als afzender', () => {
    expect(meta).toContain("import { usePathname } from 'next/navigation'")
    expect(meta).toMatch(/const pathname = usePathname\(\)/)
    expect(meta).toMatch(/pathname: pathname \?\? undefined/)
    // De pathname is een effect-dependency: een route-wissel zonder titel-
    // wissel moet opnieuw dispatchen.
    expect(meta).toMatch(/\}, \[title, configKey, pathname\]\)/)
  })

  it('de listener consumeert de pure kern en parkeert bij defer', () => {
    expect(provider).toContain('const outcome = applyNavStackMetaToStack(tabStack, scoped)')
    expect(provider).toContain('deferNavStackMeta(scoped)')
    // De oude blinde top-update is weg.
    expect(provider).not.toMatch(/const top = tabStack\[tabStack\.length - 1\]\s*\n\s*\/\/ Defensief/)
  })

  it('de watcher past geparkeerde meta toe in alle drie de scenario\'s', () => {
    const takes = provider.match(/takeDeferredNavStackMeta\(pathname\)/g) ?? []
    expect(takes, 'root-reset, pop én push horen elk de buffer te lezen').toHaveLength(3)
  })
})
