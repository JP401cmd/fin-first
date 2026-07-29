'use client'

/**
 * In-veld kaart om tijdens de Sleepmodus snel een nieuw budget te maken —
 * opent via de +-knop tussen de dropzones, of door een transactie erop te
 * droppen. Puur presentational: de kaart parseert en valideert alleen de vorm
 * van de invoer en geeft het resultaat door via `onCreate`. Geen fetch, geen
 * kennis van de reducer of van de overlay-state.
 */

import { useEffect, useRef, useState } from 'react'

import { formatCurrencyDecimals } from '@/components/app/budget-shared'

/** Wat de kaart oplevert: naam getrimd, bedrag > 0. */
export type NieuwBudgetWaarden = {
  name: string
  parentId: string | null
  monthlyAmount: number
}

type VeldFout = { veld: 'naam' | 'parent' | 'bedrag' | 'formulier'; boodschap: string }

const LABEL_CLASS =
  'mb-1 block font-[var(--font-dm-mono)] text-[9px] uppercase tracking-[0.12em] text-[var(--ink-4)]'

const VELD_CLASS =
  'w-full border border-[var(--border-md)] bg-[var(--paper)] px-2.5 py-2 text-[13px] text-[var(--ink)] ' +
  'placeholder:text-[var(--ink-4)] outline-none transition-colors duration-150 ' +
  'focus-visible:border-kern-500 focus-visible:ring-2 focus-visible:ring-kern-500/40'

export function NieuwBudgetKaart({ parents, txLabel, txAmount, onCreate, onCancel }: {
  /** Alleen bestaande hoofdbudgetten met budget_type !== 'archive'. */
  parents: { id: string; name: string }[]
  /** Tegenpartij/omschrijving van de wachtende transactie — de bol eronder is verborgen. */
  txLabel?: string
  /** Bedrag van diezelfde transactie. */
  txAmount?: number
  /** Resolve = klaar (de overlay sluit de kaart). Reject = fout: kaart blijft open en toont err.message. */
  onCreate: (v: NieuwBudgetWaarden) => Promise<void>
  onCancel: () => void
}) {
  const [naam, setNaam] = useState('')
  const [soort, setSoort] = useState<'hoofd' | 'sub'>('hoofd')
  const [parentId, setParentId] = useState('')
  const [bedrag, setBedrag] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<VeldFout | null>(null)
  const naamRef = useRef<HTMLInputElement>(null)

  // Meteen typen — de kaart opent midden in een sleepbeweging.
  useEffect(() => { naamRef.current?.focus() }, [])

  const subMogelijk = parents.length > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return

    const schoneNaam = naam.trim()
    if (!schoneNaam) {
      setError({ veld: 'naam', boodschap: 'Geef het budget een naam.' })
      naamRef.current?.focus()
      return
    }
    if (soort === 'sub' && !parentId) {
      setError({ veld: 'parent', boodschap: 'Kies onder welk hoofdbudget dit valt.' })
      return
    }
    // Duizendtalpunten eerst weg, dán de decimale komma: "1.500,00" → 1500.
    const bedragGetal = Number(bedrag.trim().replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(bedragGetal) || bedragGetal <= 0) {
      setError({ veld: 'bedrag', boodschap: 'Vul een bedrag per maand in dat groter is dan 0.' })
      return
    }

    setError(null)
    setSaving(true)
    try {
      await onCreate({
        name: schoneNaam,
        parentId: soort === 'sub' ? parentId : null,
        monthlyAmount: bedragGetal,
      })
      // Gelukt — de overlay sluit de kaart; state hoeft niet opgeruimd.
    } catch (err) {
      setError({
        veld: 'formulier',
        boodschap: err instanceof Error && err.message ? err.message : 'Het budget kon niet worden aangemaakt.',
      })
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Nieuw budget"
      className="mx-auto max-h-full w-full max-w-[320px] overflow-y-auto border border-[var(--ink)] bg-[var(--paper)] p-4 shadow-[0_10px_28px_rgba(26,25,22,0.18)]"
    >
      <p className="flex items-center gap-2 font-[var(--font-dm-mono)] text-[9px] uppercase tracking-[0.12em] text-[var(--ink-4)]">
        <span className="inline-block h-px w-5 bg-kern-600" aria-hidden="true" />
        Nieuw budget
      </p>
      <h3 className="mt-1 font-[var(--font-playfair)] text-base font-extrabold leading-snug text-[var(--ink)]">
        Maak er een <em className="font-semibold italic text-kern-700">plek</em> voor
      </h3>
      <p className="mt-0.5 font-serif text-[11px] italic leading-relaxed text-[var(--ink-2)]">
        Even aanmaken, dan gaat deze transactie er meteen heen.
      </p>
      {/* De centrale bol is tijdens het aanmaken verborgen — noem daarom hier
          om welke transactie het gaat, net als de ConfirmCard doet. */}
      {txLabel && (
        <p className="mt-1.5 flex items-baseline justify-between gap-2 border-y border-[var(--border-ed)] py-1.5">
          <span className="truncate text-[11.5px] text-[var(--ink-2)]">{txLabel}</span>
          {typeof txAmount === 'number' && (
            <span className="shrink-0 font-[var(--font-dm-mono)] text-[11.5px] tabular-nums text-[var(--ink)]">
              {txAmount > 0 ? '+' : ''}{formatCurrencyDecimals(txAmount)}
            </span>
          )}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-3">
        {/* Naam */}
        <div>
          <label htmlFor="nieuw-budget-naam" className={LABEL_CLASS}>Naam</label>
          <input
            ref={naamRef}
            id="nieuw-budget-naam"
            type="text"
            value={naam}
            onChange={(e) => { setNaam(e.target.value); if (error?.veld === 'naam') setError(null) }}
            autoComplete="off"
            aria-invalid={error?.veld === 'naam' || undefined}
            aria-describedby={error?.veld === 'naam' ? 'nieuw-budget-naam-fout' : undefined}
            className={VELD_CLASS}
          />
          {error?.veld === 'naam' && (
            <p id="nieuw-budget-naam-fout" role="alert" className="mt-1 font-serif text-[10.5px] italic text-negative">
              {error.boodschap}
            </p>
          )}
        </div>

        {/* Hoofd- of subbudget */}
        <fieldset className="mt-3 border-0 p-0">
          <legend className={LABEL_CLASS}>Soort</legend>
          <div className="flex gap-2">
            {([
              { waarde: 'hoofd' as const, label: 'Hoofdbudget', uit: false },
              { waarde: 'sub' as const, label: 'Deelbudget', uit: !subMogelijk },
            ]).map(({ waarde, label, uit }) => (
              <label
                key={waarde}
                className={[
                  'flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-1.5 border px-2 text-[11.5px]',
                  'font-serif transition-colors duration-150',
                  soort === waarde
                    ? 'border-kern-600 bg-kern-100 font-semibold text-kern-700'
                    : 'border-[var(--border-md)] bg-[var(--paper)] text-[var(--ink-2)]',
                  uit ? 'cursor-not-allowed opacity-40' : '',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="nieuw-budget-soort"
                  value={waarde}
                  checked={soort === waarde}
                  disabled={uit}
                  onChange={() => { setSoort(waarde); if (error?.veld === 'parent') setError(null) }}
                  className="h-3.5 w-3.5 accent-kern-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kern-600"
                />
                {label}
              </label>
            ))}
          </div>
          {!subMogelijk && (
            <p className="mt-1 font-serif text-[10.5px] italic text-[var(--ink-3)]">
              Er zijn nog geen hoofdbudgetten om dit onder te hangen.
            </p>
          )}
        </fieldset>

        {/* Keuze hoofdbudget — alleen bij een deelbudget */}
        {soort === 'sub' && (
          <div className="mt-3">
            <label htmlFor="nieuw-budget-parent" className={LABEL_CLASS}>Valt onder</label>
            <select
              id="nieuw-budget-parent"
              value={parentId}
              onChange={(e) => { setParentId(e.target.value); if (error?.veld === 'parent') setError(null) }}
              aria-invalid={error?.veld === 'parent' || undefined}
              aria-describedby={error?.veld === 'parent' ? 'nieuw-budget-parent-fout' : undefined}
              className={VELD_CLASS}
            >
              <option value="">Kies een hoofdbudget</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {error?.veld === 'parent' && (
              <p id="nieuw-budget-parent-fout" role="alert" className="mt-1 font-serif text-[10.5px] italic text-negative">
                {error.boodschap}
              </p>
            )}
          </div>
        )}

        {/* Maandbedrag */}
        <div className="mt-3">
          <label htmlFor="nieuw-budget-bedrag" className={LABEL_CLASS}>Bedrag per maand</label>
          <div className="flex items-center gap-1.5">
            <span aria-hidden="true" className="font-[var(--font-dm-mono)] text-[13px] text-[var(--ink-3)]">€</span>
            <input
              id="nieuw-budget-bedrag"
              type="text"
              inputMode="decimal"
              value={bedrag}
              onChange={(e) => { setBedrag(e.target.value); if (error?.veld === 'bedrag') setError(null) }}
              placeholder="0,00"
              autoComplete="off"
              aria-invalid={error?.veld === 'bedrag' || undefined}
              aria-describedby={error?.veld === 'bedrag' ? 'nieuw-budget-bedrag-fout' : undefined}
              className={`${VELD_CLASS} font-[var(--font-dm-mono)] tabular-nums`}
            />
          </div>
          {error?.veld === 'bedrag' && (
            <p id="nieuw-budget-bedrag-fout" role="alert" className="mt-1 font-serif text-[10.5px] italic text-negative">
              {error.boodschap}
            </p>
          )}
        </div>

        {/* Fout uit onCreate — de ingevulde waarden blijven staan. */}
        {error?.veld === 'formulier' && (
          <p role="alert" className="mt-3 border-l-2 border-negative bg-[var(--subtle)] px-2 py-1.5 font-serif text-[11px] italic leading-relaxed text-negative">
            {error.boodschap}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="mb-1.5 mt-4 block min-h-[44px] w-full border border-[var(--ink)] bg-[var(--ink)] px-3 py-2 text-center font-serif text-[11.5px] font-semibold text-[var(--paper)] transition-opacity duration-150 disabled:opacity-50"
        >
          {saving ? 'Bezig met aanmaken…' : 'Aanmaken en toewijzen'}
        </button>
        {/* Ook tijdens het opslaan uit: annuleren midden in de lopende write is
            dubbelzinnig (het budget wordt dan wél aangemaakt). De overlay houdt
            Escape als uitweg open en onderdrukt daarna de toewijzing. */}
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="block min-h-[44px] w-full border border-[var(--ink)] bg-[var(--paper)] px-3 py-2 text-center font-serif text-[11.5px] font-semibold text-[var(--ink)] transition-opacity duration-150 disabled:opacity-50"
        >
          Annuleren
        </button>
      </form>
    </div>
  )
}
