/**
 * Het teken van een ingreep in een grafiek: driehoek = release, ruit =
 * beheeractie. Vorm draagt het verschil, niet kleur. Vaste maat, los van de
 * breedte van de grafiek.
 *
 * Zonder hooks en zonder `'use client'`: bruikbaar in de legenda (server) en in
 * het interactieve veld (client).
 */
export function MarkeringTeken({ soort, maat }: { soort: 'release' | 'beheeractie'; maat: number }) {
  return (
    <svg aria-hidden viewBox="0 0 8 8" width={maat} height={maat} className="shrink-0 overflow-visible">
      {soort === 'release' ? (
        <path d="M0.5 1 L7.5 1 L4 7.5 Z" fill="var(--ink)" />
      ) : (
        <path d="M4 0.5 L7.5 4 L4 7.5 L0.5 4 Z" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1" />
      )}
    </svg>
  )
}
