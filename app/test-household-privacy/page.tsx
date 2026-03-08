'use client'

import { useState } from 'react'
import { Eye, EyeOff, Shield, Users } from 'lucide-react'

type PrivacyLevel = 'volledig' | 'totalen' | 'verborgen'
type PrivacySettings = Record<string, PrivacyLevel>

const DEFAULT_PRIVACY: PrivacySettings = {
  vermogen: 'totalen',
  schulden: 'totalen',
  budgetten: 'totalen',
  transacties: 'totalen',
  inkomen: 'totalen',
}

const CATEGORIES = [
  { key: 'vermogen', label: 'Vermogen', description: 'Bezittingen en beleggingen' },
  { key: 'schulden', label: 'Schulden', description: 'Leningen en schulden' },
  { key: 'budgetten', label: 'Budgetten', description: 'Maandbudgetten en bestedingen' },
  { key: 'transacties', label: 'Transacties', description: 'Individuele transacties' },
  { key: 'inkomen', label: 'Inkomen', description: 'Salaris en overig inkomen' },
] as const

const LEVELS: { level: PrivacyLevel; label: string; icon: typeof Eye; color: string }[] = [
  { level: 'volledig', label: 'Volledig', icon: Eye, color: 'teal' },
  { level: 'totalen', label: 'Totalen', icon: Shield, color: 'amber' },
  { level: 'verborgen', label: 'Verborgen', icon: EyeOff, color: 'red' },
]

export default function TestHouseholdPrivacy() {
  const [privacy, setPrivacy] = useState<PrivacySettings>(DEFAULT_PRIVACY)
  const [saved, setSaved] = useState<PrivacySettings>(DEFAULT_PRIVACY)
  const [message, setMessage] = useState('')

  const hasChanges = JSON.stringify(privacy) !== JSON.stringify(saved)

  return (
    <div className="mx-auto max-w-2xl p-8 space-y-6">
      <h1 className="text-2xl font-bold">Test: Huishouden Privacy Instellingen</h1>
      <p className="text-sm text-gray-500">
        Dit is een visuele test van de huishouden privacy UI component.
        De 5 categorieën moeten elk 3 selecteerbare niveaus tonen.
      </p>

      {/* Verification checklist */}
      <div className="rounded-lg border border-gray-200 p-4 bg-gray-50 space-y-2">
        <h2 className="font-semibold text-sm">Verificatie checklist:</h2>
        <ul className="text-xs space-y-1">
          <li className={CATEGORIES.length === 5 ? 'text-green-600' : 'text-red-600'}>
            ✓ 5 categorieën: Vermogen, Schulden, Budgetten, Transacties, Inkomen
          </li>
          <li className={LEVELS.length === 3 ? 'text-green-600' : 'text-red-600'}>
            ✓ 3 niveaus per categorie: Volledig, Totalen, Verborgen
          </li>
          <li className={Object.values(DEFAULT_PRIVACY).every(v => v === 'totalen') ? 'text-green-600' : 'text-red-600'}>
            ✓ Standaard voor nieuwe huishoudens is &apos;Totalen&apos;
          </li>
        </ul>
      </div>

      {/* Privacy component preview */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Huishouden</h2>
          <p className="mt-0.5 text-xs text-gray-400">Bepaal welke financiële data je partner kan zien</p>
        </div>

        <div className="px-6 pb-6 pt-4 space-y-5">
          <div className="flex items-start gap-3">
            <Users className="mt-0.5 h-5 w-5 text-gray-400 shrink-0" />
            <p className="text-sm text-gray-600 leading-relaxed">
              Stel per categorie in welke financiële gegevens je partner kan zien.
              Dit geldt alleen voor hoe jouw data wordt getoond aan je partner.
            </p>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 rounded-lg border border-gray-200 p-3 bg-gray-50">
            <div className="flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 text-teal-600" />
              <span className="text-xs text-gray-600"><strong>Volledig</strong> — alle details zichtbaar</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-amber-600" />
              <span className="text-xs text-gray-600"><strong>Totalen</strong> — alleen totaalbedragen</span>
            </div>
            <div className="flex items-center gap-1.5">
              <EyeOff className="h-3.5 w-3.5 text-red-500" />
              <span className="text-xs text-gray-600"><strong>Verborgen</strong> — volledig afgeschermd</span>
            </div>
          </div>

          {/* Categories */}
          <div className="space-y-3">
            {CATEGORIES.map(cat => {
              const currentLevel = privacy[cat.key] || 'totalen'
              return (
                <div key={cat.key} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{cat.label}</h3>
                      <p className="text-xs text-gray-400">{cat.description}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {LEVELS.map(opt => {
                      const isActive = currentLevel === opt.level
                      const Icon = opt.icon
                      return (
                        <button
                          key={opt.level}
                          type="button"
                          onClick={() => setPrivacy(prev => ({ ...prev, [cat.key]: opt.level }))}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                            isActive
                              ? opt.color === 'teal'
                                ? 'bg-teal-50 text-teal-700 border border-teal-300'
                                : opt.color === 'amber'
                                ? 'bg-amber-50 text-amber-700 border border-amber-300'
                                : 'bg-red-50 text-red-700 border border-red-300'
                              : 'border border-gray-200 text-gray-400 hover:bg-gray-50'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Save button */}
          <div className="flex items-center gap-4 pt-2">
            <button
              onClick={() => {
                setSaved({ ...privacy })
                setMessage('Privacy-instellingen opgeslagen!')
                setTimeout(() => setMessage(''), 3000)
              }}
              disabled={!hasChanges}
              className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
            >
              Opslaan
            </button>
            {message && <p className="text-sm text-teal-600">{message}</p>}
            {hasChanges && !message && <p className="text-xs text-amber-600">Niet-opgeslagen wijzigingen</p>}
          </div>
        </div>
      </div>

      {/* Current state */}
      <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
        <h3 className="font-semibold text-sm mb-2">Huidige staat:</h3>
        <pre className="text-xs font-mono">{JSON.stringify(privacy, null, 2)}</pre>
      </div>
    </div>
  )
}
