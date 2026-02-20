'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ReportConfig } from '@/lib/report-data'
import { FileText, Trash2, Eye, ChevronRight } from 'lucide-react'

type PeriodType = 'month' | 'quarter' | 'year'

const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: 'month', label: 'Maand' },
  { value: 'quarter', label: 'Kwartaal' },
  { value: 'year', label: 'Jaar' },
]

function getMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  const now = new Date()
  const months = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December']

  // Last 24 months
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    options.push({ value, label: `${months[d.getMonth()]} ${d.getFullYear()}` })
  }
  return options
}

function getQuarterOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  const now = new Date()
  const currentQ = Math.floor(now.getMonth() / 3)

  for (let i = 0; i < 8; i++) {
    const totalQ = currentQ - i
    const year = now.getFullYear() + Math.floor(totalQ / 4)
    const q = ((totalQ % 4) + 4) % 4
    const monthStart = q * 3
    const value = `${year}-Q${q + 1}`
    const label = `Q${q + 1} ${year}`
    options.push({ value: `${year}-${String(monthStart + 1).padStart(2, '0')}`, label })
  }
  return options
}

function getYearOptions(): { value: string; label: string }[] {
  const now = new Date()
  const options: { value: string; label: string }[] = []
  for (let y = now.getFullYear(); y >= now.getFullYear() - 5; y--) {
    options.push({ value: String(y), label: String(y) })
  }
  return options
}

function computeDateRange(periodType: PeriodType, selection: string): { from: string; to: string; name: string } {
  if (periodType === 'month') {
    const [year, month] = selection.split('-').map(Number)
    const from = `${year}-${String(month).padStart(2, '0')}-01`
    const toDate = new Date(year, month, 1)
    const to = toDate.toISOString().split('T')[0]
    const months = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December']
    return { from, to, name: `${months[month - 1]} ${year}` }
  }

  if (periodType === 'quarter') {
    const [year, monthStr] = selection.split('-').map(Number)
    const q = Math.floor((monthStr - 1) / 3) + 1
    const from = `${year}-${String(monthStr).padStart(2, '0')}-01`
    const toMonth = monthStr + 3
    const toYear = toMonth > 12 ? year + 1 : year
    const toM = toMonth > 12 ? toMonth - 12 : toMonth
    const to = `${toYear}-${String(toM).padStart(2, '0')}-01`
    return { from, to, name: `Q${q} ${year}` }
  }

  // year
  const year = parseInt(selection, 10)
  return { from: `${year}-01-01`, to: `${year + 1}-01-01`, name: `Jaarbericht ${year}` }
}

export default function RapportagesPage() {
  const router = useRouter()
  const [periodType, setPeriodType] = useState<PeriodType>('month')
  const [selection, setSelection] = useState('')
  const [savedConfigs, setSavedConfigs] = useState<ReportConfig[]>([])
  const [generating, setGenerating] = useState(false)
  const [configsLoading, setConfigsLoading] = useState(true)

  // Set default selection when period type changes
  useEffect(() => {
    const options = periodType === 'month' ? getMonthOptions()
      : periodType === 'quarter' ? getQuarterOptions()
        : getYearOptions()
    if (options.length > 0) {
      setSelection(options[0].value)
    }
  }, [periodType])

  // Load saved configs
  const loadConfigs = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('report_configs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      setSavedConfigs((data ?? []) as ReportConfig[])
    } catch {
      // Silent fail
    } finally {
      setConfigsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfigs()
  }, [loadConfigs])

  const handleGenerate = async () => {
    if (!selection) return
    setGenerating(true)

    try {
      const { from, to, name } = computeDateRange(periodType, selection)

      // Save config
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          period_type: periodType,
          date_from: from,
          date_to: to,
        }),
      })

      if (res.ok) {
        const config = await res.json()
        router.push(`/rapportages/${config.id}?type=${periodType}&from=${from}&to=${to}`)
      } else {
        // Navigate anyway, the report viewer will fetch data directly
        router.push(`/rapportages/new?type=${periodType}&from=${from}&to=${to}`)
      }
    } catch {
      const { from, to } = computeDateRange(periodType, selection)
      router.push(`/rapportages/new?type=${periodType}&from=${from}&to=${to}`)
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/report?id=${id}`, { method: 'DELETE' })
      setSavedConfigs(prev => prev.filter(c => c.id !== id))
    } catch {
      // Silent fail
    }
  }

  const handleView = (config: ReportConfig) => {
    router.push(`/rapportages/${config.id}?type=${config.period_type}&from=${config.date_from}&to=${config.date_to}`)
  }

  const options = periodType === 'month' ? getMonthOptions()
    : periodType === 'quarter' ? getQuarterOptions()
      : getYearOptions()

  return (
    <div className="mx-auto max-w-[720px] px-4 py-6 md:px-8">
      {/* Hero */}
      <div className="mb-8">
        <p className="font-inter text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)] mb-2">
          Rapportages
        </p>
        <h1 className="font-playfair text-3xl font-bold tracking-tight text-[var(--ink)] md:text-4xl" style={{ letterSpacing: '-0.03em' }}>
          Jouw Financieel Archief
        </h1>
        <p className="mt-2 font-source-serif text-base text-[var(--ink-2)]">
          Genereer een overzicht van elke periode in je financiele leven.
        </p>
      </div>

      {/* Report generator */}
      <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6 shadow-[var(--s0)]">
        <p className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] mb-4">
          Nieuw rapport
        </p>

        {/* Period type selector */}
        <div className="mb-4">
          <label className="mb-1.5 block font-inter text-xs text-[var(--ink-2)]">Periode</label>
          <div className="flex gap-1 rounded-[var(--r)] bg-[var(--subtle)] p-1">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriodType(opt.value)}
                className={`flex-1 rounded-[var(--r-sm)] px-3 py-1.5 font-inter text-xs font-medium transition-all ${
                  periodType === opt.value
                    ? 'bg-[var(--paper)] text-[var(--ink)] shadow-[var(--s0)]'
                    : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Period selector */}
        <div className="mb-5">
          <label className="mb-1.5 block font-inter text-xs text-[var(--ink-2)]">
            {periodType === 'month' ? 'Maand' : periodType === 'quarter' ? 'Kwartaal' : 'Jaar'}
          </label>
          <select
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
            className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 font-inter text-sm text-[var(--ink)] outline-none transition-colors focus:border-kern-400"
          >
            {options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Generate button */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="flex w-full items-center justify-center gap-2 rounded-[var(--r)] bg-[var(--ink)] px-4 py-2.5 font-inter text-sm font-medium text-[var(--paper)] transition-all hover:bg-[var(--ink-2)] disabled:opacity-50"
        >
          {generating ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--paper)] border-t-transparent" />
              Genereren...
            </>
          ) : (
            <>
              <FileText className="h-4 w-4" />
              Genereer rapport
            </>
          )}
        </button>
      </div>

      {/* Saved reports */}
      <div className="mt-8">
        <p className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] mb-3">
          Opgeslagen rapporten
        </p>

        {configsLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
          </div>
        ) : savedConfigs.length === 0 ? (
          <p className="py-6 text-center font-source-serif text-sm italic text-[var(--ink-3)]">
            Je hebt nog geen rapporten gegenereerd.
          </p>
        ) : (
          <div className="space-y-2">
            {savedConfigs.map(config => (
              <div
                key={config.id}
                className="group flex items-center justify-between rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 transition-all hover:shadow-[var(--s1)] hover:-translate-y-px"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-inter text-sm font-medium text-[var(--ink)] truncate">{config.name}</p>
                  <p className="font-inter text-[11px] text-[var(--ink-3)]">
                    {new Date(config.date_from).toLocaleDateString('nl-NL')} – {new Date(config.date_to).toLocaleDateString('nl-NL')}
                  </p>
                </div>
                <div className="flex items-center gap-1 ml-3">
                  <button
                    type="button"
                    onClick={() => handleView(config)}
                    className="rounded-[var(--r-sm)] p-2 text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink)]"
                    title="Bekijken"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(config.id)}
                    className="rounded-[var(--r-sm)] p-2 text-[var(--ink-4)] transition-colors hover:bg-red-50 hover:text-red-600"
                    title="Verwijderen"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
