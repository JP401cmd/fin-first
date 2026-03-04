'use client'

export function BriefingComposingIndicator() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex gap-1">
        <span className="h-2 w-2 rounded-full bg-wil-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="h-2 w-2 rounded-full bg-wil-400 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="h-2 w-2 rounded-full bg-wil-400 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <p className="text-sm text-[var(--ink-3)]">Will stelt je briefing samen...</p>
    </div>
  )
}
