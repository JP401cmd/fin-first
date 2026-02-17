'use client'

import { useState, useEffect, useRef } from 'react'

type AnimatedProgressBarProps = {
  /** Progress value 0-100 */
  value: number
  /** Maximum value (default 100) */
  max?: number
  /** CSS class for the bar fill color (e.g., 'bg-teal-500') */
  colorClass?: string
  /** Height class (e.g., 'h-2', 'h-3') */
  heightClass?: string
  /** Whether to animate on mount */
  animateOnMount?: boolean
  /** Animation duration in ms */
  duration?: number
  /** Show shimmer effect on completion */
  shimmerOnComplete?: boolean
  /** Additional className for the container */
  className?: string
  /** data-testid for testing */
  'data-testid'?: string
}

export function AnimatedProgressBar({
  value,
  max = 100,
  colorClass = 'bg-teal-500',
  heightClass = 'h-2',
  animateOnMount = true,
  duration = 1200,
  shimmerOnComplete = false,
  className = '',
  'data-testid': testId,
}: AnimatedProgressBarProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
  const [displayWidth, setDisplayWidth] = useState(animateOnMount ? 0 : percentage)
  const [hasAnimated, setHasAnimated] = useState(!animateOnMount)
  const prevValueRef = useRef(animateOnMount ? 0 : percentage)
  const containerRef = useRef<HTMLDivElement>(null)

  // Observe when element enters viewport to trigger animation
  useEffect(() => {
    if (!animateOnMount || hasAnimated) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated) {
            setHasAnimated(true)
            animateTo(percentage)
          }
        })
      },
      { threshold: 0.1 }
    )

    const el = containerRef.current
    if (el) observer.observe(el)
    return () => { if (el) observer.unobserve(el) }
  }, [animateOnMount, hasAnimated, percentage])

  // Animate on value change
  useEffect(() => {
    if (!hasAnimated) return
    if (prevValueRef.current !== percentage) {
      animateTo(percentage)
      prevValueRef.current = percentage
    }
  }, [percentage, hasAnimated])

  function animateTo(target: number) {
    const start = displayWidth
    const startTime = Date.now()
    const step = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease out quart for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 4)
      setDisplayWidth(start + (target - start) * eased)
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  const isComplete = percentage >= 100
  const showShimmer = shimmerOnComplete && isComplete

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden rounded-full bg-zinc-100 ${heightClass} ${className}`}
      data-testid={testId}
      data-progress={percentage}
    >
      <div
        className={`${heightClass} rounded-full transition-colors ${colorClass} relative ${
          showShimmer ? 'animate-progress-shimmer' : ''
        }`}
        style={{
          width: `${displayWidth}%`,
          transition: hasAnimated ? 'none' : undefined,
        }}
        data-testid={testId ? `${testId}-fill` : undefined}
      >
        {/* Shimmer overlay for completed bars */}
        {showShimmer && (
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <div className="absolute inset-0 animate-shimmer-sweep bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          </div>
        )}
      </div>

      <style>{`
        @keyframes progress-shimmer {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.15); }
        }
        .animate-progress-shimmer {
          animation: progress-shimmer 2s ease-in-out infinite;
        }
        @keyframes shimmer-sweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .animate-shimmer-sweep {
          animation: shimmer-sweep 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
