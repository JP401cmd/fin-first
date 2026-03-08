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
  expiry_date: string
  beneficiary: string
  kvk_number: string
  ownership_percentage: string
  annual_dividend: string
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
  expiry_date: '',
  beneficiary: '',
  kvk_number: '',
  ownership_percentage: '',
  annual_dividend: '',
}

const ALL_TYPES: AssetType[] = ['savings', 'investment', 'retirement', 'eigen_huis', 'real_estate', 'crypto', 'vehicle', 'physical', 'deelneming', 'levensverzekering', 'vordering', 'other']

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
      expiry_date: '',
      beneficiary: '',
      kvk_number: '',
      ownership_percentage: '',
      annual_dividend: '',
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
        <div key={i} className="flex items-center justify-between rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--ink)]">{item.name}</p>
            <p className="text-xs text-[var(--ink-3)]">
              {ASSET_TYPE_LABELS[item.asset_type]} &middot; &euro;{Number(item.current_value).toLocaleString('nl-NL')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => openEdit(i)} className="text-xs font-medium text-wil-600 hover:text-wil-800">Bewerk</button>
            <button onClick={() => remove(i)} className="text-xs text-red-500 hover:text-red-700">Verwijder</button>
          </div>
        </div>
      ))}

      {/* Add button */}
      <button
        onClick={openNew}
        className="flex w-full min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--border-ed)] py-2 text-xs font-medium text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)] active:bg-[var(--subtle)]"
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
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[var(--paper)] p-4 shadow-xl sm:p-6 [&_input]:text-base [&_input]:sm:text-sm [&_select]:text-base [&_select]:sm:text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-semibold text-[var(--ink)]">
              {editingIndex === -1 ? 'Bezitting toevoegen' : 'Bezitting bewerken'}
            </h3>

            <div className="space-y-3">
              {/* Type */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Type</label>
                <select
                  value={draft.asset_type}
                  onChange={(e) => handleTypeChange(e.target.value as AssetType)}
                  className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                >
                  {ALL_TYPES.map((t) => (
                    <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>

              {/* Name */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Naam</label>
                <input
                  type="text"
                  placeholder="Bijv. Spaarrekening ING"
                  value={draft.name}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                  className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                />
              </div>

              {/* Subtype */}
              {visibleFields.includes('subtype') && subtypeLabels && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Subtype</label>
                  <select
                    value={draft.subtype}
                    onChange={(e) => handleSubtypeChange(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
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
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                  {draft.asset_type === 'eigen_huis' ? 'Marktwaarde' : draft.asset_type === 'levensverzekering' ? 'Afkoopwaarde' : draft.asset_type === 'deelneming' ? 'Intrinsieke waarde' : draft.asset_type === 'vordering' ? 'Uitstaand bedrag' : 'Huidige waarde'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]">&euro;</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step={100}
                    min={0}
                    value={draft.current_value}
                    onChange={(e) => updateDraft({ current_value: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] py-2 pr-3 pl-7 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                  />
                </div>
              </div>

              {/* Purchase value */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                  {draft.asset_type === 'eigen_huis' ? 'Aankoopprijs' : draft.asset_type === 'vordering' ? 'Oorspronkelijke hoofdsom' : 'Aankoopwaarde'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]">&euro;</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step={100}
                    min={0}
                    value={draft.purchase_value}
                    onChange={(e) => updateDraft({ purchase_value: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] py-2 pr-3 pl-7 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                  />
                </div>
              </div>

              {/* Expected return */}
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">{draft.asset_type === 'vordering' ? 'Rentepercentage (% per jaar)' : 'Verwacht rendement (% per jaar)'}</label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    step={0.1}
                    value={draft.expected_return}
                    onChange={(e) => updateDraft({ expected_return: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 pr-8 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]">%</span>
                </div>
              </div>

              {/* Monthly contribution (hidden for eigen_huis) */}
              {draft.asset_type !== 'eigen_huis' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                    {draft.asset_type === 'levensverzekering' ? 'Maandelijkse premie' : draft.asset_type === 'vordering' ? 'Maandelijkse aflossing' : 'Maandelijkse inleg'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]">&euro;</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step={10}
                      min={0}
                      value={draft.monthly_contribution}
                      onChange={(e) => updateDraft({ monthly_contribution: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] py-2 pr-3 pl-7 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                    />
                  </div>
                </div>
              )}

              {/* Institution (hidden for eigen_huis, shown as 'Naam vennootschap' for deelneming) */}
              {draft.asset_type !== 'eigen_huis' && !visibleFields.includes('institution') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                    {draft.asset_type === 'levensverzekering' ? 'Verzekeraar' : 'Instelling'}
                  </label>
                  <input
                    type="text"
                    placeholder={draft.asset_type === 'levensverzekering' ? 'Bijv. Nationale-Nederlanden, Aegon' : 'Bijv. ING, DEGIRO, ABP'}
                    value={draft.institution}
                    onChange={(e) => updateDraft({ institution: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                  />
                </div>
              )}

              {/* ── Type-specific fields ──────────────── */}

              {/* Risk profile */}
              {visibleFields.includes('risk_profile') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Risicoprofiel</label>
                  <select
                    value={draft.risk_profile}
                    onChange={(e) => updateDraft({ risk_profile: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
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
                <label className="flex items-center gap-2 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={draft.tax_benefit}
                    onChange={(e) => updateDraft({ tax_benefit: e.target.checked })}
                    className="h-4 w-4 rounded border-[var(--border-ed)] text-wil-600 focus:ring-wil-500"
                  />
                  <span className="text-sm text-[var(--ink-2)]">Fiscaal voordeel</span>
                </label>
              )}

              {/* Is liquid */}
              {visibleFields.includes('is_liquid') && (
                <label className="flex items-center gap-2 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={draft.is_liquid}
                    onChange={(e) => updateDraft({ is_liquid: e.target.checked })}
                    className="h-4 w-4 rounded border-[var(--border-ed)] text-wil-600 focus:ring-wil-500"
                  />
                  <span className="text-sm text-[var(--ink-2)]">Vrij opneembaar</span>
                </label>
              )}

              {/* Lock end date */}
              {visibleFields.includes('lock_end_date') && (draft.asset_type === 'vordering' || !draft.is_liquid) && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">{draft.asset_type === 'vordering' ? 'Einddatum lening' : 'Einddatum vastperiode'}</label>
                  <input
                    type="date"
                    value={draft.lock_end_date}
                    onChange={(e) => updateDraft({ lock_end_date: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                  />
                </div>
              )}

              {/* Ticker symbol */}
              {visibleFields.includes('ticker_symbol') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Ticker / symbool</label>
                  <input
                    type="text"
                    placeholder="Bijv. VWRL, IWDA, BTC"
                    value={draft.ticker_symbol}
                    onChange={(e) => updateDraft({ ticker_symbol: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                  />
                </div>
              )}

              {/* Retirement provider */}
              {visibleFields.includes('retirement_provider_type') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Type pensioenuitvoerder</label>
                  <select
                    value={draft.retirement_provider_type}
                    onChange={(e) => updateDraft({ retirement_provider_type: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
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
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">WOZ-waarde</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]">&euro;</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step={1000}
                      min={0}
                      value={draft.woz_value}
                      onChange={(e) => updateDraft({ woz_value: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] py-2 pr-3 pl-7 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                    />
                  </div>
                </div>
              )}

              {/* Address (eigen_huis) */}
              {visibleFields.includes('address_postcode') && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Postcode</label>
                    <input
                      type="text"
                      placeholder="1234AB"
                      value={draft.address_postcode}
                      onChange={(e) => updateDraft({ address_postcode: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Huisnummer</label>
                    <input
                      type="text"
                      placeholder="12a"
                      value={draft.address_house_number}
                      onChange={(e) => updateDraft({ address_house_number: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                    />
                  </div>
                </div>
              )}

              {/* Rental income */}
              {visibleFields.includes('rental_income') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Huurinkomsten (per maand)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]">&euro;</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step={50}
                      min={0}
                      value={draft.rental_income}
                      onChange={(e) => updateDraft({ rental_income: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] py-2 pr-3 pl-7 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                    />
                  </div>
                </div>
              )}

              {/* Depreciation rate */}
              {visibleFields.includes('depreciation_rate') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Afschrijving (% per jaar)</label>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      step={0.5}
                      min={0}
                      value={draft.depreciation_rate}
                      onChange={(e) => updateDraft({ depreciation_rate: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 pr-8 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]">%</span>
                  </div>
                </div>
              )}

              {/* Expiry date (levensverzekering) */}
              {visibleFields.includes('expiry_date') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Einddatum polis</label>
                  <input
                    type="date"
                    value={draft.expiry_date}
                    onChange={(e) => updateDraft({ expiry_date: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                  />
                </div>
              )}

              {/* Beneficiary (levensverzekering) */}
              {visibleFields.includes('beneficiary') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Begunstigde</label>
                  <input
                    type="text"
                    placeholder="Bijv. partner, kinderen"
                    value={draft.beneficiary}
                    onChange={(e) => updateDraft({ beneficiary: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                  />
                </div>
              )}

              {/* Institution — shown with custom label for deelneming/vordering */}
              {visibleFields.includes('institution') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">{draft.asset_type === 'vordering' ? 'Debiteur / Tegenpartij' : 'Naam vennootschap'}</label>
                  <input
                    type="text"
                    placeholder={draft.asset_type === 'vordering' ? 'Bijv. Jan Jansen, Mijn BV' : 'Bijv. Holding BV, Familie BV'}
                    value={draft.institution}
                    onChange={(e) => updateDraft({ institution: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                  />
                </div>
              )}

              {/* KvK-nummer (deelneming) */}
              {visibleFields.includes('kvk_number') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">KvK-nummer</label>
                  <input
                    type="text"
                    placeholder="Bijv. 12345678"
                    value={draft.kvk_number}
                    onChange={(e) => updateDraft({ kvk_number: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                  />
                </div>
              )}

              {/* Ownership percentage (deelneming) */}
              {visibleFields.includes('ownership_percentage') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Belang (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      step={1}
                      min={0}
                      max={100}
                      placeholder="100"
                      value={draft.ownership_percentage}
                      onChange={(e) => updateDraft({ ownership_percentage: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 pr-8 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]">%</span>
                  </div>
                </div>
              )}

              {/* Annual dividend (deelneming) */}
              {visibleFields.includes('annual_dividend') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Jaarlijks dividend</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]">&euro;</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step={100}
                      min={0}
                      value={draft.annual_dividend}
                      onChange={(e) => updateDraft({ annual_dividend: e.target.value })}
                      className="w-full rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] py-2 pr-3 pl-7 text-sm text-[var(--ink)] outline-none focus:border-wil-500 focus:ring-1 focus:ring-wil-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setEditingIndex(null)}
                className="flex-1 min-h-[44px] rounded-xl border border-[var(--border-ed)] px-4 py-2.5 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] active:bg-[var(--subtle)]"
              >
                Annuleer
              </button>
              <button
                onClick={save}
                disabled={!draft.name || !draft.current_value}
                className="flex-1 min-h-[44px] rounded-xl bg-wil-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wil-700 active:bg-wil-800 disabled:opacity-40"
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
