/**
 * Horizon-kernel adapter — **markt-risicofactor per bezitting** (ADR 0117, snede 1).
 *
 * **App-zijde**: mag app-types importeren, en is bewust NIET via de kernel-barrel
 * geëxporteerd. De kern kent alleen het dimensieloze getal (`AssetPot.risicoFactor`);
 * de vertaling van TriFinity-begrippen (`asset_type` → categorie, `risk_profile`,
 * subtype-defaults) naar dat getal gebeurt HIER, precies zoals `potten.ts` dat voor
 * categorie/Box 3-type/rollen doet.
 *
 * ## De keten (één bron, expliciete precedentie)
 * 1. **Is deze categorie überhaupt marktgevoelig?** Nee → factor 0 en klaar. Dat
 *    geldt voor Spaargeld (nominaal gegarandeerd — renterisico is geen marktschok),
 *    Eigen huis (loopt via de woonstrategie, niet via de portefeuillebeta) en de
 *    restcategorie Overig (auto, inboedel, vordering — geen marktnotering).
 * 2. **Het expliciete `assets.risk_profile`** wint altijd — de gebruiker heeft het
 *    zelf gezet. Zelfde precedentie-regel als `resolveFireParamsWithAssumptions`:
 *    een expliciete keuze gaat vóór elke default.
 * 3. **De subtype-default** (`ASSET_SUBTYPE_DEFAULTS[subtype].risk_profile`) — die
 *    tabel is de bestaande, canonieke bron van "wat voor ding is dit": `obligaties`
 *    laag, `aandelen` hoog, `premieregeling` middel. Consume, geen tweede tabel.
 * 4. **De categorie-terugval** voor een bezitting zonder profiel én zonder subtype.
 *
 * ## Waarom de terugval overal `middel` is
 * `middel` heeft factor 1 (`RISICO_FACTOR_PER_PROFIEL`) en dat is exact het niveau
 * waarop de band en de Monte-Carlo vóór ADR 0117 al rekenden. Een bezitting zonder
 * risico-informatie houdt daarmee precies het oude gedrag — de blast radius blijft
 * beperkt tot wat de data aantoonbaar rechtvaardigt.
 *
 * ## Wat hier bewust NIET gebeurt
 * - **De `investering`-vlag blijft ongemoeid.** Die is het bens!F-contract dat
 *   `tables/bez.ts` en de `potMutaties`-scope (`alleenInvestering`, market_shock-
 *   events) lezen; hem verbreden zou stil de reikwijdte van een gebruikers-event
 *   veranderen. De risicofactor is een tweede, additieve as.
 * - **Categorie Overig blijft op 0**, óók voor `deelneming` (die subtype-defaults
 *   dragen `risk_profile: 'hoog'`). Een aanmerkelijk belang is echt aandelenrisico,
 *   maar het hoort bij de Box 2-snede (snede 4 van dezelfde kaart): daar krijgt het
 *   én zijn heffing én zijn risico. Hier zou het een pot met `expected_return: 0`
 *   ±2,8pp laten schommelen zonder dat de fiscale kant meebeweegt.
 * - **Het verwachte rendement.** Deze laag raakt alleen de ONZEKERHEID rond het
 *   rendement. De mix die het rendement zélf voedt is snede 2.
 *
 * Pure module: geen fs/Supabase/Date.now/Math.random.
 */

import { ASSET_SUBTYPE_DEFAULTS, type Asset, type RiskProfile } from '@/lib/asset-data'
import { RISICO_FACTOR_GEEN, RISICO_FACTOR_PER_PROFIEL } from '@/lib/constants'
import type { AssetCategorie } from '../types'

/**
 * Kern-categorieën met markt-blootstelling. Vervangt als RISICO-poort de
 * 2-categorie-whitelist `INVESTERING_CATEGORIEEN` (Beleggingen + Vastgoed): de
 * scherpste bevinding van de analyse was dat een **premieregeling-pensioenpot** —
 * in Nederland vaak de grootste aandelenblootstelling van een huishouden — in het
 * geheel niet meebewoog met band of Monte-Carlo, wat het plan systematisch te zeker
 * maakte. `Pensioen` hoort er dus bij.
 *
 * NB: dit is de RISICO-poort, niet de `investering`-vlag. Die laatste blijft
 * ongewijzigd het bens!F-contract (zie module-doc).
 */
export const MARKTGEVOELIGE_CATEGORIEEN: ReadonlySet<AssetCategorie> = new Set<AssetCategorie>([
  'Beleggingen',
  'Vastgoed',
  'Pensioen',
])

/**
 * Terugval-risicoprofiel per marktgevoelige categorie, voor een bezitting zonder
 * eigen `risk_profile` én zonder subtype-default. Alle drie `middel` = factor 1 =
 * het gedrag van vóór ADR 0117 (zie module-doc).
 */
const CATEGORIE_RISICO_TERUGVAL: Readonly<Record<string, RiskProfile>> = {
  Beleggingen: 'middel',
  Vastgoed: 'middel',
  Pensioen: 'middel',
}

/**
 * Het risicoprofiel van één bezitting: expliciete keuze → subtype-default → `null`.
 * Los geëxporteerd zodat weergave-oppervlakken hetzelfde antwoord kunnen tonen als
 * de projectie gebruikt (consume, geen tweede afleiding).
 */
export function resolveAssetRiskProfile(asset: Asset): RiskProfile | null {
  if (asset.risk_profile != null) return asset.risk_profile
  const subtype = asset.subtype
  if (subtype != null) {
    const fallback = ASSET_SUBTYPE_DEFAULTS[subtype]?.risk_profile
    if (fallback != null) return fallback
  }
  return null
}

/**
 * De markt-risicofactor van één bezitting binnen zijn kern-categorie. Zie de
 * module-doc voor de precedentieketen; niet-marktgevoelige categorieën geven 0.
 */
export function assetRisicoFactor(asset: Asset, categorie: AssetCategorie): number {
  if (!MARKTGEVOELIGE_CATEGORIEEN.has(categorie)) return RISICO_FACTOR_GEEN
  const profiel = resolveAssetRiskProfile(asset) ?? CATEGORIE_RISICO_TERUGVAL[categorie] ?? 'middel'
  return RISICO_FACTOR_PER_PROFIEL[profiel]
}
