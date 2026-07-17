import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { forbidden } from '@/lib/api/respond'
import { isSuperAdmin } from '@/lib/admin'
import { solveFire } from '@/lib/horizon-kernel'
import { buildKernelInputFromAppWithNotices } from '@/lib/horizon-kernel/adapter'
import { loadKernelReportInput } from '@/lib/horizon-kernel-report/load-input'

/**
 * Horizon-kernel · beheer-transparantie — OVERZICHT.
 *
 * Superadmin-gegate, alleen-lezen. Laadt de eigen data, bouwt via de adapter de
 * `KernelInput` (met event-notices + defaults), draait `solveFire` en levert:
 * de ruwe-invoer-samenvatting, de geresolvede kern-invoer, de notices en het
 * solver-resultaat + samenvatting. De grote maandtabellen worden NIET hier
 * meegestuurd — die haalt de client per tabel/bereik op via `/tabel`.
 */
export async function GET() {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  let loaded
  try {
    loaded = await loadKernelReportInput(supabase)
  } catch (err) {
    return NextResponse.json({
      ok: false,
      // eslint-disable-next-line no-restricted-syntax -- rauwe error.message: zie [Arch F4] API-error-envelope
      reason: err instanceof Error ? err.message : 'Kon de invoer niet laden.',
    })
  }

  const { input: kernelInput, notices } = buildKernelInputFromAppWithNotices(loaded.adapterInput)
  const solver = solveFire(kernelInput)

  const { summary } = solver.projection

  return NextResponse.json({
    ok: true,
    raw: loaded.raw,
    kernelInput,
    notices,
    solver: {
      fireAge: solver.fireAge,
      eindleeftijd: solver.eindleeftijd,
      doelbedrag: solver.doelbedrag,
      modelwaarde: solver.modelwaarde,
      gap: solver.gap,
      status: solver.status,
      maandHint: solver.maandHint,
      tekortLeningTotEindleeftijd: solver.tekortLeningTotEindleeftijd,
      engineRuns: solver.engineRuns,
    },
    summary,
  })
}
