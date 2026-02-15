import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Dev-only login endpoint for automated testing.
 * POST /api/dev-login with { email, password }
 * Returns session cookies so browser can access protected pages.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const { email, password } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  return NextResponse.json({
    success: true,
    user: { id: data.user?.id, email: data.user?.email },
  })
}

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  return NextResponse.json({
    message: 'POST with { email, password } to login',
  })
}
