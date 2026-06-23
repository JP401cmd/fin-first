/**
 * De drie fase-bubbels van de tips-overlay op /toekomst:
 *  • Opbouw — links-onder, accentueert het opbouw-segment;
 *  • Financiële vrijheid — midden-boven, accentueert de FIRE-stip;
 *  • Afbouw — rechts-onder, accentueert het afbouw-segment.
 *
 * In een eigen, lichte module zodat de regressietest het exacte aantal, de
 * kickers en de emphasis-mapping kan vastpinnen tegen drift — zonder de zware
 * `horizon-client` te hoeven laden. Puur informatieve leke-uitleg in
 * "Geld is opgeslagen tijd"-geest: géén bedragen, géén rekenlogica
 * (consume-only). De gewogen plaatsing + leader-lines/kaders/FIRE-cirkel zit in
 * `ToekomstOverlay`; de emphasis-koppeling laat de juiste grafiekfase oplichten.
 */
import { OVERLAY_ICONS, type OverlayBalloonDef } from './toekomst-overlay'

export const TOEKOMST_OVERLAY_BALLOONS: OverlayBalloonDef[] = [
  // ── 1. Opbouw — links-onder, wijst naar het opbouw-segment ──
  {
    id: 'opbouw',
    icon: OVERLAY_ICONS.accumulation,
    kicker: 'Opbouw',
    body: 'Je rendement plus wat je kunt sparen, min de kosten van schulden en belasting: dat samen is je opbouw — de tijd die je nu opslaat en de lijn omhoog duwt.',
    row: 'top',
    slot: 'bottom-left',
    emphasis: 'accumulation',
  },
  // ── 2. Financiële vrijheid — midden-boven, wijst naar de FIRE-stip ──
  {
    id: 'vrijheid',
    icon: OVERLAY_ICONS.freedom,
    kicker: 'Financiële vrijheid',
    body: 'De geschatte leeftijd waarop werken een keuze wordt. Door vooruit te plannen en bewust met geld om te gaan beïnvloed je die leeftijd — bewust minder werken, een gift doen, of die minder betaalde baan waar je passie ligt. Laat inzicht je leiden naar je eigen keuzes.',
    row: 'bottom',
    slot: 'top-center',
    emphasis: 'fire',
  },
  // ── 3. Afbouw — rechts-onder, wijst naar het afbouw-segment ──
  {
    id: 'afbouw',
    icon: OVERLAY_ICONS.withdrawal,
    kicker: 'Afbouw',
    body: 'Hier vervangt uitgeven het sparen: je hebt immers geld nodig om van te leven. Door met je voorkeuren te experimenteren — bijvoorbeeld een erfenis nalaten — zie je meteen wat dat met je toekomst doet.',
    row: 'bottom',
    slot: 'bottom-right',
    emphasis: 'withdrawal',
  },
]
