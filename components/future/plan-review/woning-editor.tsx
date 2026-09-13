'use client'

/**
 * Stap 4 "Je huis en ander vast bezit" inline in de plan-review (TPR-15).
 *
 * Twee soorten instellingen, één tegelijk (zoals stap 5):
 *  - de woonstrategie van het eigen huis — de BESTAANDE `HousingStrategySection` (zelfde
 *    component en schrijfroute `/api/housing-strategy` als de Huis-strategie-modal), in
 *    host-modus: de wizard rendert de opslaanknop;
 *  - de verkoopinstelling per eigen niet-liquide bezitting — de BESTAANDE
 *    `SaleConfigFields` uit het bezittingenformulier, opgeslagen via de smalle route
 *    `PATCH /api/assets/[id]/sale-config` (besluit eigenaar 13 sep 2026: alle eigen
 *    niet-liquide bezittingen behalve het huis).
 *
 * Wisselen laat een niet-opgeslagen concept van het vorige onderdeel vallen. Het live
 * effect draait op de client-veilige snapshot (`runRegelProjection` met een
 * `assetSaleConfigs`-override); de kern rekent, hier wordt niets zelf berekend.
 */

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { HousingStrategySection } from '@/components/future/strategie/housing-strategy-section'
import { SaleConfigFields } from '@/components/core/sale-config-fields'
import { FireDeltaFooter, fireFooterSleutel } from '@/components/future/regels/shared'
import type { RegelEditActionsState } from '@/components/future/regels/types'
import { runRegelProjection, type RegelSimSnapshot } from '@/lib/future/regel-sim'
import { draftToSaleConfig, saleConfigToDraft, type SaleConfigDraft } from '@/lib/sale-config-draft'
import type { SaleConfig } from '@/lib/sale-config'
import type { PlanReviewVastBezit } from '@/lib/plan-review/editor-context'
import type { PlanReviewEditorProps } from './editors'

const HUIS = 'eigen-woning'

/** Zelfde grenzen als de schrijfroute; zo blijft "Opslaan" uit tot de route het accepteert. */
function saleConfigFout(cfg: SaleConfig): string | null {
  if (cfg.stand === 'niet_verkopen') return null
  if (cfg.stand === 'vast_moment' && cfg.triggerAge == null && !cfg.triggerDate) {
    return 'Vul een leeftijd of datum in voor de verkoop.'
  }
  if (cfg.triggerAge != null && cfg.triggerAge > 120) return 'Vul een leeftijd tot 120 in.'
  if (cfg.salesCostsPct != null && cfg.salesCostsPct > 0.2) {
    return 'Verkoopkosten kunnen hier maximaal 20% zijn. Laat het veld leeg voor de standaard van dit type.'
  }
  return null
}

export function WoningEditor({ context, onActionsChange, onSaved }: PlanReviewEditorProps) {
  const woning = context.woning
  const onderdelen = useMemo(
    () => [
      ...(woning?.heeftEigenHuis ? [{ key: HUIS, label: 'Eigen woning' }] : []),
      ...(woning?.vastBezit ?? []).map((b) => ({ key: b.id, label: b.name })),
    ],
    [woning],
  )
  const [actief, setActief] = useState<string | null>(onderdelen[0]?.key ?? null)
  const woonstrategieIngesteld = woning?.woonstrategieIngesteld ?? false
  // Een save die pas terugkomt nadat de gebruiker naar een ander onderdeel wisselde, mag de
  // stap niet bevestigen: dan zou het concept van het nieuwe onderdeel stil verloren gaan.
  const actiefRef = useRef(actief)
  useEffect(() => {
    actiefRef.current = actief
  }, [actief])

  // Zonder opgeslagen woonstrategie telt de getoonde standaard (volledig meetellen) nog niet
  // als keuze: dan is opslaan nodig om de stap te kunnen bevestigen.
  const huisActions = useCallback(
    (s: RegelEditActionsState) => onActionsChange({ ...s, changed: (s.changed ?? true) || !woonstrategieIngesteld }),
    [onActionsChange, woonstrategieIngesteld],
  )
  const huisOpgeslagen = useCallback(() => {
    if (actiefRef.current === HUIS) onSaved({ woonstrategieGeschreven: true })
  }, [onSaved])
  const verkoopOpgeslagen = useCallback(
    (bezitId: string) => {
      if (actiefRef.current === bezitId) onSaved({ woonstrategieGeschreven: false })
    },
    [onSaved],
  )

  const niets = onderdelen.length === 0
  useEffect(() => {
    if (niets) onActionsChange({ canSave: false, saving: false, save: () => {}, changed: false })
  }, [niets, onActionsChange])

  if (!woning) {
    return (
      <p role="alert" className="text-xs text-negative">
        Je huis en bezittingen konden niet geladen worden. Sluit deze stap en probeer het later opnieuw.
      </p>
    )
  }

  if (niets) {
    return (
      <p className="text-xs text-[var(--ink-3)]">
        Er is hier geen eigen woning of eigen vast bezit om in te stellen. Bezit dat op naam van je partner staat, stel
        je in via diens eigen account.
      </p>
    )
  }

  const bezit = woning.vastBezit.find((b) => b.id === actief) ?? null

  return (
    <div className="space-y-4">
      {onderdelen.length > 1 && (
        <div role="group" aria-label="Wat pas je aan" className="flex flex-wrap gap-1.5">
          {onderdelen.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setActief(o.key)}
              aria-pressed={actief === o.key}
              className={`inline-flex min-h-[44px] items-center rounded-full border px-3 text-xs font-semibold transition-colors ${
                actief === o.key
                  ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                  : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:text-[var(--ink)]'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {actief === HUIS ? (
        <HousingStrategySection
          key={HUIS}
          showHeader={false}
          kernelRawContext={context.snapshot?.rawContext ?? null}
          onActionsChange={huisActions}
          onSaved={huisOpgeslagen}
        />
      ) : bezit ? (
        <VerkoopinstellingBody
          key={bezit.id}
          bezit={bezit}
          schulden={woning.schulden}
          snapshot={context.snapshot}
          onActionsChange={onActionsChange}
          onSaved={() => verkoopOpgeslagen(bezit.id)}
        />
      ) : null}
    </div>
  )
}

function VerkoopinstellingBody({
  bezit,
  schulden,
  snapshot,
  onActionsChange,
  onSaved,
}: {
  bezit: PlanReviewVastBezit
  schulden: readonly { id: string; name: string }[]
  snapshot: RegelSimSnapshot | null
  onActionsChange: (s: RegelEditActionsState) => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<SaleConfigDraft>(() => saleConfigToDraft(bezit.sale_config))
  const [opgeslagen, setOpgeslagen] = useState<SaleConfig>(() => draftToSaleConfig(saleConfigToDraft(bezit.sale_config)))
  const [saving, setSaving] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const config = useMemo(() => draftToSaleConfig(draft), [draft])
  const invoerFout = saleConfigFout(config)
  const changed = JSON.stringify(config) !== JSON.stringify(opgeslagen)
  const canSave = !saving && invoerFout == null

  // Live effect: dezelfde kern-run als de Tijdas, met alleen deze rij vervangen.
  const baseline = useMemo(() => (snapshot ? runRegelProjection(snapshot) : null), [snapshot])
  const deferredConfig = useDeferredValue(config)
  const draftProj = useMemo(
    () =>
      snapshot && invoerFout == null
        ? runRegelProjection(snapshot, { assetSaleConfigs: { [bezit.id]: deferredConfig } })
        : null,
    [snapshot, bezit.id, deferredConfig, invoerFout],
  )

  const saveRef = useRef(async () => {})
  useEffect(() => {
    saveRef.current = async () => {
      if (invoerFout != null) return
      setSaving(true)
      setFout(null)
      try {
        const res = await fetch(`/api/assets/${encodeURIComponent(bezit.id)}/sale-config`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sale_config: config }),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: unknown }
          setFout(typeof data.error === 'string' ? data.error : 'Opslaan is niet gelukt.')
          return
        }
        setOpgeslagen(config)
        onSaved()
      } catch {
        setFout('Opslaan is niet gelukt.')
      } finally {
        setSaving(false)
      }
    }
  })

  const footerSleutel = baseline && draftProj ? fireFooterSleutel(baseline, draftProj) : null
  useEffect(() => {
    onActionsChange({
      canSave,
      saving,
      save: () => void saveRef.current(),
      footerInfo: baseline && draftProj ? <FireDeltaFooter baseline={baseline} draft={draftProj} /> : undefined,
      changed,
    })
    // baseline/draftProj zijn useMemo-stabiel; footerSleutel bewaakt republish.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onActionsChange, canSave, saving, footerSleutel, changed])

  return (
    <div className="space-y-3">
      <SaleConfigFields draft={draft} onChange={setDraft} activeDebts={schulden}>
        <p className="text-sm font-medium text-[var(--ink)]">{bezit.name}</p>
      </SaleConfigFields>
      {invoerFout && (
        <p role="alert" className="text-xs text-negative">
          {invoerFout}
        </p>
      )}
      {fout && (
        <p role="alert" className="text-xs text-negative">
          {fout}
        </p>
      )}
    </div>
  )
}
