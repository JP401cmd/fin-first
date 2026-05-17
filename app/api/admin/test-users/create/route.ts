import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/admin'

const TEST_USERS = [
  { email: 'daan@test.trifinity.nl', persona: 'daan', name: 'Daan Bakker' },
  { email: 'lisa@test.trifinity.nl', persona: 'lisa', name: 'Lisa de Groot' },
  { email: 'willem@test.trifinity.nl', persona: 'willem', name: 'Willem Jansen' },
  { email: 'marijke@test.trifinity.nl', persona: 'marijke', name: 'Marijke Vermeer' },
]

/** POST — create test users via Supabase Admin API (GoTrue) */
export async function POST() {
  try {
    const supabase = await createClient()
    if (!(await isSuperAdmin(supabase))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      return NextResponse.json({
        error: 'SUPABASE_SERVICE_ROLE_KEY is niet geconfigureerd in de environment variables.',
      }, { status: 500 })
    }

    const service = createServiceClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const results: { email: string; status: string; error?: string }[] = []

    for (const u of TEST_USERS) {
      try {
        // Create via GoTrue Admin API
        const { data, error } = await service.auth.admin.createUser({
          email: u.email,
          password: 'Test2026!',
          email_confirm: true,
          user_metadata: {
            test_persona_key: u.persona,
            full_name: u.name,
          },
        })

        if (error) {
          // User might already exist
          if (error.message.includes('already been registered')) {
            results.push({ email: u.email, status: 'exists' })
          } else {
            results.push({ email: u.email, status: 'error', error: error.message })
          }
          continue
        }

        // Set full_name + ai tier on profile (handle_new_user trigger creates basic profile)
        if (data.user) {
          await service
            .from('profiles')
            .update({
              full_name: u.name,
              commercial_tier: 'ai',
              active_subscriptions: ['kern', 'wil', 'horizon', 'ai'],
            })
            .eq('id', data.user.id)
        }

        results.push({ email: u.email, status: 'created' })
      } catch (e) {
        results.push({ email: u.email, status: 'error', error: e instanceof Error ? e.message : 'Onbekende fout' })
      }
    }

    return NextResponse.json({ results })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Onbekende fout'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
