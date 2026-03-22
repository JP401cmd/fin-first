'use client'

import { useState, useEffect } from 'react'
import { BookOpen, Hourglass, Receipt, Flame, Shield, MessageSquare, BarChart3, ShieldCheck, type LucideIcon } from 'lucide-react'

/* ── Types ──────────────────────── */

interface GuideFinancial {
  freedomDays: { days: number; months: number; years: number }
  fireAge: number | null
  sovereigntyLevel: number
}

interface ConceptCard {
  id: string
  icon: LucideIcon
  name: string
  color: string        // bg color for front
  colorAccent: string  // text/border accent
  explanation: string
  personalDataFn: (data: GuideFinancial | null) => string | null
}

const SOVEREIGNTY_PHASE_LABELS: Record<string, string> = {
  recovery: 'Herstel',
  stability: 'Stabiliteit',
  momentum: 'Momentum',
  mastery: 'Meesterschap',
}

function getSovereigntyPhase(level: number): string {
  if (level <= 0) return 'recovery'
  if (level <= 2) return 'stability'
  if (level <= 4) return 'momentum'
  return 'mastery'
}

/* ── Concept definitions ──────────────────────── */

const CONCEPTS: ConceptCard[] = [
  {
    id: 'vrijheidstijd',
    icon: Hourglass,
    name: 'Vrijheidstijd',
    color: 'var(--color-kern-50)',
    colorAccent: 'var(--color-kern-400)',
    explanation:
      'Het aantal dagen, maanden of jaren dat je vermogen je levenskosten dekt — zonder te werken. Hoe meer vrijheidstijd, hoe dichter bij financiële onafhankelijkheid.',
    personalDataFn: (data) => {
      if (!data) return null
      const { years, months, days } = data.freedomDays
      if (years === 0 && months === 0 && days === 0) return null
      if (years > 0)
        return `Jouw vrijheidstijd: ${years} jaar en ${months} maanden`
      if (months > 0) return `Jouw vrijheidstijd: ${months} maanden en ${days} dagen`
      return `Jouw vrijheidstijd: ${days} dagen`
    },
  },
  {
    id: 'kassabon',
    icon: Receipt,
    name: 'Kassabon',
    color: 'var(--subtle, #f8f8f7)',
    colorAccent: 'var(--ink-2, #555)',
    explanation:
      'Tik op een getal in de app en je ziet de kassabon — een stapsgewijze berekening die laat zien hoe het bedrag is opgebouwd. Transparantie in elk cijfer.',
    personalDataFn: () => null, // no personal data for this concept
  },
  {
    id: 'fire',
    icon: Flame,
    name: 'FIRE',
    color: 'var(--color-horizon-50)',
    colorAccent: 'var(--color-horizon-400)',
    explanation:
      'Financial Independence, Retire Early — het moment waarop je vermogen genoeg oplevert om je uitgaven te dekken. Werken wordt optioneel.',
    personalDataFn: (data) => {
      if (!data?.fireAge) return null
      return `Jouw verwachte FIRE-leeftijd: ${data.fireAge} jaar`
    },
  },
  {
    id: 'soevereiniteit',
    icon: Shield,
    name: 'Soevereiniteit',
    color: 'var(--color-wil-50)',
    colorAccent: 'var(--color-wil-400)',
    explanation:
      'Je financiële zelfredzaamheid, gemeten in niveaus van Herstel tot Meesterschap. Elk niveau ontgrendelt nieuwe functies in de app.',
    personalDataFn: (data) => {
      if (data === null) return null
      const phase = getSovereigntyPhase(data.sovereigntyLevel)
      const label = SOVEREIGNTY_PHASE_LABELS[phase] ?? phase
      return `Jouw niveau: ${label} (level ${data.sovereigntyLevel})`
    },
  },
  {
    id: 'will',
    icon: MessageSquare,
    name: 'Will',
    color: 'var(--color-horizon-50)',
    colorAccent: 'var(--color-horizon-400)',
    explanation:
      'Je persoonlijke financiële assistent. Will kent de context van elke pagina en vertaalt cijfers naar inzichten. Stel hem een vraag via de chatknop rechtsonder.',
    personalDataFn: () => null, // no personal data for Will
  },
  {
    id: 'per-asset-rendement',
    icon: BarChart3,
    name: 'Per-asset rendement',
    color: 'var(--color-horizon-50)',
    colorAccent: 'var(--color-horizon-400)',
    explanation:
      'Elke bezitting groeit met een eigen rendement. Spaargeld met de spaarrente, beleggingen met het beursrendement, pensioen met het pensioenrendement. De simulatie berekent groei per type apart — realistischer dan één uniform percentage.',
    personalDataFn: () => null,
  },
  {
    id: 'heffingsvrij-vermogen',
    icon: ShieldCheck,
    name: 'Heffingsvrij vermogen',
    color: 'var(--color-kern-50)',
    colorAccent: 'var(--color-kern-400)',
    explanation:
      'De eerste € 57.000 (of € 114.000 met partner) van je vermogen is vrijgesteld van Box 3 belasting. Dit bedrag wordt proportioneel verdeeld over je bezittingstypes. Spaargeld profiteert relatief meer omdat het forfaitair rendement lager is.',
    personalDataFn: () => null,
  },
]

/* ── FlipCard component ──────────────────────── */

function FlipCard({ concept, personalData }: { concept: ConceptCard; personalData: GuideFinancial | null }) {
  const [flipped, setFlipped] = useState(false)
  const personal = concept.personalDataFn(personalData)
  const Icon = concept.icon

  return (
    <div
      className="perspective-[600px] cursor-pointer"
      style={{ minHeight: '160px' }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`${concept.name} — ${flipped ? 'achterkant' : 'voorkant'}. Klik om te draaien.`}
        className="relative w-full h-full transition-transform duration-500"
        style={{
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          minHeight: '160px',
        }}
        onClick={() => setFlipped(!flipped)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setFlipped(!flipped)
          }
        }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 flex flex-col rounded-[var(--r-lg)] border border-[var(--border-ed)] overflow-hidden"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            backgroundColor: concept.color,
          }}
        >
          <div className="h-[2px] w-full" style={{ backgroundColor: concept.colorAccent }} />
          <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
            <div
              className="mb-2 flex h-9 w-9 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)]"
              style={{ color: concept.colorAccent }}
            >
              <Icon className="h-4.5 w-4.5" />
            </div>
            <p className="text-[13px] font-semibold" style={{ color: concept.colorAccent }}>
              {concept.name}
            </p>
            <p className="mt-1 text-[10px] text-[var(--ink-4)]">Tik om te draaien</p>
          </div>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 flex flex-col rounded-[var(--r-lg)] border overflow-hidden"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            backgroundColor: 'var(--paper)',
            borderColor: concept.colorAccent,
          }}
        >
          <div className="h-[2px] w-full" style={{ backgroundColor: concept.colorAccent }} />
          <div className="flex flex-1 flex-col justify-between p-3 overflow-y-auto">
            <div>
              <p className="text-[11px] font-semibold text-[var(--ink)] mb-1.5">{concept.name}</p>
              <p className="text-[11px] leading-relaxed text-[var(--ink-2)]">{concept.explanation}</p>
            </div>
            {personal && (
              <div
                className="mt-2 rounded-[var(--r-sm)] px-2.5 py-1.5 text-[11px] font-medium font-mono tabular-nums"
                style={{
                  backgroundColor: concept.color,
                  color: concept.colorAccent,
                }}
              >
                {personal}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Main component ──────────────────────── */

export default function ConceptFlipCards() {
  const [financial, setFinancial] = useState<GuideFinancial | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/guide-progress')
        if (res.ok) {
          const data = await res.json()
          setFinancial(data.financial)
        }
      } catch {
        // Silently fail — cards still work without personal data
      }
    }
    loadData()
  }, [])

  return (
    <div className="mb-6 sm:mb-8">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="h-4 w-4 text-[var(--ink-3)]" />
        <p className="label-editorial text-[var(--ink-3)]">Kernconcepten</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {CONCEPTS.map((concept) => (
          <FlipCard
            key={concept.id}
            concept={concept}
            personalData={financial}
          />
        ))}
      </div>
    </div>
  )
}
