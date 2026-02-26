'use client'

import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

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
  /** Delay in ms before hasEntered triggers. Use 300 for modal/BottomSheet context. */
  triggerDelay?: number
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
  duration = 800,
  shimmerOnComplete = false,
  className = '',
  triggerDelay,
  'data-testid': testId,
}: AnimatedProgressBarProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
  const { ref: inViewRef, hasEntered, animationComplete } = useInViewAnimation({ duration, triggerDelay })

  const isComplete = percentage >= 100
  const showShimmer = shimmerOnComplete && isComplete && (!animateOnMount || animationComplete)

  return (
    <div
      ref={inViewRef}
      className={`overflow-hidden rounded-full bg-zinc-100 ${heightClass} ${className}`}
      data-testid={testId}
      data-progress={percentage}
    >
      <div
        className={`${heightClass} rounded-full ${colorClass} relative ${
          showShimmer ? 'animate-progress-shimmer' : ''
        }`}
        style={{
          width: animateOnMount ? (hasEntered ? `${percentage}%` : '0%') : `${percentage}%`,
          transition: animateOnMount && hasEntered
            ? `width ${duration}ms cubic-bezier(.22,1,.36,1)`
            : 'none',
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
