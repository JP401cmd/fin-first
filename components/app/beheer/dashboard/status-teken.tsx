import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  History,
  Info,
  Loader2,
  MinusCircle,
  Unplug,
  type LucideIcon,
} from 'lucide-react'
import {
  ERNST_META,
  MEET_STATUS_META,
  statusToon,
  type Ernst,
  type MeetStatus,
} from '@/lib/beheer/dashboard/status'
import { TOON_KLASSEN } from './opmaak'

/**
 * De toestand van een indicator, altijd als icoon plus tekst. Kleur is nooit
 * de enige drager (WCAG 1.4.1): elk teken leest ook in grijstinten.
 */

const STATUS_ICOON: Record<MeetStatus, LucideIcon> = {
  gezond: CheckCircle2,
  afwijkend: AlertTriangle,
  'geen-gegevens': CircleDashed,
  verouderd: History,
  'meting-mislukt': Unplug,
  nvt: MinusCircle,
}

const ERNST_ICOON: Record<Ernst, LucideIcon> = {
  kritiek: AlertOctagon,
  hoog: AlertTriangle,
  middel: AlertCircle,
  laag: Info,
}

const LABEL_KLASSEN =
  'inline-flex items-center gap-1.5 whitespace-nowrap px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]'

export function StatusTeken({ status, ernst = null }: { status: MeetStatus; ernst?: Ernst | null }) {
  const Icoon = status === 'afwijkend' && ernst ? ERNST_ICOON[ernst] : STATUS_ICOON[status]
  const meta = MEET_STATUS_META[status]
  const toon = TOON_KLASSEN[statusToon(status, ernst)]
  const label = status === 'afwijkend' && ernst ? `${meta.label} · ${ERNST_META[ernst].label.toLowerCase()}` : meta.label
  return (
    <span className={`${LABEL_KLASSEN} ${toon.chip}`} title={meta.betekenis} data-status={status}>
      <Icoon aria-hidden className="h-3 w-3 shrink-0" />
      {label}
    </span>
  )
}

export function ErnstTeken({ ernst }: { ernst: Ernst }) {
  const Icoon = ERNST_ICOON[ernst]
  const meta = ERNST_META[ernst]
  const toon = TOON_KLASSEN[statusToon('afwijkend', ernst)]
  return (
    <span className={`${LABEL_KLASSEN} ${toon.chip}`} title={meta.betekenis} data-ernst={ernst}>
      <Icoon aria-hidden className="h-3 w-3 shrink-0" />
      {meta.label}
    </span>
  )
}

/** De toestand van het scherm zelf, terwijl een sectie nog leest. */
export function LadenTeken({ wat }: { wat: string }) {
  return (
    <span className={`${LABEL_KLASSEN} ${TOON_KLASSEN.neutral.chip}`} role="status">
      <Loader2 aria-hidden className="h-3 w-3 shrink-0 motion-safe:animate-spin" />
      {wat} laden
    </span>
  )
}
