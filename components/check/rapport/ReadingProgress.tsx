'use client'

import { useReadingProgress } from './hooks'

/** Vaste leesvoortgang-balk bovenaan (kern→wil→horizon gradient). */
export function ReadingProgress() {
  const progress = useReadingProgress()
  return (
    <div
      className="progress-bar"
      style={{ width: `${progress}%` }}
      aria-hidden="true"
    />
  )
}
