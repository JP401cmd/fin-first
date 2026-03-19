import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadAllTests, getCategories } from '@/lib/regression-tests/test-registry'

// ── GET /api/regression/categories ──────────────────────────────────────────
//
// Returns all registered test categories from the server-side test registry.
// The test suites import server-side modules (Supabase, etc.) that cannot load
// in the browser, so the category listing must happen on the server.

export async function GET() {
  // Guard: development only
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Regressietests zijn alleen beschikbaar in development modus.' },
      { status: 403 },
    )
  }

  // Guard: caller must be authenticated
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json(
        { error: 'Niet ingelogd.' },
        { status: 401 },
      )
    }
  } catch {
    return NextResponse.json(
      { error: 'Authenticatie controle mislukt.' },
      { status: 401 },
    )
  }

  // Load all test suites and return categories
  await loadAllTests()
  const categories = getCategories()

  return NextResponse.json({ categories })
}
