'use client'

import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { APP_SETUP_SLUGS } from '@/lib/app-setup-status'
import type { AppSetupConfig, AppSetupSectionRenderProps } from '../types'

// ── State ────────────────────────────────────────────────────

type ReportingFrequency = 'monthly' | 'quarterly' | 'yearly'

interface VerhuurrendementState {
  selectedAssetIds: string[]
  reportingFrequency: ReportingFrequency | null
  acknowledgedTracking: boolean
}

// ── Sectie 1 — Object-selector ──────────────────────────────

interface RealEstateRow {
  id: string
  name: string
  current_value: number
  rental_income: number | null
}

function ObjectSelector({
  state,
  setState,
}: AppSetupSectionRenderProps<VerhuurrendementState>) {
  const [rows, setRows] = useState<RealEstateRow[] | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let aborted = false
    void (async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('assets')
          .select('id, name, current_value, rental_income')
          .eq('asset_type', 'real_estate')
          .eq('is_active', true)
          .order('current_value', { ascending: false })
        if (aborted) return
        if (error) throw error
        setRows((data ?? []) as RealEstateRow[])
      } catch (err) {
        if (aborted) return
        setErrorMsg(err instanceof Error ? err.message : 'Kon objecten niet laden')
      }
    })()
    return () => {
      aborted = true
    }
  }, [])

  if (errorMsg) {
    return (
      <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {errorMsg}
      </p>
    )
  }
  if (rows === null) {
    return <SkeletonRows rows={1} />
  }
  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-4 py-5">
        <p className="font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
          Je hebt nog geen verhuurd vastgoed geregistreerd. Voeg een real-estate-object toe via{' '}
          <a
            href="/core/assets/real_estate"
            className="underline decoration-[var(--ink-3)] underline-offset-2 hover:decoration-[var(--ink)]"
          >
            Bezittingen
          </a>{' '}
          voordat je de app instelt.
        </p>
      </div>
    )
  }

  function toggle(id: string) {
    setState((prev) => {
      const has = prev.selectedAssetIds.includes(id)
      return {
        ...prev,
        selectedAssetIds: has
          ? prev.selectedAssetIds.filter((x) => x !== id)
          : [...prev.selectedAssetIds, id],
      }
    })
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const selected = state.selectedAssetIds.includes(row.id)
        return (
          <li key={row.id}>
            <label
              className={`flex min-h-11 cursor-pointer items-center gap-3 border px-3 py-2 transition-colors ${
                selected
                  ? 'border-[var(--ink)] bg-[var(--paper)]'
                  : 'border-[var(--border-ed)] bg-[var(--paper)] hover:bg-[var(--subtle)]/40'
              }`}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => toggle(row.id)}
                className="h-4 w-4 accent-[var(--ink)]"
              />
              <Building2 className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
              <span className="flex-1 text-sm text-[var(--ink)]">{row.name}</span>
              <span className="font-mono tabular-nums text-[12px] text-[var(--ink-3)]">
                € {Math.round(row.current_value).toLocaleString('nl-NL')}
                {row.rental_income != null && row.rental_income > 0 && (
                  <> · € {Math.round(row.rental_income).toLocaleString('nl-NL')}/mnd</>
                )}
              </span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

// ── Sectie 2 — Rapportage-frequentie ────────────────────────

function ReportingFrequencyPicker({
  state,
  setState,
}: AppSetupSectionRenderProps<VerhuurrendementState>) {
  const options: { id: ReportingFrequency; title: string; description: string }[] = [
    {
      id: 'monthly',
      title: 'Maandelijks',
      description: 'Cashflow elke maand checken — passend bij actieve verhuurders met meerdere objecten.',
    },
    {
      id: 'quarterly',
      title: 'Per kwartaal',
      description: 'Voldoende ritme voor lange-termijn-monitoring zonder dagelijks gedoe.',
    },
    {
      id: 'yearly',
      title: 'Jaarlijks',
      description: 'Eénmaal per jaar grondig terugkijken — ideaal voor passieve, stabiele huurinkomsten.',
    },
  ]
  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const selected = state.reportingFrequency === opt.id
        return (
          <button
            type="button"
            key={opt.id}
            onClick={() =>
              setState((prev) => ({ ...prev, reportingFrequency: opt.id }))
            }
            className={`flex w-full items-start gap-3 border px-4 py-3 text-left transition-colors ${
              selected
                ? 'border-[var(--ink)] bg-[var(--paper)]'
                : 'border-[var(--border-ed)] bg-[var(--paper)] hover:bg-[var(--subtle)]/40'
            }`}
          >
            <span
              aria-hidden="true"
              className={`mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                selected
                  ? 'border-[var(--ink)] bg-[var(--ink)]'
                  : 'border-[var(--border-md)] bg-[var(--paper)]'
              }`}
            >
              {selected && <span className="h-1.5 w-1.5 rounded-full bg-[var(--paper)]" />}
            </span>
            <div className="flex-1">
              <h4 className="font-serif text-sm font-semibold text-[var(--ink)]">{opt.title}</h4>
              <p className="mt-0.5 font-serif italic text-[12px] leading-snug text-[var(--ink-2)]">
                {opt.description}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Sectie 3 — Uitleg mutaties ──────────────────────────────

function TrackingExplainer({
  state,
  setState,
}: AppSetupSectionRenderProps<VerhuurrendementState>) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card
          title="Huur, kosten, leegstand"
          copy="Log maandelijkse huur, onderhoudskosten en leegstandsperiodes. De app rekent ROI, cashflow en bezettings-graad."
        />
        <Card
          title="Box 3 vergelijking"
          copy="We vergelijken forfaitair vs werkelijk rendement zodat je weet welk regime in welk jaar gunstiger uitvalt."
        />
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2">
        <input
          type="checkbox"
          checked={state.acknowledgedTracking}
          onChange={() =>
            setState((prev) => ({
              ...prev,
              acknowledgedTracking: !prev.acknowledgedTracking,
            }))
          }
          className="h-4 w-4 accent-[var(--ink)]"
        />
        <span className="text-sm text-[var(--ink-2)]">
          Ik snap hoe ik de cashflow en kosten bijhoud.
        </span>
      </label>
    </div>
  )
}

function Card({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-3">
      <h4 className="font-serif text-sm font-semibold text-[var(--ink)]">{title}</h4>
      <p className="mt-1 font-serif italic text-[12px] leading-snug text-[var(--ink-2)]">{copy}</p>
    </div>
  )
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-11 animate-pulse border border-[var(--border-ed)] bg-[var(--subtle)]/40"
        />
      ))}
    </div>
  )
}

// ── Config ──────────────────────────────────────────────────

export const verhuurrendementSetupConfig: AppSetupConfig<VerhuurrendementState> = {
  appKey: 'verhuurrendement',
  featureSlug: APP_SETUP_SLUGS.verhuurrendement,
  kicker: 'Eenmalige setup',
  title: 'Stel Verhuurrendement in',
  intro:
    'Twee keuzes om verhuurrendement nuttig te maken: welke panden je volgt en hoe vaak je terugkijkt op de cashflow.',
  initialState: () => ({
    selectedAssetIds: [],
    reportingFrequency: null,
    acknowledgedTracking: false,
  }),
  sections: [
    {
      id: 'objects',
      kicker: '1. Objecten',
      title: 'Welke panden verhuur je?',
      hint: 'Selecteer alleen panden waarop daadwerkelijk huur binnenkomt.',
      render: ObjectSelector,
    },
    {
      id: 'frequency',
      kicker: '2. Ritme',
      title: 'Hoe vaak kijk je terug?',
      render: ReportingFrequencyPicker,
    },
    {
      id: 'tracking',
      kicker: '3. Mutaties',
      title: 'Wat we tracken',
      render: TrackingExplainer,
    },
  ],
  validate: (state) => {
    if (state.selectedAssetIds.length === 0) {
      return { ok: false, reason: 'Kies minstens één pand.' }
    }
    if (state.reportingFrequency === null) {
      return { ok: false, reason: 'Kies hoe vaak je terugkijkt.' }
    }
    if (!state.acknowledgedTracking) {
      return { ok: false, reason: 'Bevestig dat je weet hoe mutaties worden bijgehouden.' }
    }
    return { ok: true }
  },
  endpoint: '/api/verhuurrendement/setup',
  buildPayload: (state) => ({
    selectedAssetIds: state.selectedAssetIds,
    reportingFrequency: state.reportingFrequency,
  }),
}
