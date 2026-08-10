// lib/holdings-import-key.ts
// ---------------------------------------------------------------------------
// De dedup-sleutel van een geïmporteerde broker-transactie.
//
// WAAROM
// Een transactie-export beslaat een periode die je bij je broker zelf kiest. De
// gebruiker moet die periode ruim mógen nemen — liever overlappen dan een gat,
// want een gat merk je niet en een dubbele rij wél. Dat kan alleen als wij per
// rij hard kunnen zeggen: "deze heb ik al". Die uitspraak is deze sleutel.
//
// Hij belandt in `investment_transactions.external_trade_id` en wordt afgedwongen
// door de unieke index (user_id, external_source, external_trade_id). Een rij die
// al bestaat wordt door de import stil overgeslagen — en geteld, zodat de wizard
// kan tonen hoeveel er is ontdubbeld.
//
// TWEE FOUTEN, NIET GELIJKWAARDIG
// Spiegelt de afweging van `lib/parsers/cross-source-dedup.ts`, maar leunt de
// ándere kant op — en dat is bewust. Daar is een fout-positief stil verlies van
// een échte boeking. Hier ligt het omgekeerd: de sleutel is exact (geen marges,
// geen fuzzy match), dus een fout-positief kan alleen ontstaan bij twee rijen die
// op élk veld identiek zijn — en juist die vangt de volgnummer-suffix hieronder.
// ---------------------------------------------------------------------------

/** De velden waaruit een sleutel wordt afgeleid; elke parser levert deze vorm. */
export interface TradeKeyInput {
  /**
   * Het id dat de broker zelf aan de transactie hangt: DEGIRO's Order ID,
   * Trading 212's `ID`, eToro's `Position ID`. Null wanneer de export er geen
   * levert — dan valt de sleutel terug op de inhoud van de rij.
   */
  externalId?: string | null
  isin?: string | null
  ticker?: string | null
  /** ISO-datum (YYYY-MM-DD). */
  date?: string | null
  /** 'buy' | 'sell' | 'dividend' */
  type: string
  units: number
  price_per_unit: number
  total_amount: number
}

/**
 * Vaste decimalen, zodat dezelfde brongegevens altijd dezelfde tekst opleveren.
 * Zonder afronding zou `0.1 + 0.2`-achtige drijvendekomma-ruis twee identieke
 * rijen uit twee exports een verschillende sleutel geven — en dan ontdubbelt er
 * niets meer.
 */
function num(value: number, decimals: number): string {
  return Number.isFinite(value) ? value.toFixed(decimals) : '0'
}

/**
 * De sleutel vóór het volgnummer.
 *
 * Met een broker-id: `id|<type>|<datum>`. Het id alléén is niet genoeg — eToro
 * geeft de open- én de sluitregel van dezelfde positie hetzelfde Position ID, dus
 * zonder `type` zou een latere export waarin alleen de sluitregel valt, botsen
 * met de eerder geïmporteerde openregel en stil verdwijnen. Datum erbij maakt de
 * sleutel bovendien onafhankelijk van welke periode je exporteert.
 *
 * Zonder broker-id: de inhoud van de rij. Een herhaalde export van dezelfde
 * historie levert exact dezelfde velden, dus dezelfde sleutel.
 */
function baseKey(row: TradeKeyInput): string {
  const id = row.externalId?.trim()
  const date = row.date ?? ''
  const type = row.type.toLowerCase()
  if (id) {
    return `id:${id}|${type}|${date}`
  }
  const instrument = (row.isin || row.ticker || '').toUpperCase()
  return [
    'row',
    date,
    instrument,
    type,
    num(row.units, 6),
    num(row.price_per_unit, 4),
    num(row.total_amount, 2),
  ].join('|')
}

/**
 * Leid per rij een dedup-sleutel af, in bestandsvolgorde.
 *
 * Rijen die op alles gelijk zijn — een order die de broker in deelexecuties
 * uitvoerde, of simpelweg twee identieke aankopen op één dag — krijgen een
 * volgnummer: de eerste houdt de kale sleutel, de tweede krijgt `#2`, enzovoort.
 * Zonder dat volgnummer zou de tweede deelexecutie als duplicaat van de eerste
 * sneuvelen en zou de positie structureel te laag uitkomen.
 *
 * Dat volgnummer is stabiel bij overlap omdat brokers per hele dag exporteren:
 * een dag zit volledig in het bereik of er volledig buiten, dus de n-de identieke
 * transactie van die dag is in élke export de n-de. Zou een broker ooit midden op
 * een dag afkappen, dan schuift het nummer en ontstaat een dubbele rij — de
 * zichtbare fout, niet de stille.
 */
export function buildTradeKeys(rows: readonly TradeKeyInput[]): string[] {
  const seen = new Map<string, number>()
  return rows.map((row) => {
    const base = baseKey(row)
    const occurrence = (seen.get(base) ?? 0) + 1
    seen.set(base, occurrence)
    return occurrence === 1 ? base : `${base}#${occurrence}`
  })
}
