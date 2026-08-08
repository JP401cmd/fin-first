'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Shield, Eye, EyeOff, Server, FileText } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { LegalEmail } from '@/components/legal/legal-email'

/**
 * AiPrivacySettings — AI-toggle, financiële toelichting en de
 * transparantie-blokken (wat wel/niet gedeeld wordt, dataverwerking) plus
 * de volledige privacyverklaring. Geëxtraheerd uit de legacy
 * /identity/instellingen-monolith (tab 'privacy' + privacy-modal) naar
 * /mijn/privacy (plan A-2, ontmanteling settings-monolith).
 *
 * Hergebruikt exact dezelfde profielvelden (ai_enabled, financial_context)
 * en optimistische update-logica als de monolith — geen nieuwe data-logica.
 */
export function AiPrivacySettings() {
  const supabase = createClient()

  const [aiEnabled, setAiEnabled] = useState(true)
  const [aiSaving, setAiSaving] = useState(false)
  const [financialContext, setFinancialContext] = useState('')
  const [financialContextSaved, setFinancialContextSaved] = useState('')
  const [contextSaving, setContextSaving] = useState(false)
  const [contextMessage, setContextMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('profiles')
        .select('ai_enabled, financial_context')
        .eq('id', user.id)
        .single()
      if (!active || !data) return
      if (data.ai_enabled != null) setAiEnabled(data.ai_enabled as boolean)
      if (data.financial_context) {
        setFinancialContext(data.financial_context as string)
        setFinancialContextSaved(data.financial_context as string)
      }
    })()
    return () => {
      active = false
    }
  }, [supabase])

  const toggleAiEnabled = useCallback(
    async (enabled: boolean) => {
      setAiEnabled(enabled)
      setAiSaving(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Not authenticated')
        const { error } = await supabase.from('profiles').update({ ai_enabled: enabled }).eq('id', user.id)
        if (error) throw error
      } catch {
        setAiEnabled(!enabled)
      }
      setAiSaving(false)
    },
    [supabase],
  )

  const saveFinancialContext = useCallback(async () => {
    setContextSaving(true)
    setContextMessage(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { error } = await supabase
        .from('profiles')
        .update({ financial_context: financialContext || null })
        .eq('id', user.id)
      if (error) throw error
      setFinancialContextSaved(financialContext)
      setContextMessage({ type: 'success', text: 'Toelichting opgeslagen' })
      setTimeout(() => setContextMessage(null), 3000)
    } catch {
      setContextMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    }
    setContextSaving(false)
  }, [supabase, financialContext])

  return (
    <section className="mx-auto max-w-3xl px-4 sm:px-6 pb-12">
      <section className="border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <div className="px-4 sm:px-6 py-6 space-y-6">
          {/* ── Financiële toelichting ── */}
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Financiële toelichting
            </p>
            <p className="text-xs text-[var(--ink-3)] leading-relaxed">
              Beschrijf je financiële situatie in eigen woorden. Deze tekst wordt gebruikt als extra
              context voor het personaliseren van je nieuws.
            </p>

            <div>
              <textarea
                value={financialContext}
                onChange={(e) => {
                  if (e.target.value.length <= 1000) setFinancialContext(e.target.value)
                }}
                placeholder="Bijv. ik ben zzp'er in de IT, spaar maandelijks ~€1.500, heb een hypotheek op mijn appartement en beleg via DeGiro..."
                rows={5}
                className="w-full border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] focus:outline-none focus:ring-2 focus:ring-zinc-900/10 resize-y"
              />
              <div className="mt-1 flex justify-end">
                <span
                  className={`text-xs tabular-nums ${financialContext.length >= 950 ? 'text-amber-600' : 'text-[var(--ink-4)]'}`}
                >
                  {financialContext.length} / 1.000
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={saveFinancialContext}
                disabled={contextSaving || financialContext === financialContextSaved}
                className="bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
              >
                {contextSaving ? 'Opslaan...' : 'Opslaan'}
              </button>
              {contextMessage && (
                <span
                  className={`text-sm ${contextMessage.type === 'success' ? 'text-positive' : 'text-negative'}`}
                >
                  {contextMessage.text}
                </span>
              )}
              {financialContext !== financialContextSaved && !contextMessage && (
                <span className="text-xs text-amber-600">Niet-opgeslagen wijzigingen</span>
              )}
            </div>
          </div>

          <div className="border-t border-dashed border-[var(--border-ed)]" />

          {/* AI Toggle */}
          <div className="flex items-center justify-between border border-[var(--border-ed)] p-4">
            <div className="flex-1 pr-4">
              <h3 className="text-sm font-semibold text-[var(--ink)]">AI-features inschakelen</h3>
              <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                {aiEnabled
                  ? 'AI-briefing, chat en gepersonaliseerd nieuws zijn actief.'
                  : 'AI is uitgeschakeld. De app werkt als puur financieel dashboard.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={aiEnabled}
              aria-label={`AI-features ${aiEnabled ? 'uitschakelen' : 'inschakelen'}`}
              disabled={aiSaving}
              onClick={() => toggleAiEnabled(!aiEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-wil-500 disabled:opacity-50 ${aiEnabled ? 'bg-wil-500' : 'bg-zinc-300'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${aiEnabled ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>

          {/* Normalizing intro */}
          <div className="flex items-start gap-3 bg-wil-50/40 p-4">
            <Shield className="mt-0.5 h-5 w-5 text-wil-500 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-[var(--ink)]">Jij bent eigenaar van je data</p>
              <p className="mt-1 text-sm text-[var(--ink-2)] leading-relaxed">
                TriFinity gebruikt AI om je financiële inzichten te geven. Hieronder zie je precies welke
                informatie wordt gedeeld — en wat altijd privé blijft. Je kunt AI op elk moment uitschakelen.
              </p>
            </div>
          </div>

          {/* Wat WEL wordt gedeeld */}
          <div className="border border-[var(--border-ed)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center bg-wil-50">
                <Eye className="h-4 w-4 text-wil-600" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-[var(--ink)]">Wat wordt gedeeld</h3>
            </div>
            <ul className="space-y-2 text-sm text-[var(--ink-2)]">
              {[
                'Geaggregeerde bedragen (netto vermogen, totale inkomsten/uitgaven)',
                "Percentages en ratio's (spaarquote, vrijheidspercentage, SWR)",
                'Budgetcategorieën en bijbehorende bedragen',
                'Leeftijd (niet je geboortedatum)',
                'Huishoudtype en temporal balance level',
                'De vraag die je zelf aan Fin typt — zoals jij hem typt',
                'Bij document-import: de volledige tekst van het document dat je uploadt',
                'Bij abonnement-herkenning: de omschrijvingen van je transacties',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Wat NIET wordt gedeeld */}
          <div className="border border-[var(--border-ed)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center bg-negative/10">
                <EyeOff className="h-4 w-4 text-negative" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-[var(--ink)]">Wat wordt gemaskeerd</h3>
            </div>
            <p className="mb-3 text-xs text-[var(--ink-3)] leading-relaxed">
              Op de chat-, categorisatie- en nieuwsroutes maskeren we
              persoonsgegevens automatisch vóór verzending. Bij document-import
              en abonnement-herkenning gaat de brontekst zelf mee — zonder die
              inhoud kan de functie niet werken.
            </p>
            <ul className="space-y-2 text-sm text-[var(--ink-2)]">
              {[
                "Namen (vervangen door 'gebruiker' / 'partner')",
                'IBAN-nummers en bankrekeningen',
                'BSN (burgerservicenummer)',
                'E-mailadressen en telefoonnummers',
                'Adressen en postcodes',
                'Geboortedatum (vervangen door leeftijd)',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-negative/70" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Dataverwerking */}
          <div className="border border-[var(--border-ed)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center bg-horizon-50">
                <Server className="h-4 w-4 text-horizon-600" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-[var(--ink)]">Hoe je data wordt verwerkt</h3>
            </div>
            <ul className="space-y-2 text-sm text-[var(--ink-2)]">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-horizon-400" />
                <span>
                  <strong>Geen training:</strong> je gegevens worden door de AI-providers niet gebruikt
                  om modellen te trainen
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-horizon-400" />
                <span>
                  <strong>Korte provider-retentie:</strong> AI-providers (Anthropic, OpenAI) bewaren
                  verzoeken kortdurend volgens hun eigen voorwaarden, o.a. voor misbruikdetectie
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-horizon-400" />
                <span>
                  <strong>Data-minimalisatie:</strong> per functie gaat alleen de context mee die voor
                  die taak nodig is — nooit je volledige dataset
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-horizon-400" />
                <span>
                  <strong>Versleuteld:</strong> alle communicatie verloopt via HTTPS/TLS
                </span>
              </li>
            </ul>
          </div>

          {/* Shield badge */}
          <div className="flex items-center gap-2 bg-[var(--subtle)] px-4 py-3">
            <Shield className="h-4 w-4 shrink-0 text-wil-600" aria-hidden="true" />
            <p className="text-xs text-[var(--ink-3)]">
              Waar het kan maskeren we persoonsgegevens automatisch vóór verzending; bij document-import
              en sommige analyses gaat de inhoud zelf mee. AI is altijd volledig uitschakelbaar.
            </p>
          </div>

          {/* Full privacy statement link */}
          <button
            type="button"
            onClick={() => setPrivacyModalOpen(true)}
            className="flex items-center gap-2 text-sm font-medium text-wil-600 hover:text-wil-700 transition-colors"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Volledige privacyverklaring
          </button>
        </div>
      </section>

      {/* Privacy statement modal */}
      <BottomSheet open={privacyModalOpen} onClose={() => setPrivacyModalOpen(false)} title="Privacyverklaring">
        <div className="space-y-6 px-1 pb-4">
          <p className="text-sm leading-relaxed text-[var(--ink-2)]">
            TriFinity hecht grote waarde aan de bescherming van je persoonsgegevens. Deze verklaring
            beschrijft welke gegevens we verzamelen, hoe we ze gebruiken en welke rechten je hebt.
          </p>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">1. Welke gegevens verzamelen we</h3>
            <ul className="space-y-1.5 text-sm text-[var(--ink-2)]">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                <span>
                  <strong>Accountgegevens:</strong> e-mailadres en versleuteld wachtwoord
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                <span>
                  <strong>Profielgegevens:</strong> naam, geboortedatum, huishoudtype
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                <span>
                  <strong>Financiële gegevens:</strong> bankrekeningen, transacties, budgetten,
                  bezittingen, schulden, doelen
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                <span>
                  <strong>Voorkeuren:</strong> widget-instellingen, kleurconfiguratie, FIRE-parameters
                </span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">2. Waar worden je gegevens opgeslagen</h3>
            <ul className="space-y-1.5 text-sm text-[var(--ink-2)]">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-horizon-400" />
                <span>
                  <strong>Database:</strong> Supabase (PostgreSQL) met row-level security — alleen jij hebt
                  toegang tot jouw data
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-horizon-400" />
                <span>
                  <strong>AI-providers:</strong> Anthropic of OpenAI (VS) ontvangen per functie de
                  benodigde context — op de meeste routes gemaskeerd, bij document-import en
                  abonnement-herkenning de inhoud zelf. Geen training op jouw data.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-horizon-400" />
                <span>
                  <strong>Overige verwerkers:</strong> hosting via Vercel (EU-regio), e-mail via Resend,
                  en — alleen als jij koppelt — TrueLayer (bank) en Trading 212 (broker). De volledige
                  sub-verwerkerslijst staat in de{' '}
                  <a
                    href="/privacy"
                    className="font-medium text-wil-600 hover:text-wil-700 underline underline-offset-2"
                  >
                    privacyverklaring
                  </a>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-horizon-400" />
                <span>
                  <strong>Lokaal:</strong> sommige voorkeuren worden opgeslagen in je browser (localStorage)
                </span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">3. Hoe lang bewaren we je data</h3>
            <ul className="space-y-1.5 text-sm text-[var(--ink-2)]">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                <span>
                  <strong>Financiële data:</strong> zolang je account actief is
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                <span>
                  <strong>AI-verwerking:</strong> providers bewaren verzoeken kortdurend volgens hun
                  eigen voorwaarden en trainen niet op jouw data
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                <span>
                  <strong>Na verwijdering:</strong> je persoonlijke en financiële gegevens worden direct
                  permanent verwijderd; alleen beperkte beveiligingslogs (e-mail-log 12 mnd, audit-log
                  12–24 mnd, zonder financiële inhoud) blijven tijdelijk bewaard
                </span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">4. Jouw rechten</h3>
            <p className="mb-2 text-sm text-[var(--ink-2)]">Op grond van de AVG heb je de volgende rechten:</p>
            <ul className="space-y-1.5 text-sm text-[var(--ink-2)]">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                <span>
                  <strong>Inzage:</strong> je kunt al je opgeslagen data bekijken in de app
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                <span>
                  <strong>Correctie:</strong> je kunt je gegevens op elk moment aanpassen via Profiel
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                <span>
                  <strong>Verwijdering:</strong> je kunt alle data wissen via Geavanceerd &gt; Gegevens
                  resetten
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                <span>
                  <strong>Bezwaar:</strong> je kunt AI-verwerking uitschakelen via de AI-toggle hierboven
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-wil-400" />
                <span>
                  <strong>Overdraagbaarheid:</strong> je kunt je data exporteren via Geavanceerd &gt; Data
                  export
                </span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">5. Contact</h3>
            <p className="text-sm text-[var(--ink-2)] leading-relaxed">
              Heb je vragen over je privacy of wil je een van je rechten uitoefenen? Neem contact op via{' '}
              <LegalEmail
                kind="privacy"
                className="font-medium text-wil-600 hover:text-wil-700 underline underline-offset-2"
              />
              . Dat adres volgt zodra TriFinity een eigen internetdomein heeft; zolang de app in
              besloten testfase is, loopt contact via degene die je je uitnodiging heeft gestuurd.
            </p>
          </div>

          <div className="border-t border-[var(--border-ed)] pt-4">
            <p className="text-xs text-[var(--ink-4)]">
              Versie 2.1 — concept, laatst bijgewerkt: 7 augustus 2026. De volledige, actuele
              privacyverklaring staat op{' '}
              <a
                href="/privacy"
                className="font-medium text-wil-600 hover:text-wil-700 underline underline-offset-2"
              >
                /privacy
              </a>
              .
            </p>
          </div>
        </div>
      </BottomSheet>
    </section>
  )
}
