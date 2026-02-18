export function SpeechBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl border border-teal-200 bg-teal-50/60 px-5 py-4 text-sm text-zinc-700">
      {/* Arrow pointing left */}
      <div className="absolute top-5 -left-2 h-3 w-3 rotate-45 border-b border-l border-teal-200 bg-teal-50/60" />
      {children}
    </div>
  )
}

export function SpeechBubbleCentered({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-teal-200 bg-teal-50/60 px-5 py-4 text-sm text-zinc-700">
      {children}
    </div>
  )
}
