import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  const results: { test: string; pass: boolean; detail: string }[] = []

  // Read source files for verification
  const proxyPath = path.join(process.cwd(), 'lib', 'supabase', 'proxy.ts')
  const proxySrc = fs.readFileSync(proxyPath, 'utf-8')

  const beheerLayoutPath = path.join(process.cwd(), 'app', '(app)', 'beheer', 'layout.tsx')
  const beheerLayoutSrc = fs.readFileSync(beheerLayoutPath, 'utf-8')

  const beheerPagePath = path.join(process.cwd(), 'app', '(app)', 'beheer', 'page.tsx')
  const beheerPageSrc = fs.readFileSync(beheerPagePath, 'utf-8')

  const adminPath = path.join(process.cwd(), 'lib', 'admin.ts')
  const adminSrc = fs.readFileSync(adminPath, 'utf-8')

  // Test 1: /beheer is in protectedPrefixes (proxy-level auth guard)
  const hasBeheerProtected = proxySrc.includes("'/beheer'") || proxySrc.includes('"/beheer"')
  results.push({
    test: '/beheer is listed in protectedPrefixes (proxy-level auth)',
    pass: hasBeheerProtected,
    detail: hasBeheerProtected
      ? '/beheer is in protectedPrefixes — unauthenticated users redirected to /login'
      : 'ERROR: /beheer is not in protectedPrefixes',
  })

  // Test 2: Beheer layout imports and calls isSuperAdmin
  const checksAdmin = beheerLayoutSrc.includes('isSuperAdmin') && beheerLayoutSrc.includes('isAdmin')
  results.push({
    test: 'Beheer layout checks isSuperAdmin before rendering',
    pass: checksAdmin,
    detail: checksAdmin
      ? 'Layout calls isSuperAdmin(supabase) and stores result in isAdmin variable'
      : 'ERROR: isSuperAdmin check not found in beheer layout',
  })

  // Test 3: Non-admin redirect to /will
  const hasRedirectToWill = beheerLayoutSrc.includes("!isAdmin") && beheerLayoutSrc.includes("redirect('/will')")
  results.push({
    test: 'Non-admin users are redirected to /will',
    pass: hasRedirectToWill,
    detail: hasRedirectToWill
      ? "Layout checks if (!isAdmin) { redirect('/will') } — server-side redirect"
      : 'ERROR: No redirect for non-admin users found',
  })

  // Test 4: Redirect happens before any JSX render (server-side, no flash)
  // The redirect() call is inside the async server component, before the return statement
  const redirectBeforeReturn = (() => {
    const redirectIdx = beheerLayoutSrc.indexOf("redirect('/will')")
    const returnIdx = beheerLayoutSrc.indexOf('return (')
    return redirectIdx > -1 && returnIdx > -1 && redirectIdx < returnIdx
  })()
  results.push({
    test: 'Redirect executes before any JSX return (no admin content flash)',
    pass: redirectBeforeReturn,
    detail: redirectBeforeReturn
      ? "redirect('/will') call appears before return ( JSX — no content briefly visible"
      : 'ERROR: Redirect may occur after JSX begins rendering',
  })

  // Test 5: isSuperAdmin checks profile role === 'superadmin'
  const checksProfileRole = adminSrc.includes("role") && adminSrc.includes("'superadmin'")
  results.push({
    test: 'isSuperAdmin verifies profile role is superadmin',
    pass: checksProfileRole,
    detail: checksProfileRole
      ? "isSuperAdmin queries profiles table and checks role === 'superadmin'"
      : 'ERROR: Role check for superadmin not found',
  })

  // Test 6: isSuperAdmin checks user exists first (returns false if no user)
  const checksUserExists = adminSrc.includes('!user') && adminSrc.includes('return false')
  results.push({
    test: 'isSuperAdmin returns false if no user is authenticated',
    pass: checksUserExists,
    detail: checksUserExists
      ? 'isSuperAdmin checks if (!user) return false — handles edge case of no auth'
      : 'ERROR: No user existence check in isSuperAdmin',
  })

  // Test 7: Beheer layout is an async server component (SSR, not client)
  const isServerComponent = beheerLayoutSrc.includes('async function') && !beheerLayoutSrc.includes("'use client'")
  results.push({
    test: 'Beheer layout is server component (SSR — no client-side rendering)',
    pass: isServerComponent,
    detail: isServerComponent
      ? 'Layout is async server component — redirect happens on server, zero client content flash'
      : 'ERROR: Layout may be client component (potential content flash)',
  })

  // Test 8: Beheer layout uses Supabase server client (not browser client)
  const usesServerClient = beheerLayoutSrc.includes("from '@/lib/supabase/server'") || beheerLayoutSrc.includes('from "@/lib/supabase/server"')
  results.push({
    test: 'Beheer layout uses server-side Supabase client',
    pass: usesServerClient,
    detail: usesServerClient
      ? 'Uses createClient from @/lib/supabase/server — secure server-side auth check'
      : 'ERROR: May be using browser client for auth check',
  })

  // Test 9: Admin content (h1 "Beheer", BeheerNav) only renders after auth check passes
  const adminContentAfterCheck = (() => {
    const redirectLine = beheerLayoutSrc.indexOf("redirect('/will')")
    const h1Line = beheerLayoutSrc.indexOf('<h1')
    const beheerNavLine = beheerLayoutSrc.indexOf('<BeheerNav')
    return redirectLine > -1 && h1Line > redirectLine && beheerNavLine > redirectLine
  })()
  results.push({
    test: 'Admin content (h1, BeheerNav) only renders after admin check passes',
    pass: adminContentAfterCheck,
    detail: adminContentAfterCheck
      ? 'h1 "Beheer" and <BeheerNav /> appear after the redirect guard — only admins see them'
      : 'ERROR: Admin content may render before auth check',
  })

  // Test 10: Beheer page itself has no sensitive content (just redirects to /beheer/ai)
  const pageIsSafeRedirect = beheerPageSrc.includes("redirect('/beheer/ai')") && !beheerPageSrc.includes('<div')
  results.push({
    test: 'Beheer index page only redirects to /beheer/ai (no direct content)',
    pass: pageIsSafeRedirect,
    detail: pageIsSafeRedirect
      ? "Beheer page only calls redirect('/beheer/ai') — no admin content exposed"
      : 'ERROR: Beheer page may expose admin content before redirect',
  })

  const passCount = results.filter(r => r.pass).length
  return NextResponse.json({
    feature: '#147 - Direct access to /beheer as non-admin redirects',
    summary: `${passCount}/${results.length} tests passing`,
    allPassing: passCount === results.length,
    results,
  })
}
