'use client'

/**
 * Gedeelde bouwstenen voor de levensstrategie-bodies (AOW, werk, pensioenpot) — TPR-15 stap 3.
 *
 * Eén body rendert op twee plekken, elk met zijn eigen, al bestaande preview:
 *  - `preview` — /toekomst/gebeurtenissen: `previewFireAge` op de PreviewBaseline van die
 *    pagina, getoond als "Vrijheidsleeftijd: nu → concept" in het formulier (ongewijzigd);
 *  - `kern`    — de plan-review-wizard: `runRegelProjection` op de client-veilige snapshot met
 *    een `lifeEvent`-override, getoond als delta in de footer (zoals de andere wizard-editors).
 * Beide vervangen de rij met `vervangLifeEvent`, dus met dezelfde regel. Hier wordt niets zelf
 * berekend: de kern rekent (consume, don't recompute).
 *
 * `slaStrategieOp` is het ene schrijfpad van beide plekken: `PUT /api/life-events/strategie`.
 */

import { useDeferredValue, useMemo, type ReactNode } from 'react'
import type { LifeEvent } from '@/lib/horizon-data'
import { previewFireAge, type PreviewBaseline } from '@/lib/strategy-preview'
import {
  runRegelProjection,
  vervangLifeEvent,
  type RegelSimOverride,
  type RegelSimSnapshot,
} from '@/lib/future/regel-sim'
import type { StrategieBody } from '@/lib/life-events/strategie-write'
import { FireDeltaFooter, fireDeltaMonths } from '@/components/future/regels/shared'

export type StrategieImpactBron =
  | { kind: 'preview'; baseline: PreviewBaseline | null; allEvents: LifeEvent[] }
  | { kind: 'kern'; snapshot: RegelSimSnapshot | null }

export type StrategieVervang = NonNullable<RegelSimOverride['lifeEvent']>['vervang']

export interface StrategieImpact {
  /** Vrijheidsleeftijd met de opgeslagen rijen; `null` = geen run. */
  savedAge: number | null
  /** Vrijheidsleeftijd met het concept; `null` = geen run of ongeldige invoer. */
  draftAge: number | null
  /** Toont het formulier zelf de regel "Vrijheidsleeftijd: nu → concept"? (alleen `preview`) */
  inline: boolean
  /** Voor de footer van de host (alleen `kern`). */
  footerInfo?: ReactNode
  /** Verandert wanneer de footer-info verandert; voor het publiceer-effect. */
  footerKey: number | null
}

/**
 * @param draft - het concept als `life_events`-rij; `null` = ongeldige invoer (geen concept-run).
 * @param vervang - welke opgeslagen rij(en) het concept vervangt.
 */
export function useStrategieImpact(
  bron: StrategieImpactBron,
  draft: LifeEvent | null,
  vervang: StrategieVervang,
): StrategieImpact {
  const vervangKey = 'eventType' in vervang ? `type:${vervang.eventType}` : `id:${vervang.id ?? ''}`
  const baseline = bron.kind === 'preview' ? bron.baseline : null
  const allEvents = bron.kind === 'preview' ? bron.allEvents : null
  const snapshot = bron.kind === 'kern' ? bron.snapshot : null

  // `preview` — exact de berekening van vóór TPR-15 (synchroon, per concept-wijziging).
  const preview = useMemo(() => {
    if (bron.kind !== 'preview' || !baseline || !allEvents) return null
    return {
      savedAge: previewFireAge(baseline, allEvents),
      draftAge: draft ? previewFireAge(baseline, [...vervangLifeEvent(allEvents, { vervang, event: draft })]) : null,
    }
    // `vervang` is via vervangKey gedekt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bron.kind, baseline, allEvents, draft, vervangKey])

  // `kern` — de kern-run van de Tijdas met alleen deze rij vervangen; uitgesteld bij typen.
  const deferredDraft = useDeferredValue(draft)
  const kernBasis = useMemo(() => (snapshot ? runRegelProjection(snapshot) : null), [snapshot])
  const kernConcept = useMemo(
    () =>
      snapshot && deferredDraft
        ? runRegelProjection(snapshot, { lifeEvent: { vervang, event: deferredDraft } })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot, deferredDraft, vervangKey],
  )

  if (bron.kind === 'preview') {
    return { savedAge: preview?.savedAge ?? null, draftAge: preview?.draftAge ?? null, inline: true, footerKey: null }
  }
  return {
    savedAge: kernBasis?.fireAgeFractional ?? null,
    draftAge: kernConcept?.fireAgeFractional ?? null,
    inline: false,
    footerInfo: kernBasis && kernConcept ? <FireDeltaFooter baseline={kernBasis} draft={kernConcept} /> : undefined,
    footerKey: kernBasis && kernConcept ? fireDeltaMonths(kernBasis, kernConcept) : null,
  }
}

/** Het ene schrijfpad voor AOW, werk en pensioenpotten. */
export async function slaStrategieOp(
  body: StrategieBody,
): Promise<{ ok: true; id: string } | { ok: false; fout: string }> {
  try {
    const res = await fetch('/api/life-events/strategie', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as { id?: unknown; error?: unknown }
    if (!res.ok || typeof data.id !== 'string') {
      return { ok: false, fout: typeof data.error === 'string' ? data.error : 'Opslaan is niet gelukt.' }
    }
    return { ok: true, id: data.id }
  } catch {
    return { ok: false, fout: 'Opslaan is niet gelukt.' }
  }
}

/** Verwijdert een eigen werk-rij of pensioenpot via dezelfde route. */
export async function verwijderStrategie(id: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/life-events/strategie?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (res.ok) return null
    const data = (await res.json().catch(() => ({}))) as { error?: unknown }
    return typeof data.error === 'string' ? data.error : 'Verwijderen is niet gelukt.'
  } catch {
    return 'Verwijderen is niet gelukt.'
  }
}
