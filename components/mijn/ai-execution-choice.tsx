'use client'

import { AlertTriangle, MonitorSmartphone, Cloud, Cpu } from 'lucide-react'
import { Kicker } from '@/components/editorial'
import { AiSubscriptionUpsell } from '@/components/app/ai-subscription-upsell'

/**
 * AiExecutionChoice — de HOOFDKEUZE op /mijn/privacy: waar draait de AI?
 *
 * Eén schakelaar (`profiles.privacy_mode`, geschreven via /api/privacy-mode door
 * de container) met twee bestemmingen: Cloud-AI (de standaard) of lokaal op je
 * eigen apparaat waar dat kan. Daaronder een échte vergelijking — zes rijen, in
 * gewone taal — zodat de keuze niet op één zin hoeft te rusten.
 *
 * SEMANTIEK DIE HIER ZICHTBAAR MOET ZIJN: kan iets lokaal niet, dan wordt het
 * GEBLOKKEERD en niet stilzwijgend alsnog via de cloud gedaan. Die belofte is de
 * reden dat de per-groep-beperkingen in AiExecutionGroupList zichtbaar staan en
 * niet achter een tooltip; deze sectie zegt het principe, de groepenlijst zegt
 * per onderdeel wát je inlevert.
 *
 * PRESENTATIONEEL: geen eigen data-laag. De container
 * (local-categorization-settings.tsx) bezit de profielstaat en de schrijfactie;
 * dit component rendert de keuze, de vergelijking en de drie reden-blokken.
 *
 * A11Y: de schakelaar is een echte `<button role="switch">` met `aria-label`; elk
 * reden-blok draagt een id en de zichtbare reden hangt via `aria-describedby` aan
 * de schakelaar (ids ongewijzigd t.o.v. de eerdere versie, zodat bestaande
 * koppelingen en tests blijven kloppen).
 */

type ComparisonRowData = {
  criterion: string
  lokaal: string
  cloud: string
}

/**
 * De zes vergelijkingsrijen. Bewust hier als data i.p.v. in de markup: zo staat
 * de belofte per rij op één regel te lezen en is hij in één oogopslag te toetsen.
 */
const COMPARISON: ComparisonRowData[] = [
  {
    criterion: 'Privacy',
    lokaal: 'Je gegevens verlaten je apparaat niet.',
    cloud: 'Je gegevens gaan versleuteld naar de AI-leverancier.',
  },
  {
    criterion: 'Kwaliteit',
    lokaal: 'Eenvoudiger model: korter, soms minder precies.',
    cloud: 'Het sterkste model.',
  },
  {
    criterion: 'Snelheid',
    lokaal: '20 tot 60 seconden; de eerste keer ongeveer een minuut opstarten.',
    cloud: 'Enkele seconden.',
  },
  {
    criterion: 'Apparaat',
    lokaal: 'Alleen desktop met een geschikte videokaart, plus 2 GB opslag.',
    cloud: 'Werkt overal, ook op je telefoon.',
  },
  {
    criterion: 'AI-tegoed',
    lokaal: 'Kost geen tegoed.',
    cloud: 'Verbruikt je maandtegoed.',
  },
  {
    criterion: 'Internet',
    lokaal: 'Werkt offline.',
    cloud: 'Internet nodig.',
  },
]

export function AiExecutionChoice({
  privacyMode,
  aiEnabled,
  hasAiTier,
  likelyMobile,
  disabled,
  onToggle,
}: {
  /** true = "lokaal waar mogelijk"; false = Cloud-AI (de standaard). */
  privacyMode: boolean
  aiEnabled: boolean
  hasAiTier: boolean
  likelyMobile: boolean
  /** Spiegelt de container-logica: AANzetten vereist tier + desktop. */
  disabled: boolean
  onToggle: () => void
}) {
  // A11Y: koppel de op dit moment zichtbare reden-melding aan de schakelaar. De
  // takken spiegelen exact de render-condities van de drie reden-blokken (die
  // elkaar uitsluiten); geen zichtbaar blok → geen aria-describedby.
  const describedById = !aiEnabled
    ? 'lokale-cat-reden-ai-uit'
    : !hasAiTier && !privacyMode
      ? 'lokale-cat-reden-tier'
      : hasAiTier && likelyMobile
        ? 'lokale-cat-reden-mobiel'
        : undefined

  // Alléén kleur wisselt; het gewicht komt uit de basis-className (`font-normal`).
  // Hier ook `font-semibold` meegeven zou twee font-weight-utilities met gelijke
  // specificiteit tegen elkaar zetten — welke wint hangt dan af van Tailwinds
  // scanvolgorde, niet van de volgorde in deze string. Bovendien horen
  // tabelkoppen in de krant-stijl niet bold te zijn.
  const activeHeaderClass = 'text-[var(--module-active-700)]'
  const idleHeaderClass = 'text-[var(--ink-3)]'

  return (
    <div className="space-y-6">
      {/* ── Kop ── */}
      <div className="space-y-3">
        <Kicker>Waar draait de AI?</Kicker>
        <h2
          className="text-[20px] sm:text-[24px] font-bold leading-tight tracking-[-0.01em] text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          Op je eigen apparaat, of in de{' '}
          <em className="font-normal italic" style={{ color: 'var(--module-active-700)' }}>
            cloud
          </em>
          ?
        </h2>
        <p className="text-sm leading-relaxed text-[var(--ink-2)]">
          Je kiest zelf waar de AI rekent. Standaard gebeurt dat in de cloud: het sterkste model, binnen
          enkele seconden, op elk apparaat. Kies je voor lokaal, dan blijft je informatie op je eigen
          apparaat — en wat lokaal niet kan, wordt geblokkeerd in plaats van stilletjes alsnog naar de
          cloud gestuurd.
        </p>
      </div>

      {/* ── De schakelaar ── */}
      <div className="flex items-center justify-between border border-[var(--border-ed)] p-4">
        <div className="flex items-start gap-3 pr-4">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center bg-wil-50">
            {privacyMode ? (
              <Cpu className="h-4 w-4 text-wil-600" aria-hidden="true" />
            ) : (
              <Cloud className="h-4 w-4 text-wil-600" aria-hidden="true" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--ink)]">Lokaal waar mogelijk</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-3)]">
              {privacyMode
                ? 'Aan — waar het kan draait de AI op je eigen apparaat. Wat lokaal niet kan, wordt geblokkeerd.'
                : 'Uit — je gebruikt Cloud-AI, de standaard. De AI rekent bij de AI-leverancier.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={privacyMode}
          aria-label={`Lokaal waar mogelijk ${privacyMode ? 'uitschakelen' : 'inschakelen'}`}
          aria-describedby={describedById}
          disabled={disabled}
          onClick={onToggle}
          // De baan is visueel 24px hoog, maar dat is een te klein raakvlak op een
          // telefoon. Verticale padding brengt het klikgebied op 44px zonder de
          // baan groter te maken; de negatieve marge houdt de uitlijning intact.
          // Zelfde oplossing als components/core/app-toggle-section.tsx.
          className={`group relative -my-2.5 inline-flex min-h-11 shrink-0 cursor-pointer items-center py-2.5 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <span
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 group-focus-visible:ring-2 group-focus-visible:ring-wil-500 group-focus-visible:ring-offset-2 ${privacyMode ? 'bg-wil-500' : 'bg-[var(--border-md)]'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${privacyMode ? 'translate-x-6' : 'translate-x-1'}`}
            />
          </span>
        </button>
      </div>

      {/* ── Niet bedienbaar: AI helemaal uit ── */}
      {!aiEnabled && (
        <div id="lokale-cat-reden-ai-uit" className="flex items-start gap-3 bg-[var(--subtle)] p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-[var(--ink-2)]">
            Schakel eerst <strong>AI-features</strong> hierboven in. Lokaal draaien is een verfijning van
            AI-gebruik, geen vervanging voor &apos;AI helemaal uit&apos;.
          </p>
        </div>
      )}

      {/* ── AI-abonnement vereist voor aanzetten ── */}
      {/* Alleen bij een aanzet-poging zonder tier: staat lokaal al aan, dan blijft
          uitzetten vrij en is dit blok misplaatst. Canonieke upsell — één patroon
          met prijs/tagline uit de abonnementscatalogus. */}
      {aiEnabled && !hasAiTier && !privacyMode && (
        <div id="lokale-cat-reden-tier">
          <AiSubscriptionUpsell variant="inline" />
        </div>
      )}

      {/* ── Proactieve desktop-only hint ── */}
      {/* Alleen als de tier er wél is — anders stapelt dit op het upsell-blok. */}
      {aiEnabled && hasAiTier && likelyMobile && (
        <div id="lokale-cat-reden-mobiel" className="flex items-start gap-3 bg-[var(--subtle)] p-4">
          <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-[var(--ink-2)]">
            Lokaal draaien kan <strong>alleen op desktop</strong> — een telefoon of tablet heeft niet genoeg
            grafisch geheugen om het model te draaien. We hebben het gemeten: op een telefoon komt er geen
            bruikbaar antwoord uit. Open deze instelling op een desktop of laptop om hem aan te zetten.
          </p>
        </div>
      )}

      {/* ── Voor- en nadelen ── */}
      <div className="space-y-2.5">
        <Kicker>Voor- en nadelen</Kicker>
        <div className="relative">
          {/* Sleep-affordance: de tabel scrollt op smalle schermen horizontaal. */}
          <span
            aria-hidden
            className="pointer-events-none absolute right-2 top-2 z-[2] border border-[var(--rule-soft)] bg-[var(--paper)] px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.10em] text-[var(--module-active-500)] sm:hidden"
          >
            sleep →
          </span>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] border-collapse text-left">
              <caption className="sr-only">
                Vergelijking tussen lokaal op je apparaat en Cloud-AI, op zes punten
              </caption>
              <thead>
                <tr className="border-b border-[var(--ink)]">
                  <th scope="col" className="w-[88px] py-2 pr-3">
                    <span className="sr-only">Onderwerp</span>
                  </th>
                  <th
                    scope="col"
                    className={`py-2 pr-3 font-mono text-[10px] font-normal uppercase tracking-[0.14em] ${privacyMode ? activeHeaderClass : idleHeaderClass}`}
                  >
                    Lokaal op je apparaat
                  </th>
                  <th
                    scope="col"
                    className={`py-2 font-mono text-[10px] font-normal uppercase tracking-[0.14em] ${privacyMode ? idleHeaderClass : activeHeaderClass}`}
                  >
                    Cloud-AI
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr
                    key={row.criterion}
                    className="border-b border-dotted border-[var(--rule-soft)] align-top last:border-b-0"
                  >
                    <th
                      scope="row"
                      className="py-2.5 pr-3 text-xs font-semibold text-[var(--ink)]"
                    >
                      {row.criterion}
                    </th>
                    <td className="py-2.5 pr-3 text-xs leading-relaxed text-[var(--ink-2)]">
                      {row.lokaal}
                    </td>
                    <td className="py-2.5 text-xs leading-relaxed text-[var(--ink-2)]">{row.cloud}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
