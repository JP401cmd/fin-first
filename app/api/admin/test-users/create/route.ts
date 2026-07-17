import { NextResponse } from 'next/server'
import { forbidden, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/admin'
import { TEST_USER_ACCOUNTS } from '@/lib/test-personas'

/** POST — create test users via Supabase Admin API (GoTrue) */
export async function POST() {
  try {
    const supabase = await createClient()
    if (!(await isSuperAdmin(supabase))) {
      return forbidden()
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

    // Besloten testfase (ADR 0047, AC6): borg dat elk testpersona-adres op de
    // allowlist staat vóór aanmaak. Mocht de before_user_created-hook óók bij
    // admin-createUser vuren, dan is het adres al gelijst en wordt de aanmaak
    // niet geweigerd; vuurt de hook niet, dan is dit een goedaardige no-op.
    // Genormaliseerd identiek aan de hook (lower(trim)); on conflict do nothing.
    const allowlistRows = TEST_USER_ACCOUNTS.map((u) => ({
      email_normalized: u.email.toLowerCase(),
      label: 'Test-persona (auto)',
    }))
    const { error: allowlistError } = await service
      .from('signup_email_allowlist')
      .upsert(allowlistRows, { onConflict: 'email_normalized', ignoreDuplicates: true })
    if (allowlistError) {
      // Niet fataal: ontbreekt de tabel (bv. lokale dev zonder migratie), dan
      // gaat de aanmaak gewoon door — de allowlist-hook is daar toch niet actief.
      console.error('[admin-test-users-create:allowlist]', allowlistError.message)
    }

    const results: { email: string; status: string; error?: string }[] = []

    for (const u of TEST_USER_ACCOUNTS) {
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
    return serverError(e, 'admin-test-users-create:POST')
  }
}
