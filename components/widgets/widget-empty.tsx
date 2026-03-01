import type { LucideIcon } from 'lucide-react'

interface WidgetEmptyProps {
  icon: LucideIcon
  message: string
}

export function WidgetEmpty({ icon: Icon, message }: WidgetEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-4">
      <Icon className="h-5 w-5 text-[var(--ink-4)]" strokeWidth={1.5} />
      <p className="font-serif italic text-[13px] text-[var(--ink-3)] text-center leading-relaxed">
        {message}
      </p>
    </div>
  )
}
