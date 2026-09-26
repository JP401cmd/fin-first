import { render } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PageStatusInfo } from '@/lib/page-status/types'
import type { BannerDisplay } from '@/lib/page-status/display'

/**
 * DOM-gelijkheid van `PageStatusBanner` vóór en na de extractie van
 * `PageStatusBannerBody` (stroom P2, fase 2 van /toekomst in drie katernen).
 *
 * De snapshots in `__snapshots__/page-status-banner.dom.test.tsx.snap` zijn
 * opgenomen tegen de banner VÓÓR de extractie (commit met alleen deze test). Na
 * de extractie moeten ze ongewijzigd groen blijven: de gerenderde DOM en classes
 * zijn identiek — een pure move. Werk ze dus nooit bij met `-u` om een diff weg
 * te poetsen; een diff hier is precies de regressie die deze test vangt.
 *
 * Dekt elke tak van de banner: leverage warn/bad, met en zonder actie, de
 * informatieve vrijheidsbanner, de vrijheidsbanner met een alarm (ADR 0129),
 * geminimaliseerd en 'none'.
 */

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const ctx: { info: PageStatusInfo | null; display: BannerDisplay | 'none' } = {
  info: null,
  display: 'none',
}
vi.mock('@/components/app/page-status-provider', () => ({
  usePageStatusContext: () => ({ ...ctx, minimize: () => {}, restore: () => {} }),
}))

import { PageStatusBanner } from './page-status-banner'

const LEVER_WARN: PageStatusInfo = {
  route: '/overzicht/schulden',
  kind: 'leverage',
  status: 'warn',
  title: 'Schulden',
  reason: 'Je schulden drukken op je vrijheid (€ 12.000).',
  remedy: 'Kijk welke schuld je het eerst aflost.',
  action: { label: 'Naar je schulden', href: '/overzicht/schulden#lijst' },
  will: { onderwerp: 'Schulden', detail: 'Je schulden drukken op je vrijheid.' },
}

const CASES: Array<[string, PageStatusInfo | null, BannerDisplay | 'none']> = [
  ['leverage warn met actie', LEVER_WARN, 'expanded'],
  ['leverage bad zonder actie', { ...LEVER_WARN, status: 'bad', action: undefined }, 'expanded'],
  [
    'vrijheid informatief',
    { ...LEVER_WARN, kind: 'freedom', status: 'good', title: 'Je rekent met stoppen op 48' },
    'expanded',
  ],
  [
    'vrijheid met alarm (warn)',
    { ...LEVER_WARN, kind: 'freedom', status: 'warn', title: 'Je rekent met stoppen op 48' },
    'expanded',
  ],
  ['geminimaliseerd', LEVER_WARN, 'minimized'],
  ['none zonder info', null, 'none'],
]

describe('PageStatusBanner — DOM is identiek aan vóór de extractie', () => {
  beforeEach(() => {
    ctx.info = null
    ctx.display = 'none'
  })

  for (const [naam, info, display] of CASES) {
    it(naam, () => {
      ctx.info = info
      ctx.display = display
      const { container } = render(<PageStatusBanner />)
      expect(container.innerHTML).toMatchSnapshot()
    })
  }
})
