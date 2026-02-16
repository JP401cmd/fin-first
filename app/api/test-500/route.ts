import { NextResponse } from 'next/server'

/**
 * GET /api/test-500 — Deliberately returns a 500 error to test error handling.
 *
 * Query params:
 *   ?type=json     — Returns a JSON error response (default)
 *   ?type=throw    — Throws an unhandled exception
 *   ?type=details  — Returns error with technical details (to verify they are filtered)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') ?? 'json'

  switch (type) {
    case 'throw':
      // Simulate unhandled server exception
      throw new Error('Simulated unhandled server exception for testing')

    case 'details':
      // Return error with stack-trace-like details (should be filtered by client)
      return NextResponse.json(
        {
          error: 'Database connection failed',
          stack: 'Error: ECONNREFUSED at PostgresDriver.connect (/app/node_modules/pg/lib/client.js:132:19)',
          code: 'ECONNREFUSED',
          detail: 'at Object.<anonymous> (/app/lib/db.ts:45:12)\n    at Module._compile',
        },
        { status: 500 }
      )

    case 'json':
    default:
      // Standard JSON 500 error
      return NextResponse.json(
        { error: 'Er is een serverfout opgetreden' },
        { status: 500 }
      )
  }
}
