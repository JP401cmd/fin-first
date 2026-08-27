'use client'

/**
 * Rekenmodal achter de KPI "Rendement portefeuille" op /overzicht/bezittingen.
 *
 * WAAROM DEZE MODAL BESTAAT — de KPI toonde ooit één kaal getal uit één kale
 * aftrekking (`Σ current_value − Σ purchase_value`) waarin vier onvergelijkbare
 * grondslagen door elkaar liepen. Het resultaat was narekenbaar noch
 * geloofwaardig: een fors negatief bedrag terwijl de portefeuille tientallen
 * procenten in de plus stond (zie de fixture in lib/asset-return.test.ts).
 * Deze modal is het antwoord op "waar komt dat vandaan": elke bezitting staat
 * erin, mét de kostprijs waartegen hij is afgezet en waar die kostprijs
 * vandaan komt.
 *
 * De drie emmers tellen samen exact op tot de "Totale waarde" uit de
 * figures-strip — dat is de belofte van dit scherm. Verdwijnt er een bedrag
 * tussen de emmers, dan is de uitleg niet meer waar en is dat hier zichtbaar.
 *
 * Rekenen gebeurt NIET hier: `buildAssetReturnBreakdown` (lib/asset-return.ts)
 * levert alles kant-en-klaar aan (consume, don't recompute).
 */

import { KassabonShell } from '@/components/app/kassabon-shell'
import { ReceiptRow } from '@/components/app/horizon/phase-analysis/receipt-row'
import { ModalFooter } from '@/components/app/modal-footer'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { FiguresStrip } from '@/components/editorial'
import {
  calculateFreedomTime,
  formatFreedomTimeString,
  formatMaskedCurrency,
} from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { ASSET_TYPE_LABELS, type AssetType } from '@/lib/asset-data'
import { formatGainPct, RETURN_BASIS_LABELS } from '@/lib/asset-return'
import type { AssetReturnBreakdown, AssetReturnReason, AssetReturnRow } from '@/lib/asset-return'

/** Waarom een bezitting geen rendement kan dragen — in gewone taal. */
const REASON_LABEL: Record<AssetReturnReason, string> = {
  'geen-kostprijs-begrip': 'saldo, geen aankoop',
  'geen-aankoopwaarde': 'geen aankoopwaarde ingevuld',
  'aankoop-is-waarde': 'aankoopwaarde gelijk aan de waarde',
  'samengevoegd-totaal': 'één totaalbedrag, geen losse bezittingen',
}

/** Waar de kostprijs vandaan komt — de kern van de uitleg. */
const SOURCE_LABEL: Record<'holdings' | 'purchase_value', string> = {
  holdings: 'kostprijs uit je posities',
  purchase_value: 'aankoopwaarde die je zelf invulde',
}

/** Leeg/onbekend type levert géén label — een partner-aggregaatrij draagt geen
 *  `asset_type` en toonde daardoor letterlijk het woord "undefined". */
function typeLabel(assetType: string): string | null {
  return ASSET_TYPE_LABELS[assetType as AssetType] ?? (assetType.trim() || null)
}

export function AssetReturnModal({
  open,
  onClose,
  breakdown,
  dailyExpenses,
}: {
  open: boolean
  onClose: () => void
  breakdown: AssetReturnBreakdown
  /** Canoniek €/dag uit de loader — voor de vrijheidstijd-vertaling. Nooit zelf afleiden. */
  dailyExpenses: number
}) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  const signed = (v: number) => `${v >= 0 ? '+' : ''}${fc(v)}`

  const { portfolio, valuation, withoutBasis, totalValue } = breakdown

  return (
    <ShellOverlay
      open={open}
      onClose={onClose}
      kind="sheet"
      size="lg"
      title="Rendement &mdash; zo is het opgebouwd"
      footer={<ModalFooter primary={{ label: 'Sluiten', onClick: onClose }} />}
    >
      <div className="h-[2px] bg-[var(--color-kern-600)]" />

      <div className="space-y-5 p-4 sm:p-5">
        <p
          className="max-w-[60ch] border-l-2 border-[var(--color-kern-500)] pl-3 font-serif italic text-sm leading-snug text-[var(--ink-2)]"
        >
          Rendement is wat je vermogen bóven zijn kostprijs staat. Dat kan alleen
          waar een kostprijs bestaat &mdash; een banksaldo is gestort, niet gekocht,
          en een woning die je zelf bewoont verandert wel van waarde maar levert
          geen rendement op. Vandaar drie stapels in plaats van &eacute;&eacute;n som.
        </p>

        {/* Kop-cijfers van de portefeuille zelf. `alwaysFull`: in de weergavemodus
            "Eenvoudig" zou de strip tot twee cellen inkorten en juist de uitkomst
            wegvallen — in een rekenmodal is dat de verkeerde reductie. */}
        <FiguresStrip
          cols={3}
          alwaysFull
          figures={[
            {
              kicker: 'Marktwaarde nu',
              amount: fc(portfolio.value),
              sub: `${portfolio.rows.length} bezitting${portfolio.rows.length === 1 ? '' : 'en'}`,
            },
            {
              kicker: 'Kostprijs',
              amount: fc(portfolio.cost),
              sub: 'wat je ervoor betaalde',
            },
            {
              kicker: 'Rendement',
              amount: portfolio.cost > 0 ? signed(portfolio.gain) : '—',
              sub:
                portfolio.pct != null
                  ? `${formatGainPct(portfolio.pct)} sinds aankoop`
                  : 'geen kostprijs bekend',
              sub2:
                dailyExpenses > 0 && portfolio.gain > 0
                  ? `${formatFreedomTimeString(calculateFreedomTime(portfolio.gain, dailyExpenses), 'long')} vrijheid`
                  : undefined,
              // Uitkomst-cel van deze kassabon → `winner` (ink + highlight-marker),
              // huisnorm voor het eindresultaat van een figures-strip. Het teken
              // draagt de `+`/`−`-prefix en het percentage eronder; de marker
              // markeert wélke cel de conclusie is. Eén winner per strip.
              variant: portfolio.cost > 0 ? 'winner' : 'neutral',
            },
          ]}
        />

        <Section
          kicker="MEEGETELD · MARKTPORTEFEUILLE"
          intro="Beleggingen en crypto. Hier is de kostprijs bekend, dus is het verschil met de marktwaarde echt rendement."
          rows={portfolio.rows}
          emptyText="Je hebt (nog) geen beleggingen of crypto met een bekende kostprijs."
          fc={fc}
          signed={signed}
          // Zelfde label als de KPI die deze modal uitlegt — uit de gedeelde
          // bron (kaart H7). Wijkt de totaalregel af van de cel waarop de
          // gebruiker klikte, dan legt de uitleg iets anders uit dan hij vroeg.
          total={portfolio.cost > 0 ? { label: RETURN_BASIS_LABELS.portfolioSincePurchase.label, value: portfolio.gain } : null}
        />

        <Section
          kicker="APART · WAARDEVERANDERING"
          intro="Woning, deelneming en dergelijke. Deze veranderen wel van waarde, maar dat is geen marktrendement — en de bedragen zijn zo groot dat ze het rendement zouden overstemmen."
          rows={valuation.rows}
          emptyText="Geen bezittingen in deze categorie."
          fc={fc}
          signed={signed}
          total={valuation.rows.length > 0 ? { label: 'Waardeverandering', value: valuation.gain } : null}
        />

        <Section
          kicker="GEEN GRONDSLAG"
          intro="Deze bezittingen tellen mee in je totale waarde, maar dragen geen rendement: er is geen kostprijs om tegen af te zetten."
          rows={withoutBasis.rows}
          emptyText="Elke bezitting heeft een kostprijs."
          fc={fc}
          signed={signed}
          total={null}
        />

        {/* Sluitpost — de drie stapels moeten optellen tot het bedrag dat
            bovenaan de pagina staat. Zonder deze regel is de uitleg niet
            controleerbaar en blijft "waar is de rest gebleven?" open staan. */}
        <KassabonShell>
          <ReceiptRow label="Marktportefeuille" value={fc(portfolio.value)} />
          <ReceiptRow label="Waardeverandering-bezit" value={fc(valuation.value)} />
          <ReceiptRow label="Zonder grondslag" value={fc(withoutBasis.value)} />
          {/* Boekhoudkundige afsluiting → dubbele lijn (huisnorm voor de
              total-rij van een kassabon), niet de gewone enkele streep. */}
          <div className="mt-2 flex items-baseline justify-between gap-2 border-b-4 border-double border-[var(--ink)] pb-2 pt-2">
            <span className="font-sans text-xs font-bold text-[var(--ink)] sm:text-sm">
              Totale waarde
            </span>
            <span className="font-mono text-xs font-bold tabular-nums text-[var(--ink)] sm:text-sm">
              {fc(totalValue)}
            </span>
          </div>
        </KassabonShell>

        <p className="font-serif text-xs italic leading-relaxed text-[var(--ink-3)]">
          De kostprijs van beleggingen en crypto komt uit je posities zelf &mdash; per
          stuk, tegen de aankoopprijs die daar geregistreerd staat. Staat er bij een
          bezitting &ldquo;aankoopwaarde die je zelf invulde&rdquo;, dan rust het getal op
          wat er in het formulier is getypt; koppel je posities of vul je de
          aankoopwaarde bij, dan wordt het scherper.
        </p>
      </div>
    </ShellOverlay>
  )
}

function Section({
  kicker,
  intro,
  rows,
  emptyText,
  fc,
  signed,
  total,
}: {
  kicker: string
  intro: string
  rows: AssetReturnRow[]
  emptyText: string
  fc: (v: number) => string
  signed: (v: number) => string
  total: { label: string; value: number } | null
}) {
  return (
    <section>
      <h3 className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
        <span className="mr-2.5 inline-block h-px w-7 bg-[var(--color-kern-500)] align-middle" />
        {kicker}
      </h3>
      <p className="mb-3 max-w-[60ch] font-serif text-xs leading-snug text-[var(--ink-3)]">{intro}</p>

      <KassabonShell>
        {rows.length === 0 ? (
          <p className="py-1 font-sans text-xs text-[var(--ink-3)]">{emptyText}</p>
        ) : (
          <>
            {rows.map((row) => (
              <div key={row.id} className="py-1">
                <ReceiptRow
                  label={row.name}
                  value={row.gain != null ? signed(row.gain) : fc(row.value)}
                  positive={row.gain != null && row.gain > 0}
                  negative={row.gain != null && row.gain < 0}
                />
                <div className="flex items-baseline justify-between gap-2 pl-3 text-[var(--ink-3)]">
                  <span className="min-w-0 shrink font-sans text-[10px]">
                    {[
                      typeLabel(row.assetType),
                      row.reason ? REASON_LABEL[row.reason] : null,
                      row.costSource ? SOURCE_LABEL[row.costSource] : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums">
                    {row.cost != null
                      ? `${fc(row.cost)} → ${fc(row.value)}`
                      : fc(row.value)}
                  </span>
                </div>
              </div>
            ))}
            {total && (
              <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-[var(--ink)] pt-2">
                <span className="font-sans text-xs font-bold text-[var(--ink)] sm:text-sm">{total.label}</span>
                <span
                  className={`font-mono text-xs font-bold tabular-nums sm:text-sm ${
                    total.value >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                  }`}
                >
                  {signed(total.value)}
                </span>
              </div>
            )}
          </>
        )}
      </KassabonShell>
    </section>
  )
}
