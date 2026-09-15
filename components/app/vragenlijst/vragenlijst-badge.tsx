'use client'

/**
 * VragenlijstBadge — de teller op Fins bubbel (ADR 0147).
 *
 * BEWUSTE UITZONDERING OP ADR 0130 D2 / ADR 0095. Die besluiten houden Fins
 * bubbel vrij van tellers: een badge zonder scherpe betekenis wordt een
 * permanent rood stipje dat je leert wegkijken. ADR 0147 legt daarom eerst de
 * betekenis vast en pas daarna de badge: **N = het aantal vragenlijsten dat je
 * nú kunt invullen**. Eindig, scherp, en hij daalt alleen door handelen
 * (invullen of definitief weigeren) — niet door kijken. De eigenaar heeft deze
 * uitzondering expliciet genomen; breid 'm niet uit naar andere tellingen
 * zonder een nieuw besluit.
 *
 * Buiten `VragenlijstSignaalProvider` (en bij N = 0) rendert dit component
 * niets — een uitnodiging mag nooit ergens een gat achterlaten.
 */

import { useVragenlijstSignaalOptional } from './vragenlijst-signaal-provider'

/** Boven dit aantal tonen we "9+" — het cijfer moet in een cirkel passen. */
const CAP = 9

export function VragenlijstBadge({ className = '' }: { className?: string }) {
  const signaal = useVragenlijstSignaalOptional()
  const aantal = signaal?.openCount ?? 0
  if (aantal <= 0) return null

  const label = `${aantal} ${aantal === 1 ? 'vragenlijst' : 'vragenlijsten'} om in te vullen`

  return (
    <span
      role="status"
      aria-label={label}
      data-testid="vragenlijst-badge"
      className={`flex h-4 min-w-4 items-center justify-center rounded-full bg-fin-600 px-1 font-mono text-[10px] font-bold leading-none tabular-nums text-white ring-2 ring-[var(--paper)] ${className}`}
    >
      {aantal > CAP ? `${CAP}+` : aantal}
    </span>
  )
}
