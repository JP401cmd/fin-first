'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, ArrowUp, Star, Sparkles, Zap } from 'lucide-react'

// ── Level metadata ─────────────────────────────────────────────

const LEVEL_NAMES: Record<number, { name: string; nameNl: string; icon: string }> = {
  [-2]: { name: 'Time Deficit', nameNl: 'Tijdtekort', icon: '🕳️' },
  [-1]: { name: 'Time Drag', nameNl: 'Tijdweerstand', icon: '⚓' },
  0:    { name: 'The Reset', nameNl: 'Het Nulpunt', icon: '🔄' },
  1:    { name: 'The Anchor', nameNl: 'Het Anker', icon: '⚓' },
  2:    { name: 'Time Shield', nameNl: 'Tijdschild', icon: '🛡️' },
  3:    { name: 'Velocity', nameNl: 'Snelheid', icon: '🚀' },
  4:    { name: 'Autonomous', nameNl: 'Autonoom', icon: '🛩️' },
  5:    { name: 'Sovereign', nameNl: 'Soeverein', icon: '👑' },
  6:    { name: 'Timeless', nameNl: 'Tijdloos', icon: '♾️' },
}

const PHASE_COLORS: Record<string, { gradient: string; particle: string; bg: string; text: string; ring: string }> = {
  recovery:  { gradient: 'from-rose-500 via-rose-600 to-pink-600', particle: '#f43f5e', bg: 'bg-rose-500', text: 'text-rose-600', ring: 'ring-rose-300' },
  stability: { gradient: 'from-blue-500 via-blue-600 to-indigo-600', particle: '#3b82f6', bg: 'bg-blue-500', text: 'text-blue-600', ring: 'ring-blue-300' },
  momentum:  { gradient: 'from-teal-500 via-teal-600 to-emerald-600', particle: '#14b8a6', bg: 'bg-teal-500', text: 'text-teal-600', ring: 'ring-teal-300' },
  mastery:   { gradient: 'from-amber-500 via-amber-600 to-orange-600', particle: '#f59e0b', bg: 'bg-amber-500', text: 'text-amber-600', ring: 'ring-amber-300' },
}

function levelToPhase(level: number): string {
  if (level <= 0) return 'recovery'
  if (level <= 2) return 'stability'
  if (level <= 4) return 'momentum'
  return 'mastery'
}

// ── Confetti burst ─────────────────────────────────────────────

function ConfettiBurst({ color }: { color: string }) {
  const [particles, setParticles] = useState<Array<{
    id: number; x: number; y: number; size: number; delay: number
    duration: number; rotation: number; dx: number; dy: number; shape: 'circle' | 'square' | 'star'
  }>>([])

  useEffect(() => {
    const generated = Array.from({ length: 40 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 40 + (Math.random() - 0.5) * 0.5
      const speed = 80 + Math.random() * 180
      return {
        id: i,
        x: 50 + (Math.random() - 0.5) * 10,
        y: 40 + (Math.random() - 0.5) * 10,
        size: 4 + Math.random() * 8,
        delay: Math.random() * 0.4,
        duration: 1.2 + Math.random() * 1.2,
        rotation: Math.random() * 720,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed - 60,
        shape: (['circle', 'square', 'star'] as const)[Math.floor(Math.random() * 3)],
      }
    })
    setParticles(generated)
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" data-testid="confetti-burst">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute animate-confetti-particle"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: p.shape === 'circle' ? `${p.size}px` : `${p.size * 0.6}px`,
            backgroundColor: color,
            borderRadius: p.shape === 'circle' ? '50%' : p.shape === 'star' ? '2px' : '1px',
            opacity: 0,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            ['--dx' as string]: `${p.dx}px`,
            ['--dy' as string]: `${p.dy}px`,
            ['--rot' as string]: `${p.rotation}deg`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-particle {
          0% {
            opacity: 1;
            transform: translate(0, 0) rotate(0deg) scale(1);
          }
          60% {
            opacity: 0.9;
          }
          100% {
            opacity: 0;
            transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(0.3);
          }
        }
        .animate-confetti-particle {
          animation-name: confetti-particle;
          animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
          animation-fill-mode: forwards;
        }
      `}</style>
    </div>
  )
}

// ── Rising sparkles ────────────────────────────────────────────

function RisingSparkles({ color }: { color: string }) {
  const [sparks, setSparks] = useState<Array<{
    id: number; x: number; delay: number; duration: number; size: number
  }>>([])

  useEffect(() => {
    const generated = Array.from({ length: 16 }, (_, i) => ({
      id: i,
      x: 5 + Math.random() * 90,
      delay: Math.random() * 2,
      duration: 2 + Math.random() * 2,
      size: 2 + Math.random() * 4,
    }))
    setSparks(generated)
  }, [])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" data-testid="rising-sparkles">
      {sparks.map(s => (
        <div
          key={s.id}
          className="absolute rounded-full animate-rising-spark"
          style={{
            left: `${s.x}%`,
            bottom: '-10px',
            width: `${s.size}px`,
            height: `${s.size}px`,
            backgroundColor: color,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
            boxShadow: `0 0 ${s.size * 2}px ${color}`,
          }}
        />
      ))}
      <style>{`
        @keyframes rising-spark {
          0% {
            opacity: 0;
            transform: translateY(0) scale(0);
          }
          20% {
            opacity: 1;
            transform: translateY(-20vh) scale(1);
          }
          80% {
            opacity: 0.6;
            transform: translateY(-70vh) scale(0.8);
          }
          100% {
            opacity: 0;
            transform: translateY(-100vh) scale(0);
          }
        }
        .animate-rising-spark {
          animation-name: rising-spark;
          animation-timing-function: ease-out;
          animation-iteration-count: infinite;
        }
      `}</style>
    </div>
  )
}

// ── Level-up number counter ───────────────────────────────────

function AnimatedNumber({ from, to }: { from: number; to: number }) {
  const [current, setCurrent] = useState(from)

  useEffect(() => {
    const startTime = Date.now()
    const duration = 1200
    const step = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setCurrent(Math.round(from + (to - from) * eased))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [from, to])

  return <span data-testid="animated-level-number">{current}</span>
}

// ── Main LevelUpCelebration component ─────────────────────────

type LevelUpCelebrationProps = {
  oldLevel: number
  newLevel: number
  onClose: () => void
}

export function LevelUpCelebration({ oldLevel, newLevel, onClose }: LevelUpCelebrationProps) {
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit'>('enter')
  const [showContent, setShowContent] = useState(false)

  const phaseId = levelToPhase(newLevel)
  const colors = PHASE_COLORS[phaseId] ?? PHASE_COLORS.stability
  const levelInfo = LEVEL_NAMES[newLevel] ?? { name: `Level ${newLevel}`, nameNl: `Niveau ${newLevel}`, icon: '⬆️' }
  const oldLevelInfo = LEVEL_NAMES[oldLevel] ?? { name: `Level ${oldLevel}`, nameNl: `Niveau ${oldLevel}`, icon: '📍' }

  // Entry animation sequence
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('show'), 100)
    const t2 = setTimeout(() => setShowContent(true), 500)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  // Handle Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleDismiss()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleDismiss = useCallback(() => {
    setPhase('exit')
    setTimeout(() => onClose(), 400)
  }, [onClose])

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleDismiss()
  }, [handleDismiss])

  return (
    <div
      data-testid="level-up-celebration"
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-500 ${
        phase === 'enter' ? 'bg-black/0' :
        phase === 'exit' ? 'bg-black/0' :
        'bg-black/60'
      }`}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Niveau omhoog: ${levelInfo.nameNl}`}
    >
      {/* Background celebration effects */}
      {phase === 'show' && (
        <>
          <ConfettiBurst color={colors.particle} />
          <RisingSparkles color={colors.particle} />
        </>
      )}

      {/* Main celebration card */}
      <div
        data-testid="level-up-card"
        className={`relative mx-4 w-full max-w-md overflow-hidden rounded-3xl bg-[var(--paper)] shadow-2xl transition-all duration-500 ${
          phase === 'enter' ? 'opacity-0 scale-75 translate-y-8' :
          phase === 'exit' ? 'opacity-0 scale-90 -translate-y-4' :
          'opacity-100 scale-100 translate-y-0'
        }`}
      >
        {/* Gradient header with level icon */}
        <div
          data-testid="level-up-header"
          className={`relative bg-gradient-to-br ${colors.gradient} px-6 py-10 text-center text-white overflow-hidden`}
        >
          {/* Animated rings behind icon */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`absolute w-32 h-32 rounded-full border-2 border-white/20 animate-level-ring-1`} />
            <div className={`absolute w-48 h-48 rounded-full border border-white/10 animate-level-ring-2`} />
            <div className={`absolute w-64 h-64 rounded-full border border-white/5 animate-level-ring-3`} />
          </div>

          {/* Close button */}
          <button
            data-testid="level-up-close"
            onClick={handleDismiss}
            className="absolute top-3 right-3 rounded-full p-1.5 text-white/60 hover:text-white hover:bg-[var(--paper)]/20 transition-colors z-10"
            aria-label="Sluiten"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Level icon with pulse */}
          <div className={`relative z-[1] mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--paper)]/20 backdrop-blur-sm ring-4 ${colors.ring} transition-all duration-700 ${
            phase === 'show' ? 'scale-100 animate-level-icon-pulse' : 'scale-0'
          }`}>
            <span className="text-4xl" data-testid="level-up-icon">{levelInfo.icon}</span>
          </div>

          {/* Arrow up animation */}
          <div className={`relative z-[1] flex justify-center mb-2 transition-all duration-500 ${
            showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}>
            <div className="flex items-center gap-1 rounded-full bg-[var(--paper)]/20 px-3 py-1 text-sm font-medium backdrop-blur-sm">
              <ArrowUp className="h-4 w-4 animate-bounce" />
              <span>Niveau omhoog!</span>
            </div>
          </div>

          {/* Level number counter */}
          <div className={`relative z-[1] transition-all duration-700 delay-200 ${
            showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}>
            <p className="text-5xl font-black tabular-nums" data-testid="level-up-number">
              <AnimatedNumber from={oldLevel} to={newLevel} />
            </p>
            <p className="mt-1 text-lg font-semibold text-white/90" data-testid="level-up-name">
              {levelInfo.name}
            </p>
            <p className="text-sm text-white/70" data-testid="level-up-name-nl">
              {levelInfo.nameNl}
            </p>
          </div>

          {/* Animated rings keyframes */}
          <style>{`
            @keyframes level-ring-expand-1 {
              0% { transform: scale(0.5); opacity: 0.6; }
              100% { transform: scale(1.4); opacity: 0; }
            }
            @keyframes level-ring-expand-2 {
              0% { transform: scale(0.4); opacity: 0.4; }
              100% { transform: scale(1.6); opacity: 0; }
            }
            @keyframes level-ring-expand-3 {
              0% { transform: scale(0.3); opacity: 0.3; }
              100% { transform: scale(1.8); opacity: 0; }
            }
            @keyframes level-icon-pulse {
              0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255,0.4); }
              50% { transform: scale(1.05); box-shadow: 0 0 20px 8px rgba(255,255,255,0.2); }
            }
            .animate-level-ring-1 {
              animation: level-ring-expand-1 2s ease-out infinite;
            }
            .animate-level-ring-2 {
              animation: level-ring-expand-2 2.5s ease-out infinite;
              animation-delay: 0.3s;
            }
            .animate-level-ring-3 {
              animation: level-ring-expand-3 3s ease-out infinite;
              animation-delay: 0.6s;
            }
            .animate-level-icon-pulse {
              animation: level-icon-pulse 2s ease-in-out infinite;
            }
          `}</style>
        </div>

        {/* Body: level transition info */}
        <div className={`px-6 py-5 transition-all duration-500 delay-300 ${
          showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`} data-testid="level-up-body">
          {/* Old → New level badges */}
          <div className="flex items-center justify-center gap-3 mb-4" data-testid="level-up-transition">
            <div className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2">
              <span className="text-lg">{oldLevelInfo.icon}</span>
              <div>
                <p className="text-xs text-[var(--ink-3)]">Was</p>
                <p className="text-sm font-semibold text-[var(--ink-2)]">Lvl {oldLevel}</p>
              </div>
            </div>
            <div className="flex items-center">
              <Zap className={`h-5 w-5 ${colors.text} animate-pulse`} />
            </div>
            <div className={`flex items-center gap-2 rounded-lg bg-gradient-to-r ${colors.gradient} px-3 py-2 text-white`}>
              <span className="text-lg">{levelInfo.icon}</span>
              <div>
                <p className="text-xs text-white/70">Nu</p>
                <p className="text-sm font-bold">Lvl {newLevel}</p>
              </div>
            </div>
          </div>

          {/* Motivational message */}
          <div className="text-center">
            <p className="text-sm text-[var(--ink-2)] leading-relaxed">
              Je soevereiniteitsniveau is gestegen! Blijf bouwen aan je financiële vrijheid.
            </p>
          </div>
        </div>

        {/* Footer: dismiss button */}
        <div className="border-t border-[var(--border-ed)] px-6 py-4">
          <button
            data-testid="level-up-dismiss"
            onClick={handleDismiss}
            className={`w-full rounded-lg bg-gradient-to-r ${colors.gradient} px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90`}
          >
            Verder
          </button>
        </div>
      </div>
    </div>
  )
}
