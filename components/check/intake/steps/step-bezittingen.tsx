'use client'

import { useState, useCallback } from 'react'
import { Plus, Trash2, Landmark } from 'lucide-react'
import type { CheckDraft } from '@/lib/check/use-check-draft'
import type { CheckIntakeAsset } from '@/lib/check/types'
import { formatCurrency } from '@/lib/format'
import { parseBedrag } from '@/lib/check/use-check-draft'
import { useId } from 'react'
import { primaryBtn, backBtn, inlineAddBtn, inputBase } from '../intake-styles'

interface Props {
  intake: CheckDraft['intake']
  onChange: (patch: Partial<CheckDraft['intake']>) => void
  onNext: () => void
  onBack: () => void
}

type AssetPreset = {
  assetType: string
  label: string
  hint: string
  placeholder: string
}

const ASSET_PRESETS: AssetPreset[] = [
  { assetType: 'savings', label: 'Spaargeld', hint: 'Spaarrekening, deposito', placeholder: '25.000' },
  { assetType: 'investment', label: 'Beleggingen', hint: 'Aandelen, ETF, fondsen', placeholder: '50.000' },
  { assetType: 'eigen_huis', label: 'Eigen woning', hint: 'WOZ-waarde of geschatte marktwaarde', placeholder: '350.000' },
  { assetType: 'retirement', label: 'Pensioen', hint: 'Opgebouwde waarde bij pensioenfonds', placeholder: '80.000' },
  { assetType: 'crypto', label: "Crypto", hint: 'Bitcoin, Ethereum, etc.', placeholder: '5.000' },
  { assetType: 'real_estate', label: 'Vastgoed', hint: 'Tweede woning, verhuurpand', placeholder: '200.000' },
  { assetType: 'other', label: 'Overig', hint: 'Bedrijfsaandelen, auto, kunst, …', placeholder: '10.000' },
]

/** Groei-assets krijgen een optioneel verwacht-rendement-veld (analoog aan rente op schulden). */
const GROWTH_ASSET_TYPES = new Set(['investment', 'crypto', 'retirement', 'real_estate'])

interface AssetRowFormProps {
  preset: AssetPreset
  onAdd: (asset: CheckIntakeAsset) => void
}

function AssetRowForm({ preset, onAdd }: AssetRowFormProps) {
  const [raw, setRaw] = useState('')
  const [rawLabel, setRawLabel] = useState('')
  const [rawReturn, setRawReturn] = useState('')
  const [open, setOpen] = useState(false)
  const id = useId()
  const isGrowth = GROWTH_ASSET_TYPES.has(preset.assetType)

  function handleAdd() {
    const val = parseBedrag(raw)
    if (val <= 0) return
    const ret = isGrowth ? parseBedrag(rawReturn) : 0
    onAdd({
      assetType: preset.assetType,
      name: rawLabel.trim() || preset.label,
      value: val,
      extra: rawLabel.trim() || null,
      expectedReturnPct: isGrowth && ret > 0 ? ret : null,
    })
    setRaw('')
    setRawLabel('')
    setRawReturn('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 border border-dashed border-[var(--border-ed)] px-4 py-3 text-left text-sm text-[var(--ink-2)] transition-colors hover:border-kern-400 hover:bg-kern-50/50"
      >
        <Plus className="h-4 w-4 shrink-0 text-[var(--ink-meta)]" aria-hidden="true" />
        <span className="font-display font-medium">{preset.label}</span>
        <span className="font-serif text-xs italic text-[var(--ink-3)]">{preset.hint}</span>
      </button>
    )
  }

  return (
    <div className="border border-kern-300 bg-kern-50/30 px-4 py-3 space-y-2">
      <p className="font-display text-sm font-semibold text-[var(--ink)]">{preset.label}</p>
      {/* Label (optioneel — om duplicaten te onderscheiden, bv. ASN vs Bunq) */}
      <input
        type="text"
        value={rawLabel}
        onChange={(e) => setRawLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleAdd()
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder={`Naam (optioneel) — bijv. ${preset.label} bij ASN`}
        aria-label={`Naam voor ${preset.label}`}
        className={`${inputBase('kern')} px-3 py-2 font-serif text-sm`}
      />
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-[var(--ink-meta)]">
            &euro;
          </span>
          <input
            id={id}
            type="text"
            inputMode="decimal"
            value={raw}
            autoFocus
            onChange={(e) => setRaw(e.target.value.replace(/[^0-9.,]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') setOpen(false)
            }}
            placeholder={preset.placeholder}
            aria-label={`Waarde ${preset.label}`}
            className={`${inputBase('kern')} py-2 pr-3 pl-7 font-mono text-sm tabular-nums`}
          />
        </div>
        {/* Verwacht rendement — alleen voor groei-assets */}
        {isGrowth && (
          <div className="relative w-24 shrink-0">
            <input
              type="text"
              inputMode="decimal"
              value={rawReturn}
              onChange={(e) => setRawReturn(e.target.value.replace(/[^0-9.,]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd()
                if (e.key === 'Escape') setOpen(false)
              }}
              placeholder="% rdmt."
              aria-label={`Verwacht jaarrendement ${preset.label} in procent (optioneel)`}
              className={`${inputBase('kern')} px-2 py-2 pr-6 font-mono text-sm tabular-nums`}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-xs text-[var(--ink-meta)]">
              %
            </span>
          </div>
        )}
        <button type="button" onClick={handleAdd} className={inlineAddBtn('kern')}>
          Toevoegen
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 px-2 py-2 text-xs text-[var(--ink-3)] hover:text-[var(--ink)]"
          aria-label="Annuleren"
        >
          &times;
        </button>
      </div>
      {isGrowth && (
        <p className="font-serif text-xs italic text-[var(--ink-3)]">
          Verwacht jaarrendement is optioneel — leeg laten gebruikt je algemene rendement uit de pensioenstap.
        </p>
      )}
    </div>
  )
}

export function StepBezittingen({ intake, onChange, onNext, onBack }: Props) {
  const assets = intake.assets ?? []
  const total = assets.reduce((s, a) => s + a.value, 0)

  const handleAdd = useCallback(
    (asset: CheckIntakeAsset) => {
      onChange({ assets: [...assets, asset] })
    },
    [assets, onChange],
  )

  const handleRemove = useCallback(
    (idx: number) => {
      onChange({ assets: assets.filter((_, i) => i !== idx) })
    },
    [assets, onChange],
  )

  return (
    <div className="space-y-4">
      <p className="font-serif text-sm italic text-[var(--ink-3)]">
        Voeg toe wat je hebt — schat gerust. Vul niets in als het niet van toepassing is;
        je kunt alles in de app later uitbreiden.
      </p>

      {/* Lijst bestaande bezittingen */}
      {assets.length > 0 && (
        <ul className="space-y-1" aria-label="Toegevoegde bezittingen">
          {assets.map((a, idx) => (
            <li
              key={idx}
              className="flex items-center justify-between border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 shrink-0 text-kern-500" aria-hidden="true" />
                <span className="font-serif text-sm text-[var(--ink)]">{a.name}</span>
                {typeof a.expectedReturnPct === 'number' && a.expectedReturnPct > 0 && (
                  <span className="font-mono text-xs tabular-nums text-[var(--ink-3)]">
                    {new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(a.expectedReturnPct)}%
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm tabular-nums text-[var(--ink-2)]">
                  {formatCurrency(a.value)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  aria-label={`Verwijder ${a.name}`}
                  className="text-[var(--ink-meta)] transition-colors hover:text-negative"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
          <li className="flex justify-between border-t border-[var(--border-ed)] px-3 pt-2">
            <span className="font-serif text-xs italic text-[var(--ink-3)]">Totaal bezittingen</span>
            <span className="font-mono text-sm font-medium tabular-nums text-[var(--ink)]">
              {formatCurrency(total)}
            </span>
          </li>
        </ul>
      )}

      {/* Voeg-toe rijen — elk type mag meerdere keren (onderscheid via naam) */}
      <div className="space-y-2">
        {ASSET_PRESETS.map((preset) => (
          <AssetRowForm key={preset.assetType} preset={preset} onAdd={handleAdd} />
        ))}
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <button type="button" onClick={onNext} className={primaryBtn('kern')}>
          {assets.length === 0 ? 'Overslaan (geen bezittingen)' : 'Verder'}
        </button>
        <button type="button" onClick={onBack} className={backBtn}>
          Terug
        </button>
      </div>
    </div>
  )
}
