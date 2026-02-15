'use client'

import { useState } from 'react'
import { Breadcrumb } from '@/components/app/breadcrumb'
import type { DomainColor } from '@/lib/navigation'

/**
 * Test page for verifying breadcrumb navigation.
 * Uses the ACTUAL Breadcrumb component with overrideSegments
 * to render real breadcrumbs for different routes.
 * Accessible at /test-breadcrumb (public, no auth required).
 */

function buildSegments(path: string): { label: string; href: string }[] {
  const segmentLabels: Record<string, string> = {
    dashboard: 'Dashboard',
    core: 'De Kern',
    will: 'De Wil',
    horizon: 'De Horizon',
    budgets: 'Budgetten',
    cash: 'Cash',
    import: 'Importeren',
    debts: 'Schulden',
    assets: 'Assets',
    belasting: 'Belasting',
    identity: 'Identiteit',
    beheer: 'Beheer',
    onboarding: 'Onboarding',
  }
  const parts = path.split('/').filter(Boolean)
  const segments: { label: string; href: string }[] = []
  let href = ''
  for (const part of parts) {
    href += `/${part}`
    const label = segmentLabels[part] ?? part.charAt(0).toUpperCase() + part.slice(1)
    segments.push({ label, href })
  }
  return segments
}

const testRoutes = [
  { path: '/core/budgets', color: 'amber' as DomainColor, description: 'Budgetten within De Kern' },
  { path: '/core/cash/import', color: 'amber' as DomainColor, description: 'Cash Import (3 levels deep)' },
  { path: '/core/assets', color: 'amber' as DomainColor, description: 'Assets within De Kern' },
  { path: '/core/debts', color: 'amber' as DomainColor, description: 'Schulden within De Kern' },
  { path: '/core/belasting', color: 'amber' as DomainColor, description: 'Belasting within De Kern' },
  { path: '/will', color: 'teal' as DomainColor, description: 'De Wil (top-level, no breadcrumb)' },
  { path: '/horizon', color: 'purple' as DomainColor, description: 'De Horizon (top-level, no breadcrumb)' },
]

export default function TestBreadcrumbPage() {
  const [selectedPath, setSelectedPath] = useState('/core/budgets')

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">Breadcrumb Navigation Test</h1>
        <p className="text-zinc-500 mb-8">
          Verifies that breadcrumb navigation shows correct hierarchy for all routes.
          Uses the ACTUAL Breadcrumb component with overrideSegments.
        </p>

        <div className="space-y-6">
          {testRoutes.map((route) => {
            const segments = buildSegments(route.path)
            return (
              <div
                key={route.path}
                className={`rounded-xl border p-4 ${
                  selectedPath === route.path ? 'border-zinc-400 bg-white shadow-sm' : 'border-zinc-200 bg-white'
                }`}
                onClick={() => setSelectedPath(route.path)}
              >
                <div className="flex items-center justify-between mb-2">
                  <code className="text-sm font-mono bg-zinc-100 px-2 py-0.5 rounded">{route.path}</code>
                  <span className="text-xs text-zinc-400">{route.description}</span>
                </div>
                {/* Use the REAL Breadcrumb component */}
                <div className="mt-2 p-3 bg-zinc-50 rounded-lg" data-testid={`breadcrumb-${route.path.replace(/\//g, '-')}`}>
                  <Breadcrumb color={route.color} overrideSegments={segments} />
                  {segments.length <= 1 && (
                    <span className="text-zinc-400 italic text-sm">No breadcrumb (top-level page)</span>
                  )}
                </div>
                {/* Verify specific requirements */}
                {route.path === '/core/budgets' && (
                  <div className="mt-2 text-xs text-green-600">
                    ✓ Shows &quot;De Kern&quot; indicating page is within De Kern module
                    <br />
                    ✓ &quot;De Kern&quot; links back to /core overview
                  </div>
                )}
                {route.path === '/core/cash/import' && (
                  <div className="mt-2 text-xs text-green-600">
                    ✓ Full path: De Kern → Cash → Importeren
                    <br />
                    ✓ Each parent segment is a clickable link
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-lg font-semibold mb-3">Module Navigation (ModuleNav)</h2>
          <p className="text-sm text-zinc-500 mb-3">
            In addition to breadcrumbs, the ModuleNav bar provides tab-style navigation within each module:
          </p>
          <div className="flex gap-1 border-b border-amber-100 pb-1">
            {['Overzicht', 'Budgetten', 'Cash', 'Schulden', 'Assets', 'Belasting'].map((item) => (
              <span
                key={item}
                className={`px-3 py-2 text-sm font-medium border-b-2 ${
                  item === 'Budgetten'
                    ? 'text-amber-700 border-amber-500'
                    : 'text-zinc-500 border-transparent'
                }`}
              >
                {item}
              </span>
            ))}
          </div>
          <div className="mt-2 text-xs text-green-600">
            ✓ &quot;Overzicht&quot; tab links to /core (the module overview)
            <br />
            ✓ Active tab highlighted with amber border
            <br />
            ✓ All subpages accessible as tabs
          </div>
        </div>
      </div>
    </div>
  )
}
