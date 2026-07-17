import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { forbidden } from '@/lib/api/respond'
import { isSuperAdmin } from '@/lib/admin'
import { runKernelProjection } from '@/lib/horizon-kernel'
import { buildKernelInputFromApp } from '@/lib/horizon-kernel/adapter'
import { loadKernelReportInput } from '@/lib/horizon-kernel-report/load-input'
import { serializeTable } from '@/lib/horizon-kernel-report/table-columns'
import { findKernelTableMeta, type KernelTableId } from '@/lib/horizon-kernel-report/table-meta'

/**
 * Horizon-kernel · beheer-transparantie — TABEL op afroep.
 *
 * Superadmin-gegate, alleen-lezen. Draait de projectie één keer (`runKernelProjection`
 * op de door de overzicht-call gevonden `fireAge` — één engine-run, geen bisectie)
 * en serialiseert precies één tabel voor het gevraagde bereik/de gevraagde kolommen.
 * Zo blijft de payload klein: nooit alle 11 tabellen × 1200 rijen ineens.
 *
 * Query: `?tabel=<id>&fireAge=<n>&modus=jaar|maand&van=<m>&tot=<m>&kolommen=kern|alle`
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const sp = req.nextUrl.searchParams
  const id = sp.get('tabel') as KernelTableId | null
  const meta = id ? findKernelTableMeta(id) : undefined
  if (!id || !meta) {
    return NextResponse.json({ error: 'Onbekende tabel' }, { status: 400 })
  }

  const fireAge = Number(sp.get('fireAge'))
  if (!Number.isFinite(fireAge)) {
    return NextResponse.json({ error: 'Ongeldige fireAge' }, { status: 400 })
  }

  const modus = sp.get('modus') === 'maand' ? 'maand' : 'jaar'
  const vanRaw = sp.get('van')
  const totRaw = sp.get('tot')
  const van = vanRaw !== null ? Number(vanRaw) : undefined
  const tot = totRaw !== null ? Number(totRaw) : undefined
  const kolommen = sp.get('kolommen') === 'alle' ? 'alle' : 'kern'

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

  const kernelInput = buildKernelInputFromApp(loaded.adapterInput)
  const projection = runKernelProjection(kernelInput, { fireAge })

  const grid = serializeTable(id, projection, {
    modus,
    van: van !== undefined && Number.isFinite(van) ? van : undefined,
    tot: tot !== undefined && Number.isFinite(tot) ? tot : undefined,
    onlyLetters: kolommen === 'kern' ? meta.kernLetters : undefined,
  })

  return NextResponse.json({ ok: true, grid })
}
