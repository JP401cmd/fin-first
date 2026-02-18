'use client'

import { Breadcrumb } from '@/components/app/breadcrumb'

/**
 * Dev-only page to preview breadcrumb rendering at various paths.
 * This page is NOT protected by auth, for visual verification only.
 */
export default function DevPreviewBreadcrumbPage() {
  if (process.env.NODE_ENV !== 'development') {
    return <div>Not available in production</div>
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <h1 className="mb-8 text-2xl font-bold text-zinc-900">
        Breadcrumb Preview (Dev Only)
      </h1>

      <div className="space-y-8">
        {/* Simulate /core (should not show breadcrumbs - too shallow) */}
        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-3 text-sm font-medium text-zinc-500">/core (single level - hidden)</h2>
          <Breadcrumb
            color="amber"
            overrideSegments={[{ label: 'De Kern', href: '/core' }]}
          />
          <p className="mt-2 text-xs text-zinc-400">
            Expected: Nothing (breadcrumbs hidden for single segment)
          </p>
        </div>

        {/* Simulate /core/budgets */}
        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-3 text-sm font-medium text-zinc-500">/core/budgets</h2>
          <Breadcrumb
            color="amber"
            overrideSegments={[
              { label: 'De Kern', href: '/core' },
              { label: 'Budgetten', href: '/core/budgets' },
            ]}
          />
          <p className="mt-2 text-xs text-zinc-400">
            Expected: De Kern {'>'} Budgetten
          </p>
        </div>

        {/* Simulate /core/cash */}
        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-3 text-sm font-medium text-zinc-500">/core/cash</h2>
          <Breadcrumb
            color="amber"
            overrideSegments={[
              { label: 'De Kern', href: '/core' },
              { label: 'Cash', href: '/core/cash' },
            ]}
          />
          <p className="mt-2 text-xs text-zinc-400">
            Expected: De Kern {'>'} Cash
          </p>
        </div>

        {/* Simulate /core/cash/import */}
        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-3 text-sm font-medium text-zinc-500">/core/cash/import</h2>
          <Breadcrumb
            color="amber"
            overrideSegments={[
              { label: 'De Kern', href: '/core' },
              { label: 'Cash', href: '/core/cash' },
              { label: 'Importeren', href: '/core/cash/import' },
            ]}
          />
          <p className="mt-2 text-xs text-zinc-400">
            Expected: De Kern {'>'} Cash {'>'} Importeren
          </p>
        </div>

        {/* Simulate /will */}
        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-3 text-sm font-medium text-zinc-500">/will (single level - hidden)</h2>
          <Breadcrumb
            color="teal"
            overrideSegments={[{ label: 'De Wil', href: '/will' }]}
          />
          <p className="mt-2 text-xs text-zinc-400">
            Expected: Nothing (breadcrumbs hidden for single segment)
          </p>
        </div>

        {/* Simulate /horizon */}
        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-3 text-sm font-medium text-zinc-500">/horizon (single level - hidden)</h2>
          <Breadcrumb
            color="purple"
            overrideSegments={[{ label: 'De Horizon', href: '/horizon' }]}
          />
          <p className="mt-2 text-xs text-zinc-400">
            Expected: Nothing (breadcrumbs hidden for single segment)
          </p>
        </div>

        {/* Live breadcrumb using current path */}
        <div className="rounded-lg border bg-white p-6">
          <h2 className="mb-3 text-sm font-medium text-zinc-500">Live (current path)</h2>
          <Breadcrumb color="amber" />
          <p className="mt-2 text-xs text-zinc-400">
            Auto-generated from current URL path
          </p>
        </div>
      </div>
    </div>
  )
}
