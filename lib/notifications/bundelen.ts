/**
 * MELDINGEN VAN DEZELFDE SOORT TOT ÉÉN REGEL BUNDELEN — pure weergavelogica.
 *
 * ## Waarom
 *
 * De meldingenroute is één grote fan-out: zes van de negen meldingsoorten zijn
 * per-item-lussen zonder bundeling of bovengrens (budget ongelimiteerd,
 * `partner_transaction` tot vijftig rijen). Een testgebruiker zag zeven
 * gestapelde meldingen die op het scherm nauwelijks van elkaar te
 * onderscheiden waren, elk met een eigen "Vraag Fin"-knop (bevinding H16).
 *
 * Het bundelen gebeurt bewust **client-side**. Server-side samenvoegen zou de
 * read-state en de history-upsert breken: die hangen allebei aan het id van de
 * losse melding (`budget_<id>`), en één samengevoegde melding heeft dat id
 * niet meer. Hier blijft elke melding bestaan — alleen de weergave vouwt ze op.
 *
 * ## De regel
 *
 * Binnen één lijstsectie wordt een soort gebundeld zodra hij
 * {@link BUNDLE_MIN_ITEMS} of meer items levert. Twee losse meldingen naast
 * elkaar zijn nog te lezen; drie beginnen te stapelen. De bundel neemt de
 * plaats in van het éérste item van die soort, zodat de volgorde van de lijst
 * (nieuw → oud) niet omgegooid wordt.
 *
 * ## Wat hier NIET gebeurt
 *
 * Beslissen wélke meldingen er zijn, en met welke urgentie — dat is en blijft
 * `app/api/notifications/route.ts`. Bundelen is nadrukkelijk geen manier om
 * een te ruime "Dringend"-bak te verbergen: de drempeltakken horen te kloppen
 * vóórdat er iets opgevouwen wordt (H16-fix A ging daarom vóór fix B).
 */

import type { Notification, NotificationType } from '@/app/api/notifications/route'

/**
 * Vanaf hoeveel items van dezelfde soort we bundelen. Drie: bij twee is de
 * bundelregel zelf net zo lang als de twee meldingen die hij vervangt.
 */
export const BUNDLE_MIN_ITEMS = 3

/** Hoeveel meldingtitels we hooguit in de chat-context van een bundel meegeven. */
const MAX_AI_CONTEXT_ITEMS = 10

export type NotificationRow =
  | { kind: 'single'; key: string; notification: Notification }
  | {
      kind: 'bundle'
      key: string
      type: string
      /** "6 budgetten vragen aandacht" */
      title: string
      /** De zwaarste melding van de groep + hoeveel er nog meer zijn. */
      description: string
      items: Notification[]
      /** Aantal ongelezen items in de groep. */
      unread: number
      /**
       * Bevat de groep een ongelezen melding met de hoogste urgentie? Zo ja,
       * hoort de groep open te staan: iets écht dringends mag nooit achter een
       * vouw verdwijnen. Dit is de "escalatie klapt de groep open"-regel.
       */
      hasUrgent: boolean
      /** Chat-context voor één "Vraag Fin" over de hele groep. */
      aiContext: string
    }

/**
 * Meervoudslabel per soort. Bewust in gebruikerstaal en zonder de interne
 * type-namen; onbekende (legacy) types vallen terug op een neutraal label,
 * zoals `FALLBACK_MODULE_INFO` in `notification-item.tsx` dat ook doet.
 */
const BUNDLE_LABEL: Partial<Record<NotificationType, (n: number) => string>> = {
  budget: (n) => `${n} budgetten vragen aandacht`,
  sync: (n) => `${n} bankkoppelingen vragen aandacht`,
  partner_transaction: (n) => `${n} uitgaven van je partner`,
  holding_alert: (n) => `${n} signalen over je beleggingen`,
  spend_limit: (n) => `${n} meldingen over je grenzen`,
  budget_model_proposal: (n) => `${n} voorstellen voor het huishouden`,
  recommendation: (n) => `${n} partner-acties`,
  horizon: (n) => `${n} signalen over je toekomst`,
  briefing: (n) => `${n} briefings`,
}

function bundleTitle(type: string, count: number): string {
  const label = BUNDLE_LABEL[type as NotificationType]
  return label ? label(count) : `${count} meldingen`
}

/** De zwaarste melding eerst: laagste priority-nummer wint, gelijkspel → eerste. */
function mostUrgent(items: readonly Notification[]): Notification {
  return items.reduce((best, n) => (n.priority < best.priority ? n : best), items[0])
}

/**
 * Vouwt meldingen van dezelfde soort op tot één regel zodra er
 * {@link BUNDLE_MIN_ITEMS} of meer van zijn.
 *
 * De invoer is één reeds gefilterde lijstsectie (Dringend / Vandaag / één dag
 * uit Eerder) — niet de hele geschiedenis. Zo bundelt de functie nooit over
 * secties heen, en blijft de dag-indeling van de lijst intact.
 *
 * Volgorde-garantie: elke bundel staat op de plek van het eerste item van zijn
 * soort; soorten met minder dan de drempel blijven ongewijzigd losse regels.
 */
export function bundleNotifications(items: readonly Notification[]): NotificationRow[] {
  // Groepeer op soort, met de volgorde van eerste verschijning als leidraad.
  const byType = new Map<string, Notification[]>()
  for (const n of items) {
    const existing = byType.get(n.type)
    if (existing) existing.push(n)
    else byType.set(n.type, [n])
  }

  const bundledTypes = new Set(
    [...byType.entries()].filter(([, group]) => group.length >= BUNDLE_MIN_ITEMS).map(([type]) => type),
  )

  if (bundledTypes.size === 0) {
    return items.map((n) => ({ kind: 'single' as const, key: n.id, notification: n }))
  }

  const rows: NotificationRow[] = []
  const emitted = new Set<string>()

  for (const n of items) {
    if (!bundledTypes.has(n.type)) {
      rows.push({ kind: 'single', key: n.id, notification: n })
      continue
    }
    // Alleen bij het eerste item van deze soort komt er een bundelregel; de
    // rest is er al in opgenomen.
    if (emitted.has(n.type)) continue
    emitted.add(n.type)

    const group = byType.get(n.type)!
    const top = mostUrgent(group)
    const rest = group.length - 1

    rows.push({
      kind: 'bundle',
      // Stabiele sleutel: hangt aan de soort, niet aan de (wisselende)
      // samenstelling — anders remount React de rij bij elke poll en klapt een
      // opengeklapte groep vanzelf weer dicht.
      key: `bundle_${n.type}`,
      type: n.type,
      title: bundleTitle(n.type, group.length),
      description: rest > 0 ? `${top.title} — en ${rest} ${rest === 1 ? 'ander bericht' : 'andere'}` : top.title,
      items: group,
      unread: group.filter((i) => !i.read).length,
      hasUrgent: group.some((i) => !i.read && i.priority <= 1),
      aiContext: buildBundleAiContext(bundleTitle(n.type, group.length), group),
    })
  }

  return rows
}

/**
 * Eén chat-vraag over de hele groep in plaats van één knop per melding. De
 * lijst met titels is afgetopt: een gebruiker met vijftig partner-transacties
 * moet geen prompt van vijftig regels de chat in duwen.
 */
function buildBundleAiContext(title: string, items: readonly Notification[]): string {
  const shown = items.slice(0, MAX_AI_CONTEXT_ITEMS)
  const lines = shown.map((n) => `- ${n.title}`).join('\n')
  const overflow = items.length - shown.length
  const tail = overflow > 0 ? `\n- (en nog ${overflow} vergelijkbare meldingen)` : ''
  return `Ik heb ${title.toLowerCase()}:\n${lines}${tail}\n\nWat betekent dit samen, en wat zou ik als eerste oppakken?`
}
