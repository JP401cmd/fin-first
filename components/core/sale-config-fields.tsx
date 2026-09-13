'use client'

/**
 * Verkoopinstelling van één niet-liquide bezitting (`assets.sale_config`) — de velden.
 *
 * Gecontroleerd component zonder eigen opslag: de host houdt het concept
 * (`SaleConfigDraft`) vast en bouwt bij opslaan de config met `draftToSaleConfig`. Twee
 * hosts, één body (TPR-15): het bezittingenformulier (slaat op met de hele rij) en stap 4
 * van de plan-review (slaat op via `PATCH /api/assets/[id]/sale-config`).
 *
 * Horizon-context (dit voedt de toekomstprognose), dus horizon-accenten.
 */

import { useId, type ReactNode } from 'react'
import type { SaleStand } from '@/lib/sale-config'
import type { SaleConfigDraft } from '@/lib/sale-config-draft'

const STAND_OPTIES: readonly { stand: SaleStand; title: string; desc: string }[] = [
  {
    stand: 'wanneer_nodig',
    title: 'Automatisch bij behoefte',
    desc: 'Verkoop pas zodra je liquide middelen tekortschieten.',
  },
  {
    stand: 'vast_moment',
    title: 'Op een vast moment',
    desc: 'Verkoop op een vaste leeftijd of datum.',
  },
  {
    stand: 'niet_verkopen',
    title: 'Niet verkopen',
    desc: 'Dit bezit blijft staan in de prognose.',
  },
]

export function SaleConfigFields({
  draft,
  onChange,
  activeDebts,
  children,
}: {
  draft: SaleConfigDraft
  onChange: (next: SaleConfigDraft) => void
  /** Eigen actieve schulden voor "Aflossen bij verkoop"; leeg = de keuze verschijnt niet. */
  activeDebts: readonly { id: string; name: string }[]
  /** Optionele regel onder de intro (bv. de vrijheidstijd van de waarde). */
  children?: ReactNode
}) {
  const uid = useId()
  const legendId = `${uid}-sale-config-legend`
  const set = (patch: Partial<SaleConfigDraft>) => onChange({ ...draft, ...patch })

  return (
    <div className="space-y-3 rounded-[var(--r)] border border-horizon-100 bg-horizon-50/30 p-3">
      <div>
        <p id={legendId} className="text-xs font-semibold uppercase text-horizon-700/60">Verkoopstrategie in prognose</p>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">
          Bepaal hoe je toekomstprognose dit bezit behandelt: wel of niet verkopen, en wanneer.
        </p>
      </div>

      {children}

      {/* Drie-weg keuze — verticale radio-cards (375px-proof). */}
      <div role="radiogroup" aria-labelledby={legendId} className="space-y-2">
        {STAND_OPTIES.map((opt) => {
          const active = draft.stand === opt.stand
          return (
            <label
              key={opt.stand}
              className={`flex cursor-pointer items-start gap-3 rounded-[var(--r)] border p-3 transition-colors ${
                active
                  ? 'border-horizon-400 bg-horizon-50'
                  : 'border-[var(--border-ed)] bg-[var(--paper)] hover:bg-[var(--subtle)]'
              }`}
            >
              <input
                type="radio"
                name={`${uid}-sale-stand`}
                value={opt.stand}
                aria-label={opt.title}
                checked={active}
                onChange={() => set({ stand: opt.stand })}
                className="mt-0.5 shrink-0 accent-horizon-600"
              />
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${active ? 'text-horizon-800' : 'text-[var(--ink)]'}`}>
                  {opt.title}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--ink-3)]">{opt.desc}</span>
              </span>
            </label>
          )
        })}
      </div>

      {/* Conditionele velden per stand. */}
      {draft.stand === 'wanneer_nodig' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
            Uiterlijke leeftijd <span className="text-[var(--ink-4)]">(optioneel)</span>
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={draft.triggerAge}
            onChange={(e) => set({ triggerAge: e.target.value })}
            placeholder="Bijv. 75"
            className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[10px] text-[var(--ink-4)]">
            Laat leeg om alleen bij een tekort te verkopen. Vul in om uiterlijk op deze leeftijd te verkopen, ook zonder tekort.
          </p>
        </div>
      )}

      {draft.stand === 'vast_moment' && (
        <div className="space-y-3">
          {/* Leeftijd of datum — één van beide. */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => set({ momentMode: 'leeftijd' })}
              className={`flex-1 rounded-[var(--r)] border px-3 py-2.5 text-xs font-medium transition-colors ${
                draft.momentMode === 'leeftijd'
                  ? 'border-horizon-400 bg-horizon-50 text-horizon-800'
                  : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:bg-[var(--subtle)]'
              }`}
            >
              Op leeftijd
            </button>
            <button
              type="button"
              onClick={() => set({ momentMode: 'datum' })}
              className={`flex-1 rounded-[var(--r)] border px-3 py-2.5 text-xs font-medium transition-colors ${
                draft.momentMode === 'datum'
                  ? 'border-horizon-400 bg-horizon-50 text-horizon-800'
                  : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:bg-[var(--subtle)]'
              }`}
            >
              Op datum
            </button>
          </div>
          {draft.momentMode === 'leeftijd' ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Leeftijd</label>
              <input
                type="number"
                inputMode="numeric"
                value={draft.triggerAge}
                onChange={(e) => set({ triggerAge: e.target.value })}
                placeholder="Bijv. 67"
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
              />
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Datum</label>
              <input
                type="date"
                value={draft.triggerDate}
                onChange={(e) => set({ triggerDate: e.target.value })}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>
      )}

      {/* Gedeelde optionele velden bij 'vast_moment' en 'wanneer_nodig'. */}
      {draft.stand !== 'niet_verkopen' && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
              Verkoopkosten % <span className="text-[var(--ink-4)]">(optioneel)</span>
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="100"
              inputMode="decimal"
              value={draft.costsPct}
              onChange={(e) => set({ costsPct: e.target.value })}
              placeholder="Bijv. 6"
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[10px] text-[var(--ink-4)]">
              Kosten die van de opbrengst afgaan (makelaar, overdracht). Leeg = standaard voor dit type.
            </p>
          </div>

          {activeDebts.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                Aflossen bij verkoop <span className="text-[var(--ink-4)]">(optioneel)</span>
              </label>
              <p className="mb-2 text-[10px] text-[var(--ink-4)]">
                Kies welke schulden je met de opbrengst aflost.
              </p>
              <div className="space-y-1.5">
                {activeDebts.map((d) => {
                  const checked = draft.payoffDebtIds.includes(d.id)
                  return (
                    <label
                      key={d.id}
                      className="flex cursor-pointer items-center gap-2 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          set({
                            payoffDebtIds: e.target.checked
                              ? [...draft.payoffDebtIds, d.id]
                              : draft.payoffDebtIds.filter((id) => id !== d.id),
                          })
                        }
                        className="border-[var(--border-md)] accent-horizon-600"
                      />
                      <span className="min-w-0 truncate">{d.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
