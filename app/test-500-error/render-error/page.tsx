'use client'

/**
 * This page deliberately throws a render error to test the global error boundary.
 * Visit /test-500-error/render-error to see the error boundary in action.
 */
export default function RenderErrorPage() {
  // Immediately throw to trigger the error boundary
  throw new Error('Simulated render error for Feature #102 testing')

  // This is unreachable but TypeScript needs it
  return null
}
