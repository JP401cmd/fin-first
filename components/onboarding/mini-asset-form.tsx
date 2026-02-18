'use client'

import { useState } from 'react'
import {
  ASSET_TYPE_LABELS,
  ASSET_TYPE_FIELDS,
  ASSET_SUBTYPE_LABELS,
  ASSET_SUBTYPE_DEFAULTS,
  RISK_PROFILE_LABELS,
  RETIREMENT_PROVIDER_LABELS,
  TYPICAL_RETURNS,
  type AssetType,
  type RiskProfile,
  type RetirementProviderType,
} from '@/lib/asset-data'

export interface AssetEntry {
  name: string
  asset_type: AssetType
  current_value: string
  purchase_value: string
  expected_return: string
  monthly_contribution: string
  institution: string
  // Type-specific
  subtype: string
  risk_profile: string
  tax_benefit: boolean
  is_liquid: boolean
  lock_end_date: string
  ticker_symbol: string
  rental_income: string
  woz_value: string
  retirement_provider_type: string
  depreciation_rate: string
  address_postcode: string
  address_house_number: string
}

const EMPTY: AssetEntry = {
  name: '',
  asset_type: 'savings',
  current_value: '',
  purchase_value: '',
  expected_return: '',
  monthly_contribution: '',
  institution: '',
  subtype: '',
  risk_profile: '',
  tax_benefit: false,
  is_liquid: true,
  lock_end_date: '',
  ticker_symbol: '',
  rental_income: '',
  woz_value: '',
  retirement_provider_type: '',
  depreciation_rate: '',
  address_postcode: '',
  address_house_number: '',
}

const ALL_TYPES: AssetType[] = ['savings', 'investment', 'retirement', 'eigen_huis', 'real_estate', 'crypto', 'vehicle', 'physical', 'other']

export function MiniAssetForm({
  items,
  onChange,
}: {
  items: AssetEntry[]
  onChange: (items: AssetEntry[]) => void
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [draft, setDraft] = useState<AssetEntry>({ ...EMPTY })

  function openNew() {
    setDraft({ ...EMPTY })
    setEditingIndex(-1) // -1 = new item
  }

  function openEdit(i: number) {
    setDraft({ ...items[i] })
    setEditingIndex(i)
  }

  function save() {
    if (!draft.name || !draft.current_value) return
    if (editingIndex === -1) {
      onChange([...items, { ...draft }])
    } else if (editingIndex !== null) {
      onChange(items.map((item, idx) => (idx === editingIndex ? { ...draft } : item)))
    }
    setEditingIndex(null)
  }

  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i))
  }

  function updateDraft(patch: Partial<AssetEntry>) {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  function handleTypeChange(asset_type: AssetType) {
    const defaults = TYPICAL_RETURNS[asset_type]
    updateDraft({
      asset_type,
      subtype: '',
      risk_profile: '',
      tax_benefit: false,
      is_liquid: asset_type === 'savings',
      lock_end_date: '',
      ticker_symbol: '',
      rental_income: '',
      woz_value: '',
      retirement_provider_type: '',
      depreciation_rate: asset_type === 'vehicle' ? '15' : '',
      address_postcode: '',
      address_house_number: '',
      expected_return: defaults ? String(defaults) : '',
      monthly_contribution: asset_type === 'eigen_huis' ? '0' : draft.monthly_contribution,
    })
  }

  function handleSubtypeChange(subtype: string) {
    const defaults = ASSET_SUBTYPE_DEFAULTS[subtype]
    updateDraft({
      subtype,
      ...(defaults?.risk_profile ? { risk_profile: defaults.risk_profile } : {}),
      ...(defaults?.is_liquid !== undefined ? { is_liquid: defaults.is_liquid } : {}),
      ...(defaults?.tax_benefit !== undefined ? { tax_benefit: defaults.tax_benefit } : {}),
      ...(defaults?.expected_return !== undefined ? { expected_return: String(defaults.expected_return) } : {}),
    })
  }

  const visibleFields = editingIndex !== null ? ASSET_TYPE_FIELDS[draft.asset_type] : []
  const subtypeLabels = editingIndex !== null ? ASSET_SUBTYPE_LABELS[draft.asset_type] : undefined

  return (
    <div className="space-y-3">
      {/* Summary cards */}
      {items.map((item, i) => (
        <div key={i} className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-900">{item.name}</p>
            <p className="text-xs text-zinc-500">
              {ASSET_TYPE_LABELS[item.asset_type]} &middot; &euro;{Number(item.current_value).toLocaleString('nl-NL')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => openEdit(i)} className="text-xs font-medium text-teal-600 hover:text-teal-800">Bewerk</button>
            <button onClick={() => remove(i)} className="text-xs text-red-500 hover:text-red-700">Verwijder</button>
          </div>
        </div>
      ))}

      {/* Add button */}
      <button
        onClick={openNew}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-300 py-2 text-xs font-medium text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Bezitting toevoegen
      </button>

      {/* Modal */}
      {editingIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setEditingIndex(null)}>
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-semibold text-zinc-900">
              {editingIndex === -1 ? 'Bezitting toevoegen' : 'Bezitting bewerken'}
            </h3>

            <div className="space-y-3">
              {/* Type */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Type</label>
                <select
                  value={draft.asset_type}
                  onChange={(e) => handleTypeChange(e.target.value as AssetType)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                >
                  {ALL_TYPES.map((t) => (
                    <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>

              {/* Name */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Naam</label>
                <input
                  type="text"
                  placeholder="Bijv. Spaarrekening ING"
                  value={draft.name}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                />
              </div>

              {/* Subtype */}
              {visibleFields.includes('subtype') && subtypeLabels && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Subtype</label>
                  <select
                    value={draft.subtype}
                    onChange={(e) => handleSubtypeChange(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                  >
                    <option value="">— Kies subtype —</option>
                    {Object.entries(subtypeLabels).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Current value */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  {draft.asset_type === 'eigen_huis' ? 'Marktwaarde' : 'Huidige waarde'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">&euro;</span>
                  <input
                    type="number"
                    step={100}
                    min={0}
                    value={draft.current_value}
                    onChange={(e) => updateDraft({ current_value: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 bg-white py-2 pr-3 pl-7 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                  />
                </div>
              </div>

              {/* Purchase value */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  {draft.asset_type === 'eigen_huis' ? 'Aankoopprijs' : 'Aankoopwaarde'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">&euro;</span>
                  <input
                    type="number"
                    step={100}
                    min={0}
                    value={draft.purchase_value}
                    onChange={(e) => updateDraft({ purchase_value: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 bg-white py-2 pr-3 pl-7 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                  />
                </div>
              </div>

              {/* Expected return */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Verwacht rendement (% per jaar)</label>
                <div className="relative">
                  <input
                    type="number"
                    step={0.1}
                    value={draft.expected_return}
                    onChange={(e) => updateDraft({ expected_return: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 pr-8 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">%</span>
                </div>
              </div>

              {/* Monthly contribution (hidden for eigen_huis) */}
              {draft.asset_type !== 'eigen_huis' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Maandelijkse inleg</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">&euro;</span>
                    <input
                      type="number"
                      step={10}
                      min={0}
                      value={draft.monthly_contribution}
                      onChange={(e) => updateDraft({ monthly_contribution: e.target.value })}
                      className="w-full rounded-lg border border-zinc-300 bg-white py-2 pr-3 pl-7 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                    />
                  </div>
                </div>
              )}

              {/* Institution (hidden for eigen_huis) */}
              {draft.asset_type !== 'eigen_huis' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Instelling</label>
                  <input
                    type="text"
                    placeholder="Bijv. ING, DEGIRO, ABP"
                    value={draft.institution}
                    onChange={(e) => updateDraft({ institution: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                  />
                </div>
              )}

              {/* ── Type-specific fields ──────────────── */}

              {/* Risk profile */}
              {visibleFields.includes('risk_profile') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Risicoprofiel</label>
                  <select
                    value={draft.risk_profile}
                    onChange={(e) => updateDraft({ risk_profile: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                  >
                    <option value="">— Kies —</option>
                    {Object.entries(RISK_PROFILE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Tax benefit */}
              {visibleFields.includes('tax_benefit') && (
                <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={draft.tax_benefit}
                    onChange={(e) => updateDraft({ tax_benefit: e.target.checked })}
                    className="h-4 w-4 rounded border-zinc-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-zinc-700">Fiscaal voordeel</span>
                </label>
              )}

              {/* Is liquid */}
              {visibleFields.includes('is_liquid') && (
                <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={draft.is_liquid}
                    onChange={(e) => updateDraft({ is_liquid: e.target.checked })}
                    className="h-4 w-4 rounded border-zinc-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-zinc-700">Vrij opneembaar</span>
                </label>
              )}

              {/* Lock end date */}
              {visibleFields.includes('lock_end_date') && !draft.is_liquid && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Einddatum vastperiode</label>
                  <input
                    type="date"
                    value={draft.lock_end_date}
                    onChange={(e) => updateDraft({ lock_end_date: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                  />
                </div>
              )}

              {/* Ticker symbol */}
              {visibleFields.includes('ticker_symbol') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Ticker / symbool</label>
                  <input
                    type="text"
                    placeholder="Bijv. VWRL, IWDA, BTC"
                    value={draft.ticker_symbol}
                    onChange={(e) => updateDraft({ ticker_symbol: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                  />
                </div>
              )}

              {/* Retirement provider */}
              {visibleFields.includes('retirement_provider_type') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Type pensioenuitvoerder</label>
                  <select
                    value={draft.retirement_provider_type}
                    onChange={(e) => updateDraft({ retirement_provider_type: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                  >
                    <option value="">— Kies —</option>
                    {Object.entries(RETIREMENT_PROVIDER_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* WOZ value */}
              {visibleFields.includes('woz_value') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">WOZ-waarde</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">&euro;</span>
                    <input
                      type="number"
                      step={1000}
                      min={0}
                      value={draft.woz_value}
                      onChange={(e) => updateDraft({ woz_value: e.target.value })}
                      className="w-full rounded-lg border border-zinc-300 bg-white py-2 pr-3 pl-7 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                    />
                  </div>
                </div>
              )}

              {/* Address (eigen_huis) */}
              {visibleFields.includes('address_postcode') && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Postcode</label>
                    <input
                      type="text"
                      placeholder="1234AB"
                      value={draft.address_postcode}
                      onChange={(e) => updateDraft({ address_postcode: e.target.value })}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Huisnummer</label>
                    <input
                      type="text"
                      placeholder="12a"
                      value={draft.address_house_number}
                      onChange={(e) => updateDraft({ address_house_number: e.target.value })}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                    />
                  </div>
                </div>
              )}

              {/* Rental income */}
              {visibleFields.includes('rental_income') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Huurinkomsten (per maand)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">&euro;</span>
                    <input
                      type="number"
                      step={50}
                      min={0}
                      value={draft.rental_income}
                      onChange={(e) => updateDraft({ rental_income: e.target.value })}
                      className="w-full rounded-lg border border-zinc-300 bg-white py-2 pr-3 pl-7 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                    />
                  </div>
                </div>
              )}

              {/* Depreciation rate */}
              {visibleFields.includes('depreciation_rate') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Afschrijving (% per jaar)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      value={draft.depreciation_rate}
                      onChange={(e) => updateDraft({ depreciation_rate: e.target.value })}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 pr-8 text-sm text-zinc-900 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">%</span>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setEditingIndex(null)}
                className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Annuleer
              </button>
              <button
                onClick={save}
                disabled={!draft.name || !draft.current_value}
                className="flex-1 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-40"
              >
                {editingIndex === -1 ? 'Toevoegen' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
