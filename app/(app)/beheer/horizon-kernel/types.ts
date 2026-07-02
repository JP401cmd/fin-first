import type { CellValue } from '@/lib/horizon-kernel/oracle/fixture-types'
import type { KernelInput } from '@/lib/horizon-kernel'
import type { KernelRunSummary } from '@/lib/horizon-kernel'
import type { ColKind } from '@/lib/horizon-kernel-report/table-columns'
import type { RawInputSummary } from '@/lib/horizon-kernel-report/load-input'
import type { VerifReport } from '@/lib/horizon-kernel-report/engine-parity'

export type { RawInputSummary, VerifReport, KernelInput, KernelRunSummary, CellValue, ColKind }

export interface KernelNotice {
  readonly kind: 'skip' | 'overflow' | 'info'
  readonly eventId?: string
  readonly message: string
}

export interface SolverResult {
  readonly fireAge: number
  readonly eindleeftijd: number
  readonly doelbedrag: number
  readonly modelwaarde: number
  readonly gap: number
  readonly status: 'reached_now' | 'reached_at' | 'unreachable_within_horizon' | 'pension_shortfall'
  readonly maandHint: number
  readonly tekortLeningTotEindleeftijd: number
  readonly engineRuns: number
}

/** Antwoord van `GET /api/horizon-kernel` (overzicht). */
export interface OverviewResponse {
  readonly ok: boolean
  readonly reason?: string
  readonly raw?: RawInputSummary
  readonly kernelInput?: KernelInput
  readonly notices?: KernelNotice[]
  readonly solver?: SolverResult
  readonly summary?: KernelRunSummary
}

export interface SerializedGridDTO {
  readonly id: string
  readonly columns: ReadonlyArray<{ letter: string; label: string; kind: ColKind }>
  readonly rows: CellValue[][]
  readonly totalMonths: number
  readonly returnedRows: number
}

export interface TableResponse {
  readonly ok: boolean
  readonly reason?: string
  readonly grid?: SerializedGridDTO
}

export interface VerificationResponse {
  readonly ok: boolean
  readonly reason?: string
  readonly report?: VerifReport
}
