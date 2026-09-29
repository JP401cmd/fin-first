// ── Tijdlijn-bèta: de ingang voor echte lezers (B38) ─────────────────────────
//
// TIJDLIJN_BETA_OPEN is de ingang van de tijdlijn-bèta (Krant 1C) voor echte
// lezers. Zolang hij `false` staat, ziet alleen een superadmin de ingang
// (fase 2). Op `true` zetten mag pas als ALLE drie gelden:
//   1. /privacy 2.4 (nieuwsprofiel + bewaartermijn) staat live;
//   2. het sjablonen-attest is door de eigenaar herbevestigd op de huidige
//      catalogus (`node scripts/krant/attest-sjablonen.mjs --herbevestig …`);
//   3. de security-run gaf GO.
// Punt 2 bewaakt tijdlijn-beta.gate.test.ts hard: de vlag op true zonder
// geldige herbevestiging maakt die test rood. Punten 1 en 3 zijn menselijke
// poorten — deze vlag omzetten is dus altijd een bewuste eigenaarsstap.
//
// PUUR: constanten, een type en twee functies — client-veilig.

import { SUPERADMIN_ROLE } from '@/lib/admin'

export const TIJDLIJN_BETA_OPEN = false

/**
 * Mag deze lezer in de tijdlijn-bèta? Zolang TIJDLIJN_BETA_OPEN false is
 * alleen een superadmin (uitrol eerst donker, besluit 28-09). Eén definitie
 * voor alle plekken die het vragen: de tijdlijncron nu, de pagina en de
 * variantroute in fase 2. Dit is een VERWERKINGSSLOT (wie krijgt een
 * tijdlijn), geen beheerrecht: niemand leest hiermee andermans inhoud.
 *
 * Bewust ÉÉN argument (eindreview M5): de vlag komt altijd uit de constante,
 * zodat geen aanroeper de gate-test kan omzeilen. De pure toets met een
 * expliciete vlag (`betaToegang`) is er alleen voor de tests; de importeurs
 * van beide staan op een allowlist in tijdlijn-beta.gate.test.ts (security G4).
 */
export function inTijdlijnBeta(rol: string | null | undefined): boolean {
  return betaToegang(rol, TIJDLIJN_BETA_OPEN)
}

/** De pure toets achter inTijdlijnBeta — alleen voor tests (zie de allowlist). */
export function betaToegang(rol: string | null | undefined, open: boolean): boolean {
  return open || rol === SUPERADMIN_ROLE
}

/** De herbevestiging zoals `attest-sjablonen.mjs --herbevestig` 'm schrijft. */
export interface AttestHerbevestiging {
  door: string
  rol: string
  at: string
  catalogusSha256: string
  juridischeToets: string
}

/**
 * Is het attest door de eigenaar herbevestigd op precies deze catalogus?
 * `catalogusSha256` = sha256 van sjablonen-catalogus.ts met LF-regeleinden.
 * Een herbevestiging op een oudere catalogus is vervallen: de eigenaar heeft
 * de huidige teksten niet gezien.
 */
export function herbevestigingGeldig(attest: { herbevestiging?: AttestHerbevestiging | null }, catalogusSha256: string): boolean {
  const hb = attest.herbevestiging
  if (!hb) return false
  // Een struikeldraad, geen bewijs (het script controleert niet wíé het draait) —
  // maar dan wel een volledige: een lege toetslink of een kapotte datum telt niet
  // (security-run R1, 🟡-1). Dezelfde eisen staan in scripts/krant/check-tijdlijn-poort.mjs.
  return (
    hb.door === 'eigenaar' &&
    hb.catalogusSha256 === catalogusSha256 &&
    typeof hb.juridischeToets === 'string' &&
    /^https:\/\/\S+$/.test(hb.juridischeToets) &&
    typeof hb.at === 'string' &&
    Number.isFinite(Date.parse(hb.at))
  )
}
