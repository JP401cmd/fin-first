export function SpeechBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative max-w-[85%] border-l-3 border-wil-400 bg-[var(--subtle)] px-4 py-3 sm:max-w-none sm:px-5 sm:py-4">
      <div className="font-serif text-sm leading-relaxed text-[var(--ink-2)]">
        {children}
      </div>
    </div>
  )
}

export function SpeechBubbleCentered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[85%] border-y border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-3 sm:max-w-none sm:px-5 sm:py-4">
      <div className="font-serif text-center text-sm leading-relaxed text-[var(--ink-2)]">
        {children}
      </div>
    </div>
  )
}
