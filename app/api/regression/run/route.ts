import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { unauthorized, forbidden } from '@/lib/api/respond'
import { runServerTestSuite } from '@/lib/regression-tests/server-runner'
import type { TestResult } from '@/lib/regression-tests/test-types'

// ── POST /api/regression/run ─────────────────────────────────────────────────
//
// Streams regression test results as NDJSON (newline-delimited JSON).
// Each line is either:
//   - { type: 'result', data: TestResult }   — individual test outcome
//   - { type: 'report', data: TestReport }   — final summary (last line)
//
// Guards:
//   1. NODE_ENV must be 'development'
//   2. Caller must be authenticated (via Supabase server client)
//   3. REGRESSION_TEST_EMAIL and REGRESSION_TEST_PASSWORD must be set

export async function POST(request: Request) {
  // ── Guard: development only ────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'development') {
    return forbidden('Regressietests zijn alleen beschikbaar in development modus.')
  }

  // ── Guard: caller must be authenticated ────────────────────────────────
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return unauthorized('Niet ingelogd. Log eerst in om regressietests uit te voeren.')
    }
  } catch {
    return NextResponse.json(
      { error: 'Authenticatie controle mislukt.' },
      { status: 401 },
    )
  }

  // ── Guard: test account env vars ───────────────────────────────────────
  if (!process.env.REGRESSION_TEST_EMAIL || !process.env.REGRESSION_TEST_PASSWORD) {
    return NextResponse.json(
      {
        error:
          'Regressietest-account niet geconfigureerd. ' +
          'Stel REGRESSION_TEST_EMAIL en REGRESSION_TEST_PASSWORD in als server-side environment variabelen in .env.local.',
      },
      { status: 500 },
    )
  }

  // ── Parse request body ─────────────────────────────────────────────────
  let categories: string[] | undefined
  try {
    const body = await request.json().catch(() => ({}))
    if (body && Array.isArray(body.categories)) {
      categories = body.categories
    }
  } catch {
    // Empty body is fine — run all categories
  }

  // ── Stream results as NDJSON ───────────────────────────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const report = await runServerTestSuite(
          { categories },
          (result: TestResult) => {
            const line = JSON.stringify({ type: 'result', data: result }) + '\n'
            controller.enqueue(encoder.encode(line))
          },
        )

        // Send the final report
        const reportLine = JSON.stringify({ type: 'report', data: report }) + '\n'
        controller.enqueue(encoder.encode(reportLine))
        controller.close()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Onbekende fout bij uitvoeren van tests'
        const errorLine = JSON.stringify({ type: 'error', message }) + '\n'
        controller.enqueue(encoder.encode(errorLine))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
