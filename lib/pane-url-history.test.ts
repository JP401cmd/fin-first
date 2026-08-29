import { describe, it, expect } from 'vitest'
import { createPaneUrlHistory, type PaneRouter } from './pane-url-history'

/**
 * B-012 — URL-gedreven pane (bv. budget-detail via `?budget=<id>`) en de
 * mobiele terugknop.
 *
 * Given een pane waarvan de open-state uit de URL-query komt,
 * When de gebruiker hem opent vanaf gesloten toestand,
 * Then hoort er precies ÉÉN history-entry bij (open = push), zodat de
 *   Android-/browser-terugknop de pane sluit en op de pagina blijft — niet
 *   wegnavigeert naar de vorige route. Sluiten via X consumeert diezelfde
 *   entry (back), en een deeplink (geen eigen entry) valt terug op replace.
 */
function makeRouter() {
  const calls: string[] = []
  const router: PaneRouter = {
    push: (href) => calls.push(`push:${href}`),
    replace: (href) => calls.push(`replace:${href}`),
    back: () => calls.push('back'),
  }
  return { router, calls }
}

describe('createPaneUrlHistory (B-012)', () => {
  it('open vanaf gesloten = push; sluiten via X consumeert de entry met back', () => {
    const { router, calls } = makeRouter()
    const h = createPaneUrlHistory(router)
    h.open('/p?budget=a', false)
    h.close('/p')
    expect(calls).toEqual(['push:/p?budget=a', 'back'])
  })

  it('wissel binnen een open pane = replace (één entry per pane-sessie)', () => {
    const { router, calls } = makeRouter()
    const h = createPaneUrlHistory(router)
    h.open('/p?budget=a', false)
    h.open('/p?budget=b', true)
    h.close('/p')
    expect(calls).toEqual(['push:/p?budget=a', 'replace:/p?budget=b', 'back'])
  })

  it('dubbeltik vanaf gesloten pusht maar één entry (tweede tik = replace)', () => {
    const { router, calls } = makeRouter()
    const h = createPaneUrlHistory(router)
    // useSearchParams commit pas ná de transitie: de tweede tik ziet nog
    // alreadyOpen=false. Zonder guard → twee entries → X sluit niet in één keer.
    h.open('/p?budget=a', false)
    h.open('/p?budget=a', false)
    h.close('/p')
    expect(calls).toEqual(['push:/p?budget=a', 'replace:/p?budget=a', 'back'])
  })

  it('deeplink (geen eigen entry) sluit via replace-fallback, nooit back', () => {
    const { router, calls } = makeRouter()
    const h = createPaneUrlHistory(router)
    h.close('/p')
    expect(calls).toEqual(['replace:/p'])
  })

  it('na sluiting door de terugknop zelf (reset) is de entry al geconsumeerd — close valt terug op replace', () => {
    const { router, calls } = makeRouter()
    const h = createPaneUrlHistory(router)
    h.open('/p?budget=a', false)
    h.reset() // popstate sloot de pane al: entry is weg
    h.close('/p')
    expect(calls).toEqual(['push:/p?budget=a', 'replace:/p'])
  })
})
