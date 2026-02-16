import { notFound } from 'next/navigation'

// UUID v4 regex for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Top-level /holdings/[id] route handler.
 *
 * Holdings are managed at /core/assets/holdings (within the authenticated app layout).
 * Any direct navigation to /holdings/[id] — whether a valid UUID or garbage —
 * should show a 404 "not found" page rather than crashing.
 */
export default async function HoldingByIdPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // Always show 404 for /holdings/[id] — the actual holdings pages live under /core/assets/holdings
  notFound()
}
