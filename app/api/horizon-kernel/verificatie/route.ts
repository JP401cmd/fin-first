import { NextResponse } from 'next/server'
import path from 'node:path'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { runVerification } from '@/lib/horizon-kernel-report/engine-parity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Horizon-kernel · beheer-transparantie — VERIFICATIE.
 *
 * Superadmin-gegate, alleen-lezen. Draait de integrale engine per Excel-oracle-
 * fixture en vergelijkt elke geporte maandtabel cel-voor-cel (€0,01) met de
 * fixture-sheet — dezelfde vergelijking als de bewaakte parity-suite. Levert per
 * fixture per tabel groen/rood + max |Δ| + celtelling + de bron-herkomst.
 *
 * Node-only (leest de fixtures via de oracle-loader). ~19 fixtures × 1 engine-run
 * elk — enkele seconden.
 */
export async function GET() {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  }

  const fixtureDir = path.resolve(process.cwd(), 'test', 'fixtures', 'horizon-oracle')

  try {
    const report = runVerification(fixtureDir)
    if (report.fixtureCount === 0) {
      return NextResponse.json({
        ok: false,
        reason:
          'Geen oracle-fixtures gevonden op de server (test/fixtures/horizon-oracle). ' +
          'De verificatie draait alleen waar de fixtures beschikbaar zijn.',
      })
    }
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      reason: err instanceof Error ? err.message : 'Verificatie kon niet draaien.',
    })
  }
}
