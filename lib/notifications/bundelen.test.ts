/**
 * Bundeling van gelijksoortige meldingen (bevinding H16, fix B).
 */

import { describe, it, expect } from 'vitest'
import { bundleNotifications, BUNDLE_MIN_ITEMS, type NotificationRow } from './bundelen'
import type { Notification, NotificationType } from '@/app/api/notifications/route'

function melding(
  id: string,
  type: NotificationType,
  overrides: Partial<Notification> = {},
): Notification {
  return {
    id,
    type,
    priority: 2,
    title: `Melding ${id}`,
    description: '',
    icon: 'AlertTriangle',
    color: 'amber',
    createdAt: '2026-08-26T10:00:00.000Z',
    read: false,
    ...overrides,
  }
}

function bundles(rows: NotificationRow[]) {
  return rows.filter((r): r is Extract<NotificationRow, { kind: 'bundle' }> => r.kind === 'bundle')
}

describe('bundleNotifications', () => {
  it('laat een lege lijst leeg', () => {
    expect(bundleNotifications([])).toEqual([])
  })

  it('bundelt niet onder de drempel', () => {
    const items = Array.from({ length: BUNDLE_MIN_ITEMS - 1 }, (_, i) => melding(`b${i}`, 'budget'))
    const rows = bundleNotifications(items)
    expect(rows).toHaveLength(BUNDLE_MIN_ITEMS - 1)
    expect(bundles(rows)).toHaveLength(0)
  })

  it('bundelt vanaf de drempel tot één regel', () => {
    const items = Array.from({ length: BUNDLE_MIN_ITEMS }, (_, i) => melding(`b${i}`, 'budget'))
    const rows = bundleNotifications(items)
    expect(rows).toHaveLength(1)
    expect(bundles(rows)[0].items).toHaveLength(BUNDLE_MIN_ITEMS)
  })

  it('vouwt de gemeten reproductie (6 budgetmeldingen) tot één regel met één Vraag Fin', () => {
    const items = [
      melding('budget_1', 'budget', { title: 'Huur / hypotheek: limiet bereikt', priority: 3 }),
      melding('budget_2', 'budget', { title: 'Verzekeringen: limiet bereikt', priority: 3 }),
      melding('budget_3', 'budget', { title: 'Gemeentelijke lasten: limiet bereikt', priority: 3 }),
      melding('budget_4', 'budget', { title: 'Kinderen & school: limiet bereikt', priority: 3 }),
      melding('budget_5', 'budget', { title: 'Brandstof: 104% — over budget', priority: 1 }),
      melding('budget_6', 'budget', { title: 'Auto vaste lasten: limiet bereikt', priority: 3 }),
    ]
    const rows = bundleNotifications(items)
    expect(rows).toHaveLength(1)

    const bundle = bundles(rows)[0]
    expect(bundle.title).toBe('6 budgetten vragen aandacht')
    expect(bundle.unread).toBe(6)
    // De zwaarste melding voert de samenvatting aan, niet de eerste in de lijst.
    expect(bundle.description).toBe('Brandstof: 104% — over budget — en 5 andere')
    // Eén chat-context voor de hele groep, met alle titels erin.
    expect(bundle.aiContext).toContain('Brandstof: 104% — over budget')
    expect(bundle.aiContext).toContain('Huur / hypotheek: limiet bereikt')
  })

  it('bundelt per soort en houdt de volgorde van eerste verschijning aan', () => {
    const items = [
      melding('s1', 'sync'),
      melding('b1', 'budget'),
      melding('b2', 'budget'),
      melding('p1', 'partner_transaction'),
      melding('b3', 'budget'),
      melding('p2', 'partner_transaction'),
      melding('p3', 'partner_transaction'),
    ]
    const rows = bundleNotifications(items)
    // sync (1×, los) · budget-bundel op de plek van b1 · partner-bundel op p1
    expect(rows.map((r) => r.key)).toEqual(['s1', 'bundle_budget', 'bundle_partner_transaction'])
    expect(bundles(rows).map((b) => b.items.length)).toEqual([3, 3])
  })

  it('geeft een bundel een stabiele sleutel, ook als de samenstelling wisselt', () => {
    const drie = bundleNotifications([
      melding('b1', 'budget'),
      melding('b2', 'budget'),
      melding('b3', 'budget'),
    ])
    const vier = bundleNotifications([
      melding('b1', 'budget'),
      melding('b2', 'budget'),
      melding('b3', 'budget'),
      melding('b4', 'budget'),
    ])
    expect(drie[0].key).toBe(vier[0].key)
  })

  it('markeert een groep met een ongelezen priority-1-melding als urgent (klapt open)', () => {
    const zonder = bundleNotifications([
      melding('b1', 'budget', { priority: 3 }),
      melding('b2', 'budget', { priority: 3 }),
      melding('b3', 'budget', { priority: 2 }),
    ])
    expect(bundles(zonder)[0].hasUrgent).toBe(false)

    const met = bundleNotifications([
      melding('b1', 'budget', { priority: 3 }),
      melding('b2', 'budget', { priority: 1 }),
      melding('b3', 'budget', { priority: 3 }),
    ])
    expect(bundles(met)[0].hasUrgent).toBe(true)
  })

  it('telt een gelezen priority-1-melding niet als escalatie', () => {
    const rows = bundleNotifications([
      melding('b1', 'budget', { priority: 1, read: true }),
      melding('b2', 'budget', { priority: 3 }),
      melding('b3', 'budget', { priority: 3 }),
    ])
    const bundle = bundles(rows)[0]
    expect(bundle.hasUrgent).toBe(false)
    expect(bundle.unread).toBe(2)
  })

  it('topt de chat-context af bij veel meldingen (partner_transaction tot 50 rijen)', () => {
    const items = Array.from({ length: 50 }, (_, i) =>
      melding(`p${i}`, 'partner_transaction', { title: `Uitgave ${i}` }),
    )
    const bundle = bundles(bundleNotifications(items))[0]
    expect(bundle.title).toBe('50 uitgaven van je partner')
    expect(bundle.aiContext).toContain('en nog 40 vergelijkbare meldingen')
    expect(bundle.aiContext.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(11)
  })

  it('valt terug op een neutraal label bij een onbekend (legacy) type', () => {
    const items = Array.from({ length: 3 }, (_, i) =>
      melding(`x${i}`, 'streak' as unknown as NotificationType),
    )
    expect(bundles(bundleNotifications(items))[0].title).toBe('3 meldingen')
  })
})
