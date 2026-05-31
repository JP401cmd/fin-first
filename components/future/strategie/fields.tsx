'use client'

/**
 * Gedeelde formulier-primitives voor de strategie-bewerk-modals (AOW, Pensioen,
 * Huis). Geëxtraheerd uit housing-strategy-section.tsx zodat de drie editors er
 * identiek uitzien en er geen duplicatie ontstaat.
 */

export function TriggerButton({
  selected,
  onClick,
  title,
  subtitle,
  disabled,
}: {
  selected: boolean
  onClick: () => void
  title: string
  subtitle: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border-2 p-3 text-left transition-all ${
        selected
          ? 'border-[var(--ink)] bg-[var(--paper)]'
          : 'border-[var(--border-ed)] hover:border-[var(--border-md)]'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <span
        className={`text-sm font-semibold ${selected ? 'text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}
      >
        {title}
      </span>
      <p className="mt-1 text-[11px] text-[var(--ink-3)]">{subtitle}</p>
    </button>
  )
}

export function LabeledNumber({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
  hint,
  disabled,
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  hint?: string
  disabled?: boolean
}) {
  return (
    <div>
      <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">
        {label}
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-28 rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm font-mono text-[var(--ink)] outline-none focus:border-[var(--ink)] disabled:opacity-50"
        />
        <span className="text-sm text-[var(--ink-3)]">{unit}</span>
      </div>
      {hint && <p className="mt-1 text-[10px] text-[var(--ink-3)]">{hint}</p>}
    </div>
  )
}
