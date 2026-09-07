import { formatCurrency } from '@/lib/format'
import type { Box1Result } from '@/lib/box1-tax'
import { Kicker } from '@/components/editorial'

/**
 * Box1KostZin (BEL-9) — de Eenvoudig-variant van de Box 1-figures-strip.
 *
 * "Effectief tarief 41,5% · Netto besteedbaar € 93.983" naast elkaar is
 * expert-notatie: het vraagt van de lezer dat hij weet dat het eerste getal
 * over het tweede gaat. Deze zin zegt hetzelfde in gewone taal — hoeveel van
 * je bruto inkomen naar Box 1 gaat en wat je overhoudt — en is daarmee duiding
 * in plaats van reductie. Zelfde behandeling als `DrukZin` op de hub (BEL-6);
 * eigen bestand zodat de zin unit-testbaar is (de pagina eromheen is een async
 * server-component).
 *
 * CONSUME, DON'T RECOMPUTE. Beide getallen komen kant-en-klaar uit
 * `computeBox1Tax()` — `effectiveRate` en `nettoBesteedbaar`, exact de velden
 * die de twee strip-cellen al toonden. `Math.round(effectiveRate * 100)` is een
 * pure WEERGAVE-afronding van dat ene canonieke getal. Wat hier verboden is:
 * een schijftarief of heffingskorting binnenhalen, `BOX1_PARAMS` lezen, of
 * netto zelf uit bruto − heffing afleiden. De bron-test in
 * box1-kost-zin.test.tsx bewaakt dat.
 *
 * NULL-PAD. Zonder bruto-inkomen is er geen percentage dat iets betekent
 * (`effectiveRate` deelt door het bruto-inkomen): dan géén zin. De pagina
 * rendert de hero in dat geval sowieso niet — deze guard is de tweede laag,
 * zodat de zin niet stil "0%" gaat zeggen als de hero-gate ooit verschuift.
 *
 * WFT: beschrijvend ("gaat naar", "je houdt over"), nooit imperatief, en géén
 * brug naar de jaarruimte-kans — "je laat X liggen, stort in een lijfrente" is
 * een productaanbeveling aan een specifiek persoon en daarmee vergunningsplichtig
 * advies. "Ongeveer" blijft staan: het bruto-inkomen onder dit percentage is
 * meestal een schatting. De "Indicatie, geen advies"-voetregel onder de hero
 * blijft de voetnoot.
 *
 * GEEN TWEEDE TIJD-GRONDSLAG (ADR 0105): bewust géén "X van de 12 maanden
 * werk je voor Box 1". De hub draagt die claim al over de héle rekening; een
 * tweede met alleen Box 1 in de teller geeft twee maanden-getallen op twee
 * schermen. De vrijheidstijd-regel boven deze zin (op de heffing zelf) blijft.
 */
export function Box1KostZin({ result }: { result: Box1Result }) {
  if (result.grossYearlyIncome <= 0) return null

  const pct = Math.round(result.effectiveRate * 100)

  return (
    <div className="my-5 border-t border-b border-[var(--ink)] py-4">
      <Kicker>Wat je overhoudt</Kicker>
      <p className="mt-1.5 max-w-[52ch] text-sm leading-snug text-[var(--ink)]">
        Van je bruto inkomen gaat ongeveer{' '}
        <span className="font-semibold tabular-nums">{pct}%</span> naar Box 1 — je houdt{' '}
        <span className="font-semibold tabular-nums">
          {formatCurrency(Math.round(result.nettoBesteedbaar))}
        </span>{' '}
        per jaar over.
      </p>
      <p className="mt-1 text-[11px] leading-tight text-[var(--ink-3)]">
        Inclusief je heffingskortingen en, als je die hebt, je eigen woning.
      </p>
    </div>
  )
}
