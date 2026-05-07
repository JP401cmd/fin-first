'use client'

/**
 * PrivacyNotice — editorial copy block uitleggend wat de aangifte-import wel
 * en niet doet met de data van de gebruiker.
 *
 * Het stuk staat op de "choose"-stap van `<AangifteImportPane>` zodat de
 * gebruiker vóór het uploaden weet wat er gebeurt. Volgt het AVG-data-
 * minimisatie principe uit het plan: één tabel "wel", één tabel "niet",
 * en drie kerngaranties (PDF blijft client-side, BSN's gestript, gebruiker
 * valideert elke regel).
 *
 * Visueel: editorial krant-stijl conform UI/UX-skill page-type 5 (Modal):
 *   · Kicker-met-streepje (`--module-active-500`) als sectie-anker
 *   · Italic Playfair body met een hoofdregel-em
 *   · Twee kolommen voor "wel" / "niet" lijsten (mobile-first stacked)
 *   · Eén 🔒 emoji als signaal — geen emoji-spam
 *
 * Hergebruikbaar buiten `aangifte-import-pane` (bv. ook op
 * `/identity/koppelingen` als de gebruiker daar de jaarlijkse re-import
 * doet). Pure presentational — geen state, geen side-effects.
 */

interface PrivacyNoticeProps {
  /** Compact-modus voor inline-toepassing (footer onder een form). Default false. */
  compact?: boolean
}

const WEL_IMPORTEREN: { veld: string; bestemming: string }[] = [
  { veld: 'Bezittingen + bedragen op peildatum', bestemming: 'jouw vermogensoverzicht' },
  { veld: 'Schulden + restschuld', bestemming: 'jouw schuldenpaneel' },
  { veld: 'Bruto jaarinkomen Box 1', bestemming: 'FIRE-berekening' },
  { veld: 'WOZ-waarde van je woning', bestemming: 'eigen-huis-asset' },
  { veld: 'Hypotheek-aflossingsvorm', bestemming: 'lening-detail' },
]

const NIET_IMPORTEREN: { veld: string; reden: string }[] = [
  { veld: 'Burgerservicenummer (BSN)', reden: 'wordt gestript voordat data je browser verlaat' },
  { veld: 'NAW-gegevens en geboortedata', reden: 'al ingevuld bij eerste setup' },
  { veld: 'IBAN / rekeningnummers', reden: 'we slaan alleen rekeningnaam op' },
  { veld: 'Loonheffing en heffingskortingen', reden: 'afgeleid, geen veld' },
  { veld: 'Alimentatie / scholingsuitgaven', reden: 'buiten scope V1' },
  { veld: 'Toeslagen en kinderbijslag', reden: 'al gedekt door budgetcategorie' },
]

export function PrivacyNotice({ compact = false }: PrivacyNoticeProps) {
  return (
    <section
      aria-labelledby="privacy-notice-heading"
      className={compact ? 'space-y-3' : 'space-y-4'}
    >
      {/* Kicker-met-streepje volgt editorial-kicker-pattern. De `id` koppelt
          aan `aria-labelledby` op de section zodat screen-readers de sectie
          met deze kop aanduiden. */}
      <p className="flex items-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
        <span
          className="inline-block w-7 h-px bg-[var(--color-kern-500)] mr-2.5 align-middle"
          aria-hidden="true"
        />
        <span aria-hidden="true">🔒</span>
        <span id="privacy-notice-heading" className="ml-1.5">
          Hoe we omgaan met jouw data
        </span>
      </p>

      {/* Hoofdregel — italic body met paarse em (kern-700 voor kern-context) */}
      {!compact && (
        <p className="font-serif text-base italic leading-relaxed text-[var(--ink-2)] max-w-[60ch]">
          Wij slaan je aangifte <em className="font-serif italic font-normal text-[var(--color-kern-700)]">niet op</em>.
          Het PDF-bestand blijft in je browser; alleen de bedragen die jij straks bevestigt komen in de app.
        </p>
      )}

      {/* Twee-koloms wel/niet — mobile-first stacked, desktop side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        {/* WEL */}
        <div className="space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-[0.10em] text-[var(--color-kern-700)]">
            Wel importeren
          </p>
          <ul className="space-y-1.5 text-sm">
            {WEL_IMPORTEREN.map(({ veld, bestemming }) => (
              <li key={veld} className="flex items-start gap-2 text-[var(--ink-2)] leading-snug">
                <span
                  aria-hidden="true"
                  className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-[var(--color-kern-500)]"
                />
                <span className="font-serif">
                  {veld}
                  <span className="text-[var(--ink-3)]"> — naar {bestemming}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* NIET */}
        <div className="space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-[0.10em] text-[var(--ink-3)]">
            Niet importeren
          </p>
          <ul className="space-y-1.5 text-sm">
            {NIET_IMPORTEREN.map(({ veld, reden }) => (
              <li key={veld} className="flex items-start gap-2 text-[var(--ink-2)] leading-snug">
                <span
                  aria-hidden="true"
                  className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-[var(--ink-4)]"
                />
                <span className="font-serif">
                  {veld}
                  <span className="text-[var(--ink-3)]"> — {reden}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Drie kerngaranties — krant-stijl footnote */}
      {!compact && (
        <p className="font-serif italic text-xs text-[var(--ink-3)] leading-relaxed border-t border-dotted border-[var(--border-ed)] pt-3 max-w-[60ch]">
          Het PDF-bestand wordt in je browser gelezen door <span className="font-mono not-italic text-[11px]">pdfjs-dist</span>;
          de parser draait lokaal en roept geen externe CDN aan. BSN&apos;s worden lokaal vervangen
          door <span className="font-mono not-italic text-[11px]">[BSN]</span> voordat de tekst
          naar de server gaat. Daarna kies jij zelf per regel of die in jouw vermogen mag landen.
        </p>
      )}
    </section>
  )
}
