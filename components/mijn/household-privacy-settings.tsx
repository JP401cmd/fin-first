'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Shield,
  Eye,
  EyeOff,
  Wallet,
  CreditCard,
  Receipt,
  ArrowLeftRight,
  Banknote,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/editorial'

/**
 * HouseholdPrivacySettings — per-categorie zichtbaarheid voor je partner
 * ("wat je partner kan zien"). Geëxtraheerd uit de legacy
 * /identity/instellingen-monolith (tab 'huishouden', privacy-subsectie)
 * naar /mijn/profiel, naast de bestaande HouseholdSection (plan A-2,
 * ontmanteling settings-monolith).
 *
 * Self-gating: laadt /api/household/privacy; bij 404 (geen huishouden)
 * rendert het component niets. Hergebruikt exact hetzelfde endpoint en
 * dezelfde Dutch-key payload als de monolith — geen nieuwe data-logica.
 */

type PrivacyLevel = 'volledig' | 'totalen' | 'verborgen'
type PrivacySettings = Record<string, PrivacyLevel>

const DEFAULT_PRIVACY: PrivacySettings = {
  vermogen: 'totalen',
  schulden: 'totalen',
  budgetten: 'totalen',
  transacties: 'totalen',
  inkomen: 'totalen',
}

const CATEGORIES: { key: keyof typeof DEFAULT_PRIVACY; label: string; description: string; icon: LucideIcon }[] = [
  { key: 'vermogen', label: 'Vermogen', description: 'Bezittingen en beleggingen', icon: Wallet },
  { key: 'schulden', label: 'Schulden', description: 'Leningen en schulden', icon: CreditCard },
  { key: 'budgetten', label: 'Budgetten', description: 'Maandbudgetten en bestedingen', icon: Receipt },
  { key: 'transacties', label: 'Transacties', description: 'Individuele transacties', icon: ArrowLeftRight },
  { key: 'inkomen', label: 'Inkomen', description: 'Salaris en overig inkomen', icon: Banknote },
]

const LEVELS: { level: PrivacyLevel; label: string; icon: LucideIcon; color: 'wil' | 'amber' | 'red' }[] = [
  { level: 'volledig', label: 'Volledig', icon: Eye, color: 'wil' },
  { level: 'totalen', label: 'Totalen', icon: Shield, color: 'amber' },
  { level: 'verborgen', label: 'Verborgen', icon: EyeOff, color: 'red' },
]

export function HouseholdPrivacySettings() {
  const [hasHousehold, setHasHousehold] = useState(false)
  const [loading, setLoading] = useState(true)
  const [privacy, setPrivacy] = useState<PrivacySettings>(DEFAULT_PRIVACY)
  const [saved, setSaved] = useState<PrivacySettings>(DEFAULT_PRIVACY)
  // Toekomst-gegevens: transparant (gedeeld) of verborgen (niets delen voor /toekomst).
  const [future, setFuture] = useState<'transparent' | 'hidden'>('transparent')
  const [savedFuture, setSavedFuture] = useState<'transparent' | 'hidden'>('transparent')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/household/privacy')
        if (!active) return
        if (res.ok) {
          const data = await res.json()
          setHasHousehold(true)
          if (data.privacySettings) {
            setPrivacy(data.privacySettings)
            setSaved(data.privacySettings)
            const f = data.privacySettings.future === 'hidden' ? 'hidden' : 'transparent'
            setFuture(f)
            setSavedFuture(f)
          }
        }
      } catch {
        /* geen huishouden of fout — blijft verborgen */
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const save = useCallback(async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/household/privacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privacySettings: { ...privacy, future } }),
      })
      if (!res.ok) throw new Error('save failed')
      setSaved({ ...privacy })
      setSavedFuture(future)
      setMessage({ type: 'success', text: 'Privacy-instellingen opgeslagen!' })
      setTimeout(() => setMessage(null), 3000)
    } catch {
      setMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    }
    setSaving(false)
  }, [privacy, future])

  if (loading || !hasHousehold) return null

  const dirty = JSON.stringify(privacy) !== JSON.stringify(saved) || future !== savedFuture

  return (
    <section
      className="mb-10 rounded-[var(--r-lg)] border border-kern-200 bg-[var(--paper)] p-6 sm:p-8"
      data-testid="household-privacy-section"
    >
      <div className="flex items-start gap-3 mb-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-wil-100 text-wil-700">
          <Shield className="h-4 w-4" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">Privacy binnen je huishouden</h2>
          <p className="mt-1 text-sm text-[var(--ink-2)] leading-relaxed">
            Ieder huishouden is anders — het is heel normaal om niet alles te delen. Stel per categorie
            in wat je partner kan zien. Je kunt dit altijd aanpassen.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 rounded-lg border border-[var(--border-ed)] p-3 bg-[var(--paper)] mb-4">
        <div className="flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5 text-wil-600" aria-hidden="true" />
          <span className="text-xs text-[var(--ink-2)]">
            <strong>Volledig</strong> — alle details zichtbaar
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
          <span className="text-xs text-[var(--ink-2)]">
            <strong>Totalen</strong> — alleen totaalbedragen
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <EyeOff className="h-3.5 w-3.5 text-negative" aria-hidden="true" />
          <span className="text-xs text-[var(--ink-2)]">
            <strong>Verborgen</strong> — volledig afgeschermd
          </span>
        </div>
      </div>

      {/* Toekomst-gegevens: transparant of verborgen (hoofdschakelaar voor /toekomst). */}
      <div className="mb-4 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4" data-testid="future-privacy-toggle">
        <div className="mb-2 flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-wil-50">
            <Shield className="h-3.5 w-3.5 text-wil-600" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--ink)]">Toekomst-gegevens</h3>
            <p className="text-xs text-[var(--ink-3)]">Instellingen, gebeurtenissen en FIRE-projectie op de Toekomst-pagina</p>
          </div>
        </div>
        <div className="flex gap-2">
          {([
            { val: 'transparent', label: 'Transparant', icon: Eye },
            { val: 'hidden', label: 'Verborgen', icon: EyeOff },
          ] as const).map((opt) => {
            const isActive = future === opt.val
            const Icon = opt.icon
            return (
              <button
                key={opt.val}
                type="button"
                aria-pressed={isActive}
                onClick={() => setFuture(opt.val)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  isActive
                    ? opt.val === 'transparent'
                      ? 'bg-wil-50 text-wil-700 border border-wil-300'
                      : 'bg-negative/10 text-negative border border-negative/40'
                    : 'border border-[var(--border-ed)] text-[var(--ink-3)] hover:bg-[var(--subtle)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {opt.label}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-[var(--ink-4)] leading-relaxed">
          Bij <strong>Verborgen</strong> deelt je partner geen van jouw toekomst-gegevens
          (instellingen, gebeurtenissen, FIRE-projectie) in de huishoudweergave.
        </p>
      </div>

      <div className="space-y-3">
        {CATEGORIES.map((cat) => {
          const currentLevel = privacy[cat.key] || 'totalen'
          const CatIcon = cat.icon
          return (
            <div key={cat.key} className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-wil-50">
                    <CatIcon className="h-3.5 w-3.5 text-wil-600" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--ink)]">{cat.label}</h3>
                    <p className="text-xs text-[var(--ink-3)]">{cat.description}</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {LEVELS.map((opt) => {
                  const isActive = currentLevel === opt.level
                  const Icon = opt.icon
                  return (
                    <button
                      key={opt.level}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setPrivacy((prev) => ({ ...prev, [cat.key]: opt.level }))}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                        isActive
                          ? opt.color === 'wil'
                            ? 'bg-wil-50 text-wil-700 border border-wil-300'
                            : opt.color === 'amber'
                              ? 'bg-amber-50 text-amber-700 border border-amber-300'
                              : 'bg-negative/10 text-negative border border-negative/40'
                          : 'border border-[var(--border-ed)] text-[var(--ink-3)] hover:bg-[var(--subtle)]'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">{opt.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-4 pt-4">
        <Button variant="primary" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Opslaan...' : 'Opslaan'}
        </Button>
        {message && (
          <p className={`text-sm ${message.type === 'success' ? 'text-wil-600' : 'text-negative'}`}>
            {message.text}
          </p>
        )}
        {dirty && !message && <p className="text-xs text-amber-600">Niet-opgeslagen wijzigingen</p>}
      </div>
    </section>
  )
}
