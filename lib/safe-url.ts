// ── Veilige URL's — gedeelde toetsen voor links en nieuwsbronnen ─────────────
//
// Twee toetsen, allebei puur (geen node-imports: ook bruikbaar in clientcode):
//
// 1. `safeHttpUrl` — een link die we RENDEREN (`<a href>`): alleen http(s),
//    zodat een `javascript:`/`data:`-URL uit een bron of een model nooit een
//    klikbare link wordt. Was een lokale helper in RapportNieuws.tsx.
//
// 2. `isVeiligeBronUrl` — een adres dat de SERVER ophaalt (nieuwsbron, en elke
//    redirect-hop daarvan). Een beheerder kan bronnen bewerken; zonder deze
//    toets is het schrijfpad een SSRF-ingang met leesbare respons (een
//    `web_pagina` bewaart de sectietekst). Eisen: https, een DNS-naam met een
//    punt (geen IP-literal v4/v6, geen localhost/.local/.internal/…), geen
//    eigen poort, geen gebruikersnaam/wachtwoord in de URL.
//
//    Restrisico (bewust, gedocumenteerd in ADR 0176): een publieke DNS-naam
//    die naar een privé-adres resolvet (DNS-rebinding) vangt deze toets niet;
//    daarvoor is een resolve-en-pin-stap in de fetch nodig.

/** Een link die we mogen renderen: http(s), anders null. */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString()
    return null
  } catch {
    return null
  }
}

const VERBODEN_ACHTERVOEGSELS = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home', '.corp', '.arpa']

/** Waarom een bron-URL niet mag; null = toegestaan. Voor foutmeldingen en de brongezondheid. */
export function bronUrlBezwaar(raw: string): string | null {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return 'geen geldige URL'
  }
  if (u.protocol !== 'https:') return 'alleen https'
  if (u.username || u.password) return 'geen inloggegevens in de URL'
  if (u.port !== '') return 'geen eigen poort'
  const host = u.hostname.toLowerCase().replace(/\.$/, '')
  if (!host || host.startsWith('[') || host.includes(':')) return 'geen IP-adres'
  // `new URL` normaliseert ook 2130706433 en 0x7f.1 naar een gestippeld IPv4-adres.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return 'geen IP-adres'
  if (host === 'localhost' || !host.includes('.')) return 'geen lokale host'
  if (VERBODEN_ACHTERVOEGSELS.some((s) => host.endsWith(s))) return 'geen lokale host'
  return null
}

/** Mag de server deze URL ophalen (ook als redirect-hop)? */
export function isVeiligeBronUrl(raw: string): boolean {
  return bronUrlBezwaar(raw) === null
}

/** Zelfde site, met of zonder `www.` — de grens voor redirects en voor links op een lijstpagina. */
export function zelfdeHost(a: string, b: string): boolean {
  try {
    const kaal = (h: string) => h.toLowerCase().replace(/^www\./, '')
    return kaal(new URL(a).hostname) === kaal(new URL(b).hostname)
  } catch {
    return false
  }
}
