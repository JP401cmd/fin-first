import { describe, it, expect } from 'vitest'
import {
  buildBriefingEmail,
  containsEuroAmount,
  stripEuroAmounts,
} from './email-template'
import type { BriefingSnapshot } from './snapshot'
import type { BriefingEntry } from '@/lib/types/briefing'

/**
 * Tests voor de briefing-e-mail-template (puur):
 *   - hero (vrijheidstijd) + headline + 2 CTA's + unsubscribe aanwezig;
 *   - GEEN eurobedragen in de default-modus (PII-harde eis), ook niet als een
 *     briefje euro's bevat (degradeert naar categorie-teaser + sluit-strip);
 *   - lege/ontbrekende snapshot → geen mail (null).
 */

const BASE = 'https://trifinity.app'
const TOKEN = 'uid.sig'

function entry(partial: Partial<BriefingEntry> & Pick<BriefingEntry, 'id' | 'category' | 'text'>): BriefingEntry {
  return partial
}

function snapshot(overrides: Partial<BriefingSnapshot> = {}): BriefingSnapshot {
  return {
    week: '2026-W28',
    lastManualRefresh: '',
    refreshedAt: '2026-07-13T06:00:00.000Z',
    entries: [
      entry({ id: 'e1', category: 'observation', text: 'Je uitgaven daalden deze week.' }),
      entry({ id: 'e2', category: 'tip', text: 'Je abonnementen kosten €48 per maand — kijk of je kunt schrappen.' }),
    ],
    freedomSnapshot: {
      totalFreedomDays: 1520,
      netWorth: 100000,
      monthlyExpenses: 2000,
      capturedAt: '2026-07-13T06:00:00.000Z',
    },
    previousFreedomSnapshot: { totalFreedomDays: 1500, capturedAt: '2026-07-06T06:00:00.000Z' },
    ...overrides,
  }
}

describe('email-template — PII-guards', () => {
  it('containsEuroAmount herkent diverse euro-vormen', () => {
    expect(containsEuroAmount('kost €48 per maand')).toBe(true)
    expect(containsEuroAmount('EUR 1.234')).toBe(true)
    expect(containsEuroAmount('1234 euro erbij')).toBe(true)
    expect(containsEuroAmount('geen bedrag hier, wel 12%')).toBe(false)
  })

  it('stripEuroAmounts verwijdert elk eurobedrag', () => {
    const out = stripEuroAmounts('Je bespaart €1.234 per jaar en EUR 50 per maand.')
    expect(out).not.toMatch(/€/)
    expect(out).not.toMatch(/EUR\s?\d/i)
  })
})

describe('buildBriefingEmail', () => {
  it('bevat hero, headline, twee CTA’s en unsubscribe', () => {
    const out = buildBriefingEmail({
      snapshot: snapshot({ headline: 'Een sterke week voor je vrijheid.' }),
      baseUrl: BASE,
      unsubscribeToken: TOKEN,
    })
    expect(out).not.toBeNull()
    const html = out!.html
    // Hero: vrijheidstijd-label (jaar/maanden), niet leeg
    expect(out!.subject).toMatch(/vrijheid/i)
    expect(html).toMatch(/jaar|maand|dag/i)
    // Headline
    expect(html).toContain('Een sterke week voor je vrijheid.')
    // Twee CTA's
    expect(html).toContain(`${BASE}/overzicht#briefing`)
    expect(html).toContain(`${BASE}/overzicht?prompt=briefing-week`)
    // Unsubscribe
    expect(html).toContain('/api/briefing/email/unsubscribe?token=')
    expect(out!.unsubscribeUrl).toContain('/api/briefing/email/unsubscribe?token=')
  })

  it('bevat GEEN eurobedragen, ook niet uit een euro-briefje', () => {
    const out = buildBriefingEmail({
      snapshot: snapshot({ headline: 'Je bespaart €1.234 dit jaar.' }),
      baseUrl: BASE,
      unsubscribeToken: TOKEN,
    })
    expect(out).not.toBeNull()
    expect(out!.html).not.toMatch(/€/)
    expect(out!.html).not.toMatch(/EUR\s?\d/i)
    expect(out!.subject).not.toMatch(/€/)
    // De euro-tip degradeert naar de neutrale categorie-teaser
    expect(out!.html).toContain('Een tip om vrijheid te winnen')
  })

  it('toont week-over-week delta in dagen (geen euro)', () => {
    const out = buildBriefingEmail({ snapshot: snapshot(), baseUrl: BASE, unsubscribeToken: TOKEN })
    // 1520 - 1500 = 20 dagen erbij
    expect(out!.html).toMatch(/20 dagen vrijheid erbij/)
  })

  it('lege snapshot (geen entries, geen freedom) → null', () => {
    const out = buildBriefingEmail({
      snapshot: snapshot({ entries: [], freedomSnapshot: undefined }),
      baseUrl: BASE,
      unsubscribeToken: TOKEN,
    })
    expect(out).toBeNull()
  })

  it('normaliseert trailing slash in baseUrl', () => {
    const out = buildBriefingEmail({ snapshot: snapshot(), baseUrl: `${BASE}/`, unsubscribeToken: TOKEN })
    expect(out!.html).toContain(`${BASE}/overzicht#briefing`)
    expect(out!.html).not.toContain(`${BASE}//overzicht`)
  })
})
