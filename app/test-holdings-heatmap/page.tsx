'use client'

import { useState } from 'react'
import HoldingsHeatmap, { type HeatmapHolding } from '@/components/app/holdings-heatmap'

// Mock holdings data for visual testing
const MOCK_HOLDINGS: HeatmapHolding[] = [
  {
    id: '1', name: 'Vanguard FTSE All-World', ticker: 'VWRL', isin: 'IE00B3RBWM25',
    units: 150, avg_purchase_price: 95, current_price: 112,
    last_price_update: new Date().toISOString(), currency: 'EUR',
    daily_change_percent: 0.85, asset_class: 'aandelen', sector: 'breed', geography: 'wereld',
  },
  {
    id: '2', name: 'iShares Core MSCI Europe', ticker: 'IMAE', isin: 'IE00B4K48X80',
    units: 80, avg_purchase_price: 52, current_price: 58,
    last_price_update: new Date().toISOString(), currency: 'EUR',
    daily_change_percent: -0.42, asset_class: 'aandelen', sector: 'breed', geography: 'europa',
  },
  {
    id: '3', name: 'iShares MSCI EM', ticker: 'IEMA', isin: 'IE00B4L5YC18',
    units: 200, avg_purchase_price: 30, current_price: 28,
    last_price_update: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), currency: 'USD',
    daily_change_percent: -2.1, asset_class: 'aandelen', sector: 'breed', geography: 'opkomend',
  },
  {
    id: '4', name: 'iShares EUR Corp Bond', ticker: 'IEAC', isin: 'IE00B3F81R35',
    units: 100, avg_purchase_price: 122, current_price: 119,
    last_price_update: new Date().toISOString(), currency: 'EUR',
    daily_change_percent: 0.12, asset_class: 'obligaties', sector: 'anders', geography: 'europa',
  },
  {
    id: '5', name: 'VanEck Global Real Estate', ticker: 'TRET', isin: 'NL0009690239',
    units: 50, avg_purchase_price: 28, current_price: 31,
    last_price_update: new Date().toISOString(), currency: 'EUR',
    daily_change_percent: 1.3, asset_class: 'vastgoed', sector: 'vastgoed', geography: 'wereld',
  },
  {
    id: '6', name: 'Bitcoin Tracker', ticker: 'BTC', isin: null,
    units: 0.5, avg_purchase_price: 35000, current_price: 42000,
    last_price_update: new Date().toISOString(), currency: 'USD',
    daily_change_percent: 3.5, asset_class: 'crypto', sector: 'anders', geography: 'anders',
  },
  {
    id: '7', name: 'SPDR S&P 500', ticker: 'SPY5', isin: 'IE00B6YX5C33',
    units: 40, avg_purchase_price: 380, current_price: 410,
    last_price_update: new Date().toISOString(), currency: 'EUR',
    daily_change_percent: 0.65, asset_class: 'aandelen', sector: 'breed', geography: 'noord_amerika',
  },
  {
    id: '8', name: 'iShares Asia Pacific Dividend', ticker: 'IAPD', isin: 'IE00B14X4T88',
    units: 120, avg_purchase_price: 20, current_price: 22,
    last_price_update: new Date().toISOString(), currency: 'EUR',
    daily_change_percent: -0.8, asset_class: 'aandelen', sector: 'breed', geography: 'azie',
  },
  {
    id: '9', name: 'Handmatig vastgoed', ticker: null, isin: null,
    units: 1, avg_purchase_price: 250000, current_price: null,
    last_price_update: null, currency: 'EUR',
    daily_change_percent: null, asset_class: 'vastgoed', sector: 'anders', geography: 'nederland',
  },
  {
    id: '10', name: 'ASML Holding', ticker: 'ASML', isin: 'NL0010273215',
    units: 5, avg_purchase_price: 580, current_price: 720,
    last_price_update: new Date().toISOString(), currency: 'EUR',
    daily_change_percent: 2.1, asset_class: 'aandelen', sector: 'technologie', geography: 'nederland',
  },
  {
    id: '11', name: 'Shell plc', ticker: 'SHEL', isin: 'GB00BP6MXD84',
    units: 30, avg_purchase_price: 28, current_price: 32,
    last_price_update: new Date().toISOString(), currency: 'EUR',
    daily_change_percent: -1.5, asset_class: 'aandelen', sector: 'energie', geography: 'europa',
  },
  {
    id: '12', name: 'Goud ETC', ticker: 'SGLD', isin: 'JE00B588CD74',
    units: 15, avg_purchase_price: 160, current_price: 185,
    last_price_update: new Date().toISOString(), currency: 'EUR',
    daily_change_percent: 0.3, asset_class: 'grondstoffen', sector: 'anders', geography: 'anders',
  },
]

const MOCK_DIVIDENDS = new Map<string, number>([
  ['1', 1.8], // VWRL
  ['2', 2.5], // IMAE
  ['4', 3.1], // IEAC
  ['5', 4.2], // TRET
  ['8', 5.5], // IAPD
  ['10', 0.4], // ASML
  ['11', 3.8], // Shell
])

export default function TestHoldingsHeatmap() {
  const [clickedId, setClickedId] = useState<string | null>(null)

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <h1 className="text-xl font-bold text-[var(--ink)]">Holdings Heatmap — Visual Test</h1>
      <p className="text-sm text-[var(--ink-3)]">
        12 mock holdings met diverse classificaties, rendementen en edge cases (geen koers, stale prijs, niet-EUR valuta).
      </p>

      {clickedId && (
        <div className="rounded-lg border border-kern-200 bg-kern-50 p-3 text-sm text-kern-700">
          Geklikte holding ID: <code className="font-mono">{clickedId}</code>
          <button
            onClick={() => setClickedId(null)}
            className="ml-3 text-xs underline"
          >
            Reset
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
        <HoldingsHeatmap
          holdings={MOCK_HOLDINGS}
          dividendData={MOCK_DIVIDENDS}
          onHoldingClick={(id) => setClickedId(id)}
        />
      </div>
    </div>
  )
}
