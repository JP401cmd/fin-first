/**
 * ProgressMilestones — subtiele verticale lijntjes op 25/50/75% van een
 * progressbar. Gebruikt door VrijheidStrip, DoelenView, MiniTimelineStrip
 * en (toekomstig) andere voortgangs-balken zodat de visuele taal
 * consistent blijft.
 *
 * Plaatsing: zet als kind in een `position: relative; overflow: hidden`
 * progressbar-container. De spans worden absolute-positioned op de
 * percent-as.
 *
 * Toegankelijkheid: aria-hidden — werkelijke voortgang gaat via de
 * progressbar zelf (aria-valuenow).
 */
export function ProgressMilestones({
  /** Lijst van percent-posities (0-100). Default: 25/50/75. */
  marks = [25, 50, 75],
  /** Tailwind class voor de marker-lijn. Default: licht paper-tint. */
  className = 'bg-[var(--paper)]/80',
}: {
  marks?: number[]
  className?: string
}) {
  return (
    <>
      {marks.map((mark) => (
        <span
          key={mark}
          aria-hidden="true"
          className={`absolute inset-y-0 w-px ${className}`}
          style={{ left: `${mark}%` }}
        />
      ))}
    </>
  )
}
