'use client'

import { useState, useEffect } from 'react'

/**
 * This page deliberately throws a render error to test the global error boundary.
 * Visit /test-500-error/render-error to see the error boundary in action.
 * The throw is deferred to a client-side re-render to avoid breaking static prerendering.
 */
export default function RenderErrorPage() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (mounted) {
    throw new Error('Simulated render error for Feature #102 testing')
  }

  return null
}
