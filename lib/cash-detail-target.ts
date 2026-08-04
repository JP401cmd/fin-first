import { bankLinkRowForAsset, type CashBankLink } from '@/lib/bank-connection-status'

/**
 * WELK PANEEL opent een cash-kaart op `/overzicht/cashflow`: de
 * rekeningdetail-overlay, of het bewerk-paneel van de bezitting?
 *
 * Die keuze hing tot fase 7 aan één bron: een `asset.id → bank_accounts.id`-map die
 * `cash-overview.tsx` opbouwt uit rekeningen wiens cash-bezit
 * `has_budget_tracking === true` heeft. Een via SC-13 GEREACTIVEERDE rekening
 * (bezit weer actief, budgetteren nog uit) viel daar buiten en opende dus het
 * bezitting-bewerk-paneel — terwijl de rekeningdetail juist het paneel is met de
 * bankverbinding, de statusuitleg en het herstelpad. Precies de gebruiker die het
 * hardst naar dat herstelpad zoekt kwam er niet.
 *
 * Daarom is een ÉCHTE KOPPELING de eerste bron: draagt dit bezit een bankverbinding
 * (`linked` of `linked-broken`, uit `loadCashBankLinks()` — dezelfde bundel die het
 * herkomst-symbool en de herstelband voedt), dan is er een rekeningdetail om te
 * openen en staat budgetteren daar los van. De budget-map is de val-terug.
 *
 * ## Waarom een `manual`-rij NIET meetelt
 *
 * `loadCashBankLinks` leest `bank_accounts` zonder `is_active`-filter, en
 * "budgetteren uit" laat de companion-rij juist staan met `is_active = false`
 * (`syncBankAccountCompanion`). Zo'n rij komt dus terug als `manual` — er is geen
 * actieve koppelrij. Liet élke koppelrij het detail winnen, dan opende een rekening
 * zonder bankverbinding én zonder budgetteren een rekeningdetail dat niets te tonen
 * heeft: geen verbinding, geen herstelpad, geen transactie-as. Erger nog, dat scherm
 * zoekt de rekening in zijn actief-gefilterde lijst en eindigt op "Rekening niet
 * gevonden" — de rekening werd er onbewerkbaar van.
 *
 * `manual` valt daarom terug op de budget-map: staat budgetteren áán, dan is er een
 * transactie-as en dus wél een detail; staat het uit, dan hoort het bewerk-paneel
 * van de bezitting. Handmatig-bijhouden en budgetteren zijn verschillende assen.
 *
 * `undefined` = geen rekeningdetail; de caller opent dan het bewerk-paneel. Dat is
 * ook de juiste uitkomst voor een puur handmatig cash-bezit: dat heeft geen
 * `bank_accounts`-rij en dus niets om te tonen.
 */
export function detailBankAccountIdForAsset(
  bankLinks: CashBankLink[],
  bankByAsset: Record<string, string>,
  assetId: string,
): string | undefined {
  const row = bankLinkRowForAsset(bankLinks, assetId)
  if (row && (row.state === 'linked' || row.state === 'linked-broken')) return row.bankAccountId
  return bankByAsset[assetId]
}
