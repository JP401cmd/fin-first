'use client'

/**
 * Onopvallende "Download als PDF"-actie. Opent de browser-printdialoog
 * (save-as-PDF) op een schone, gestylede render — de print-stylesheet in
 * `rapport.css` verbergt de interactieve chrome en forceert de krant-kleuren.
 *
 * De `.report-actions`-balk zelf zit in `RapportView`, zodat de deel-actie
 * (`ShareButton`) ernaast kan staan.
 */
export function DownloadButton() {
  return (
    <button
      type="button"
      className="download-btn"
      onClick={() => window.print()}
      aria-label="Download dit rapport als PDF"
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Download als PDF
    </button>
  )
}
