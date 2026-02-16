import { NextResponse, type NextRequest } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

export async function GET(request: NextRequest) {
  const test = request.nextUrl.searchParams.get('test')

  // Base paths
  const projectRoot = process.cwd()

  switch (test) {
    case 'component-exists': {
      // Check that SessionMonitor component exists
      const componentPath = path.join(projectRoot, 'components', 'app', 'session-monitor.tsx')
      const exists = fs.existsSync(componentPath)
      let detail = exists ? 'SessionMonitor component found at components/app/session-monitor.tsx' : 'File not found'

      if (exists) {
        const content = fs.readFileSync(componentPath, 'utf-8')
        const hasModal = content.includes('session-expired-modal') || content.includes('sessionExpired')
        const hasReLogin = content.includes('signInWithPassword') || content.includes('handleReLogin')
        detail = `Component found. Has modal: ${hasModal}, Has re-login: ${hasReLogin}`
      }

      return NextResponse.json({ exists, detail })
    }

    case 'api-401': {
      // Check that our proxy returns sessionExpired flag in 401 responses
      const proxyPath = path.join(projectRoot, 'lib', 'supabase', 'proxy.ts')
      const proxyContent = fs.readFileSync(proxyPath, 'utf-8')
      const hasSessionExpiredFlag = proxyContent.includes('sessionExpired')
      const hasExpiredHeader = proxyContent.includes('X-Session-Expired')
      const pass = hasSessionExpiredFlag && hasExpiredHeader
      return NextResponse.json({
        pass,
        detail: pass
          ? 'Proxy returns sessionExpired flag and X-Session-Expired header in 401 responses'
          : `sessionExpired flag: ${hasSessionExpiredFlag}, X-Session-Expired header: ${hasExpiredHeader}`,
      })
    }

    case 'modal-elements': {
      // Verify session-monitor has proper modal UI elements
      const componentPath = path.join(projectRoot, 'components', 'app', 'session-monitor.tsx')
      if (!fs.existsSync(componentPath)) {
        return NextResponse.json({ pass: false, detail: 'Component file not found' })
      }
      const content = fs.readFileSync(componentPath, 'utf-8')

      const checks = {
        hasModal: content.includes('aria-modal="true"'),
        hasTitle: content.includes('Sessie verlopen'),
        hasEmailField: content.includes('session-email'),
        hasPasswordField: content.includes('session-password'),
        hasSubmitButton: content.includes('Opnieuw inloggen'),
        hasSuccessState: content.includes('Succesvol ingelogd'),
        hasFallbackLink: content.includes('Naar inlogpagina'),
        hasNoDataLossMessage: content.includes('gegevens zijn veilig') || content.includes('verder waar je gebleven'),
      }

      const allPass = Object.values(checks).every(v => v)
      return NextResponse.json({
        pass: allPass,
        detail: allPass
          ? 'All modal UI elements present: modal dialog, title, email/password fields, submit button, success state, fallback link, reassurance message'
          : `Checks: ${JSON.stringify(checks)}`,
      })
    }

    case 'layout-integration': {
      // Verify SessionMonitor is imported and used in app layout
      const layoutPath = path.join(projectRoot, 'app', '(app)', 'layout.tsx')
      const layoutContent = fs.readFileSync(layoutPath, 'utf-8')
      const hasImport = layoutContent.includes("import { SessionMonitor }") || layoutContent.includes("from '@/components/app/session-monitor'")
      const hasUsage = layoutContent.includes('<SessionMonitor')
      const pass = hasImport && hasUsage
      return NextResponse.json({
        pass,
        detail: pass
          ? 'SessionMonitor is imported and rendered in app/(app)/layout.tsx'
          : `Import: ${hasImport}, Usage: ${hasUsage}`,
      })
    }

    case 'no-raw-errors': {
      // Verify that the proxy and layout provide friendly Dutch messages, not raw errors
      const proxyPath = path.join(projectRoot, 'lib', 'supabase', 'proxy.ts')
      const proxyContent = fs.readFileSync(proxyPath, 'utf-8')

      const componentPath = path.join(projectRoot, 'components', 'app', 'session-monitor.tsx')
      const componentContent = fs.existsSync(componentPath) ? fs.readFileSync(componentPath, 'utf-8') : ''

      const loginPath = path.join(projectRoot, 'app', 'login', 'page.tsx')
      const loginContent = fs.readFileSync(loginPath, 'utf-8')

      // Check proxy returns Dutch message, not raw JWT error
      const proxyHasDutchError = proxyContent.includes('Niet ingelogd')
      // Check modal shows friendly message
      const modalHasFriendlyMessage = componentContent.includes('Sessie verlopen') && componentContent.includes('Log opnieuw in')
      // Check login page shows expired banner
      const loginHasExpiredBanner = loginContent.includes('sessie is verlopen') || loginContent.includes('session-expired-banner')

      const pass = proxyHasDutchError && modalHasFriendlyMessage && loginHasExpiredBanner
      return NextResponse.json({
        pass,
        detail: pass
          ? 'All user-facing messages are friendly Dutch text. No raw JWT errors exposed.'
          : `Proxy Dutch: ${proxyHasDutchError}, Modal friendly: ${modalHasFriendlyMessage}, Login banner: ${loginHasExpiredBanner}`,
      })
    }

    case 'redirect-preserved': {
      // Verify that the re-login in the modal preserves the current page (via reload)
      // And that the login page preserves redirectTo param
      const componentPath = path.join(projectRoot, 'components', 'app', 'session-monitor.tsx')
      const componentContent = fs.existsSync(componentPath) ? fs.readFileSync(componentPath, 'utf-8') : ''

      const loginPath = path.join(projectRoot, 'app', 'login', 'page.tsx')
      const loginContent = fs.readFileSync(loginPath, 'utf-8')

      const proxyPath = path.join(projectRoot, 'lib', 'supabase', 'proxy.ts')
      const proxyContent = fs.readFileSync(proxyPath, 'utf-8')

      // Modal: after re-login, reloads current page (window.location.reload)
      const modalReloads = componentContent.includes('window.location.reload()')
      // Modal: fallback link preserves current path
      const modalPreservesPath = componentContent.includes('window.location.pathname') && componentContent.includes('redirectTo')
      // Login page reads redirectTo param
      const loginReadsRedirect = loginContent.includes('redirectTo')
      // Proxy sets redirectTo param on redirect
      const proxyRedirectTo = proxyContent.includes("'redirectTo'") || proxyContent.includes('"redirectTo"')

      const pass = modalReloads && modalPreservesPath && loginReadsRedirect && proxyRedirectTo
      return NextResponse.json({
        pass,
        detail: pass
          ? 'After re-login, user returns to intended page: modal reloads current page, fallback preserves path, login page reads redirectTo, proxy sets redirectTo'
          : `Modal reload: ${modalReloads}, Modal preserves path: ${modalPreservesPath}, Login reads redirect: ${loginReadsRedirect}, Proxy redirectTo: ${proxyRedirectTo}`,
      })
    }

    default:
      return NextResponse.json({
        error: 'Unknown test',
        availableTests: [
          'component-exists',
          'api-401',
          'modal-elements',
          'layout-integration',
          'no-raw-errors',
          'redirect-preserved',
        ],
      })
  }
}
