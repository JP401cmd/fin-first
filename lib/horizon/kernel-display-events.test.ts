import { describe, it, expect } from 'vitest'
import type { LifeEvent } from '@/lib/horizon-data'
import type { KernelHousingSale } from '@/lib/horizon-kernel/bridge'
import {
  applyKernelHousingSaleToEvents,
  isVirtualHousingSaleEvent,
} from './kernel-display-events'

/**
 * FIX 1 — de tijdlijn-marker "Verkoop … 89j" toont op de kernel-tak de v2-waarheid
 * i.p.v. de kernel-waarheid. Deze suite bewijst dat het stale server-virtuele
 * verkoop-event (89j) wordt vervangen door het kernel-afgeleide event (58j), terwijl
 * de opeethypotheek-virtuele en de echte gebruikers-events ongemoeid blijven.
 */

function makeEvent(over: Partial<LifeEvent> & Pick<LifeEvent, 'id'>): LifeEvent {
  return {
    name: 'Event',
    event_type: 'anders',
    target_age: 50,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: 0,
    duration_months: 0,
    icon: 'Calendar',
    is_active: true,
    sort_order: 0,
    is_indexed: false,
    ...over,
  }
}

// Server-virtueel verkoop-event op de v2-basis (on_depletion → ~89j).
const serverSale = makeEvent({
  id: 'housing-strategy:downsize',
  name: 'Verkoop eigen woning',
  event_type: 'verkoop_eigen_woning',
  target_age: 89,
  icon: 'Home',
  metadata: { source: 'housing-strategy', strategy: 'downsize', saleProceeds: 111_111 },
})
// Server-virtueel opeethypotheek-event — GEEN verkoop, moet blijven staan.
const serverReverse = makeEvent({
  id: 'housing-strategy:reverse-mortgage-payout',
  name: 'Opeethypotheek-uitkering',
  event_type: 'opeethypotheek',
  target_age: 70,
})
// Echt gebruikers-event — nooit aanraken.
const realEvent = makeEvent({ id: 'user-1', name: 'Wereldreis', event_type: 'anders', target_age: 45 })

const KERNEL_SALE: KernelHousingSale = { month: 699, age: 58.25, proceeds: 222_222 }

describe('isVirtualHousingSaleEvent', () => {
  it('herkent alleen het virtuele VERKOOP-event, niet opeethypotheek of echte events', () => {
    expect(isVirtualHousingSaleEvent(serverSale)).toBe(true)
    expect(isVirtualHousingSaleEvent(serverReverse)).toBe(false)
    expect(isVirtualHousingSaleEvent(realEvent)).toBe(false)
  })
})

describe('applyKernelHousingSaleToEvents — kernel-tak met verkoop', () => {
  const out = applyKernelHousingSaleToEvents([realEvent, serverSale, serverReverse], KERNEL_SALE)

  it('het stale 89j-verkoop-event is weg', () => {
    expect(out.some((e) => e.event_type === 'verkoop_eigen_woning' && e.target_age === 89)).toBe(false)
  })

  it('er staat één kernel-afgeleid verkoop-event op 58,25j', () => {
    const sales = out.filter((e) => e.event_type === 'verkoop_eigen_woning')
    expect(sales).toHaveLength(1)
    expect(sales[0].target_age).toBe(58.25)
  })

  it('opeethypotheek- en echte gebruikers-events blijven ongemoeid', () => {
    expect(out.find((e) => e.id === 'housing-strategy:reverse-mortgage-payout')).toEqual(serverReverse)
    expect(out.find((e) => e.id === 'user-1')).toEqual(realEvent)
  })
})

describe('applyKernelHousingSaleToEvents — geen verkoop', () => {
  it('kernelHousingSale null → virtuele verkoop-events gestript, geen verkoop-marker', () => {
    const out = applyKernelHousingSaleToEvents([realEvent, serverSale, serverReverse], null)
    expect(out.some((e) => e.event_type === 'verkoop_eigen_woning')).toBe(false)
    expect(out.find((e) => e.id === 'user-1')).toEqual(realEvent)
    expect(out.find((e) => e.id === 'housing-strategy:reverse-mortgage-payout')).toEqual(serverReverse)
  })

  it('zonder virtueel verkoop-event en zonder kernel-verkoop → identiek', () => {
    const out = applyKernelHousingSaleToEvents([realEvent, serverReverse], null)
    expect(out).toEqual([realEvent, serverReverse])
  })
})
