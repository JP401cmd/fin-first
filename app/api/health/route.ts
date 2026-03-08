import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const url = new URL(request.url)
    const persistenceTest = url.searchParams.get('persistence_test')

    // Test the database connection with a simple query
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .limit(1)

    if (error) {
      return NextResponse.json(
        {
          status: 'error',
          database: 'disconnected',
          supabase: 'error',
          error: error.message,
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      )
    }

    // If persistence_test is requested, verify app_settings table persistence
    let persistence = undefined
    if (persistenceTest) {
      // Write a test setting and read it back to verify DB persistence
      const testKey = `_health_check_${persistenceTest}`

      // Try to read an existing test value
      const { data: existing } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', testKey)
        .maybeSingle()

      if (existing) {
        persistence = {
          status: 'verified',
          key: testKey,
          value: existing.value,
          message: 'Data persists from previous write',
        }
      } else {
        // Write a new test value
        const testValue = { written_at: new Date().toISOString(), server_pid: process.pid }
        const { error: writeError } = await supabase
          .from('app_settings')
          .upsert({ key: testKey, value: testValue })

        persistence = {
          status: writeError ? 'write_failed' : 'written',
          key: testKey,
          value: testValue,
          error: writeError?.message,
          message: writeError
            ? `Write failed: ${writeError.message}`
            : 'Test value written. Restart server and query again to verify persistence.',
        }
      }
    }

    return NextResponse.json(
      {
        status: 'healthy',
        database: 'connected',
        supabase: 'connected',
        persistence,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      {
        status: 'error',
        database: 'disconnected',
        supabase: 'error',
        error: message,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    )
  }
}
