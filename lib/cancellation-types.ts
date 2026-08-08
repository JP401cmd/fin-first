export type CancellationMetadata = {
  type: 'subscription_cancellation'
  subscription_name: string
  monthly_amount: number
  frequency?: string
  user_name: string
  user_address: string
  user_postcode: string
  user_city: string
}

/**
 * Omschrijving van de "opzegbrief klaargezet"-actie.
 *
 * Privacy-contract (kaart "Privacy-modus dekt álle bedragen", cluster A9):
 * hier wordt BEWUST géén bedrag in gebakken. Maskering is client-side en
 * per call-site opt-in; een bedrag dat eenmaal in een vrije-tekstveld staat,
 * kan de privacy-toggle achteraf nooit meer maskeren. Het maandbedrag hoort
 * apart opgeslagen — in `euro_impact_monthly` én `metadata.monthly_amount` —
 * en wordt live gerenderd via `<MaskedAmount>` op de actiekaart.
 *
 * Bewaakt door `lib/cancellation-types.test.ts`: de uitkomst mag geen cijfer
 * of euroteken bevatten.
 */
export function buildCancellationActionDescription(subscriptionName: string): string {
  return `Opzegbrief klaargezet voor ${subscriptionName}. Open deze actie om de opzegging af te ronden.`
}
