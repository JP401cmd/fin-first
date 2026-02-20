'use client'

import { useState, useEffect } from 'react'
import { Search, Building2 } from 'lucide-react'

type Institution = {
  id: string
  name: string
  logo: string
  bic: string
}

type BankSelectorProps = {
  onSelect: (institution: Institution) => void
}

export function BankSelector({ onSelect }: BankSelectorProps) {
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/gocardless/institutions')
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Kon banken niet laden')
        }
        const data = await res.json()
        setInstitutions(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Kon banken niet laden')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = search.trim()
    ? institutions.filter((i) =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.bic.toLowerCase().includes(search.toLowerCase())
      )
    : institutions

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-[var(--r-lg)] border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-medium text-red-700">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-3)]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek je bank..."
          className="w-full rounded-lg border border-[var(--border-ed)] py-2.5 pl-9 pr-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-3)] focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {filtered.map((inst) => (
          <button
            key={inst.id}
            onClick={() => onSelect(inst)}
            className="flex flex-col items-center gap-2 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 transition-all hover:border-kern-300 hover:bg-kern-50 hover:shadow-[var(--s0)]"
          >
            {inst.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={inst.logo}
                alt={inst.name}
                className="h-10 w-10 rounded-lg object-contain"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100">
                <Building2 className="h-5 w-5 text-[var(--ink-3)]" />
              </div>
            )}
            <span className="text-center text-xs font-medium text-[var(--ink-2)] line-clamp-2">
              {inst.name}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-[var(--ink-3)]">
          Geen banken gevonden voor &ldquo;{search}&rdquo;
        </p>
      )}
    </div>
  )
}
