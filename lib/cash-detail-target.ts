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
 * Daarom is de KOPPELRIJ de eerste bron: bestaat er een `bank_accounts`-rij voor dit
 * bezit (uit `loadCashBankLinks()`, dezelfde bundel die het herkomst-symbool en de
 * herstelband voedt), dan is er een rekeningdetail om te openen — budgetteren staat
 * daar los van. De budget-map blijft de val-terug voor het geval de bundel leeg is
 * (host geeft niets mee, of de leesronde faalde).
 *
 * `undefined` = geen rekeningdetail; de caller opent dan het bewerk-paneel. Dat is
 * de juiste uitkomst voor een puur handmatig cash-bezit: dat heeft geen
 * `bank_accounts`-rij en dus niets om te tonen.
 */
export function detailBankAccountIdForAsset(
  bankLinks: CashBankLink[],
  bankByAsset: Record<string, string>,
  assetId: string,
): string | undefined {
  return bankLinkRowForAsset(bankLinks, assetId)?.bankAccountId ?? bankByAsset[assetId]
}
