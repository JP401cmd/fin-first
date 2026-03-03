'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { PHASES, FEATURES, DEFAULT_MATRIX } from '@/lib/feature-phases'
import { FfinAvatar } from '@/components/app/avatars'
import { X } from 'lucide-react'

type Props = {
  oldPhase: string
  newPhase: string
  onClose: () => void
}

// Map feature IDs to the most relevant app page for navigation
const FEATURE_PAGE_MAP: Record<string, string> = {
  // Kern features → /core
  nibud_benchmark: '/core/budgets',
  box3_belasting: '/core/debts',
  budget_optimalisatie: '/core/budgets',
  schulden_aflosplan: '/core/debts',
  asset_allocatie: '/core/assets',
  vermogensverloop: '/core',
  snapshot_vergelijking: '/core',
  cashflow_sankey: '/core',
  data_export: '/core',
  // Wil features → /will
  doelen_systeem: '/will',
  beslissingspatronen: '/will',
  // Horizon features → /horizon
  fire_projecties: '/horizon',
  monte_carlo: '/horizon',
  levensgebeurtenissen: '/horizon',
  withdrawal_strategie: '/horizon',
  veerkracht_score: '/horizon',
  vermogensprojectie_chart: '/horizon',
  fire_scenario_analyse: '/horizon',
  fire_geavanceerde_params: '/horizon',
}

/**
 * Determine the best navigation target based on newly unlocked features.
 * Picks the page that has the most newly unlocked features.
 * Falls back to /dashboard if no clear winner.
 */
function getBestNavigationTarget(featureIds: string[]): string {
  if (featureIds.length === 0) return '/dashboard'

  const pageCounts: Record<string, number> = {}
  for (const id of featureIds) {
    const page = FEATURE_PAGE_MAP[id] ?? '/dashboard'
    // Group subpages to their parent module for counting
    const module = page.startsWith('/core') ? '/core'
      : page.startsWith('/will') ? '/will'
      : page.startsWith('/horizon') ? '/horizon'
      : '/dashboard'
    pageCounts[module] = (pageCounts[module] ?? 0) + 1
  }

  // Find the module with the most newly unlocked features
  let bestPage = '/dashboard'
  let bestCount = 0
  for (const [page, count] of Object.entries(pageCounts)) {
    if (count > bestCount) {
      bestCount = count
      bestPage = page
    }
  }

  return bestPage
}

const PHASE_COLORS: Record<string, { gradient: string; bg: string; border: string; text: string; badge: string; particle: string }> = {
  recovery:  { gradient: 'from-rose-500 to-rose-600',  bg: 'bg-rose-50',  border: 'border-rose-200',  text: 'text-rose-700',  badge: 'bg-rose-100 text-rose-700',  particle: '#f43f5e' },
  stability: { gradient: 'from-blue-500 to-blue-600',  bg: 'bg-blue-50',  border: 'border-blue-200',  text: 'text-blue-700',  badge: 'bg-blue-100 text-blue-700',  particle: '#3b82f6' },
  momentum:  { gradient: 'from-teal-500 to-teal-600',  bg: 'bg-teal-50',  border: 'border-teal-200',  text: 'text-teal-700',  badge: 'bg-teal-100 text-teal-700',  particle: '#14b8a6' },
  mastery:   { gradient: 'from-amber-500 to-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700', particle: '#f59e0b' },
}

function phaseLabelNl(id: string): string {
  const NL_LABELS: Record<string, string> = {
    recovery: 'Herstel',
    stability: 'Stabiliteit',
    momentum: 'Momentum',
    mastery: 'Meesterschap',
  }
  return NL_LABELS[id] ?? (PHASES.find(p => p.id === id)?.label ?? id)
}

function phaseLabel(id: string): string {
  return PHASES.find(p => p.id === id)?.label ?? id
}

/** Sparkle particle for celebration animation */
function SparkleParticles({ color }: { color: string }) {
  const [particles, setParticles] = useState<Array<{
    id: number; x: number; y: number; size: number; delay: number; duration: number; angle: number
  }>>([])

  useEffect(() => {
    // Generate random sparkle particles
    const generated = Array.from({ length: 24 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 3 + Math.random() * 5,
      delay: Math.random() * 1.5,
      duration: 1 + Math.random() * 2,
      angle: Math.random() * 360,
    }))
    setParticles(generated)
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" data-testid="sparkle-particles">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full animate-sparkle"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: color,
            opacity: 0,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.angle}deg)`,
          }}
        />
      ))}
      <style>{`
        @keyframes sparkle {
          0% { opacity: 0; transform: scale(0) translateY(0); }
          30% { opacity: 1; transform: scale(1.2) translateY(-8px); }
          70% { opacity: 0.8; transform: scale(0.8) translateY(-16px); }
          100% { opacity: 0; transform: scale(0) translateY(-24px); }
        }
        .animate-sparkle {
          animation-name: sparkle;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
      `}</style>
    </div>
  )
}

export function PhaseTransitionModal({ oldPhase, newPhase, onClose }: Props) {
  const router = useRouter()
  const colors = PHASE_COLORS[newPhase] ?? PHASE_COLORS.stability
  const oldColors = PHASE_COLORS[oldPhase] ?? PHASE_COLORS.recovery
  const [isVisible, setIsVisible] = useState(false)

  // Trigger entrance animation after mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50)
    return () => clearTimeout(timer)
  }, [])

  // Handle Escape key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Compute newly unlocked features
  const newFeatures = FEATURES.filter(f =>
    DEFAULT_MATRIX[f.id]?.[newPhase] && !DEFAULT_MATRIX[f.id]?.[oldPhase]
  )

  // Determine where the CTA should navigate
  const targetPage = getBestNavigationTarget(newFeatures.map(f => f.id))

  const handleCtaClick = useCallback(() => {
    onClose()
    router.push(targetPage)
  }, [onClose, router, targetPage])

  // Handle overlay click (clicking outside the modal)
  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])

  return (
    <div
      data-testid="phase-transition-modal"
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-500 ${
        isVisible ? 'bg-black/50' : 'bg-black/0'
      }`}
      style={{ right: 'var(--chat-sidebar-width, 0px)' }}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Fase transitie: ${phaseLabelNl(newPhase)}`}
    >
      <div
        data-testid="phase-transition-modal-content"
        className={`mx-4 w-full max-w-lg rounded-[var(--r-lg)] bg-[var(--paper)] shadow-xl overflow-hidden transition-all duration-500 ${
          isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-90 translate-y-4'
        }`}
      >
        {/* Header with gradient + sparkle animation */}
        <div
          data-testid="phase-transition-header"
          className={`relative bg-gradient-to-r ${colors.gradient} px-6 py-8 text-center text-white`}
        >
          {/* Celebration sparkle particles */}
          <SparkleParticles color={colors.particle} />

          {/* Close button */}
          <button
            data-testid="phase-transition-close"
            onClick={onClose}
            className="absolute top-3 right-3 rounded-full p-1.5 text-white/70 hover:text-white hover:bg-[var(--paper)]/20 transition-colors z-10"
            aria-label="Sluiten"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="mx-auto mb-4 flex justify-center relative z-[1]">
            <FfinAvatar size={72} />
          </div>
          <h2 data-testid="phase-transition-title" className="text-xl font-bold relative z-[1]">
            Gefeliciteerd!
          </h2>
          <p data-testid="phase-transition-subtitle" className="mt-1 text-sm text-white/90 relative z-[1]">
            Je bent nu in de <strong>{phaseLabelNl(newPhase)}</strong>-fase
          </p>

          {/* Phase transition visual */}
          <div data-testid="phase-transition-badges" className="mt-4 flex items-center justify-center gap-3 relative z-[1]">
            <span className={`rounded-full px-3 py-1 text-sm font-medium ${oldColors.badge}`}>
              {phaseLabel(oldPhase)}
            </span>
            <svg className="h-5 w-5 text-white/80 animate-bounce-x" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${colors.badge} ring-2 ring-white/30`}>
              {phaseLabel(newPhase)}
            </span>
          </div>

          {/* Arrow bounce animation */}
          <style>{`
            @keyframes bounce-x {
              0%, 100% { transform: translateX(0); }
              50% { transform: translateX(6px); }
            }
            .animate-bounce-x {
              animation: bounce-x 1.5s ease-in-out infinite;
            }
          `}</style>
        </div>

        {/* Body: newly unlocked features */}
        <div data-testid="phase-transition-body" className="px-6 py-5">
          {newFeatures.length > 0 && (
            <>
              <h3 data-testid="phase-transition-unlocked-title" className="text-sm font-semibold text-[var(--ink-2)] mb-3">
                Nieuw ontgrendeld ({newFeatures.length})
              </h3>
              <div data-testid="phase-transition-feature-list" className="space-y-2 max-h-64 overflow-y-auto">
                {newFeatures.map(f => (
                  <div
                    key={f.id}
                    data-testid={`unlocked-feature-${f.id}`}
                    className={`rounded-lg ${colors.bg} ${colors.border} border px-4 py-3`}
                  >
                    <p className={`text-sm font-medium ${colors.text}`}>{f.label}</p>
                    <p className="text-xs text-[var(--ink-3)] mt-0.5">{f.description}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {newFeatures.length === 0 && (
            <p className="text-sm text-[var(--ink-3)] text-center py-2">
              Je bent klaar voor de volgende stap in je financiele reis.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border-ed)] px-6 py-4">
          <button
            data-testid="phase-transition-cta"
            onClick={handleCtaClick}
            className={`w-full rounded-lg bg-gradient-to-r ${colors.gradient} px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90`}
          >
            Ontdek je nieuwe mogelijkheden
          </button>
        </div>
      </div>
    </div>
  )
}
