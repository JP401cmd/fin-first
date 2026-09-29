/**
 * De bovenkant van een leesvenster op een logtabel.
 *
 * WAAROM EEN BOVENKANT. De beheerschermen lezen logtabellen "nieuwste eerst,
 * hoogstens N rijen". In een deel van die tabellen mag een ingelogde gebruiker
 * zelf schrijven (`error_logs`, `bank_sync_log`), en de kolom `created_at` heeft
 * daar alleen een standaardwaarde: wie rechtstreeks schrijft, kiest het tijdstip
 * zelf. Een rij met een datum in de toekomst staat dan voor altijd bovenaan.
 * Duizend van zulke rijen vullen het hele venster en drukken de echte regels
 * eruit; twee ervan met de context van een AI-fout houden de AI-gezondheid
 * blijvend op "storing", want ze liggen altijd ná de laatste geslaagde aanroep.
 *
 * Een bovenkant op het moment van lezen laat die rijen buiten het venster. Het
 * is een slot aan de leeskant; het slot aan de schrijfkant (de policy op de
 * tabel) is een eigen schemawijziging.
 *
 * Puur: geen IO.
 */

/**
 * Marge voor het klokverschil tussen de app-server en de database. Zonder marge
 * zou een regel die de database net heeft geschreven, een tel buiten het venster
 * kunnen vallen. Een rij die binnen deze marge in de toekomst ligt, is
 * onschadelijk: hij valt er vanzelf binnen zodra de klok verder is.
 */
export const KLOK_MARGE_MS = 5 * 60 * 1000

/** ISO-tijdstempel tot waar een leesvenster reikt: nu, plus de klokmarge. */
export function leesvensterTotEnMet(nu: Date = new Date()): string {
  return new Date(nu.getTime() + KLOK_MARGE_MS).toISOString()
}
