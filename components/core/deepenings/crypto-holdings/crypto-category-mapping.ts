// crypto-category-mapping.ts — vaste classificatie van bekende symbols naar
// een ruwe portefeuille-categorie. Bedoeld als input voor de allocation-chart
// op de crypto Holdings-app: één blik geeft de gebruiker antwoord op "ben ik
// te zwaar in BTC?", "wat is mijn DeFi-blootstelling?".
//
// Bewuste keuzes:
//   - Eén plek voor de mapping. Geen runtime-call naar CoinGecko-categories
//     (extra dependency, rate-limits, asynchrone laadtijd) — een handmatig
//     onderhouden Record dekt de top-50 dat we al via `coingecko-client`
//     ondersteunen. Onbekende symbols vallen in de catch-all `Overig`.
//   - "Stablecoins" en "Bitcoin" / "Ethereum" zijn losse buckets, niet
//     samengevoegd met "Layer-1" — een gebruiker wil zien hoeveel BTC los van
//     "andere L1's" in de portfolio zit.
//   - "Layer-2" omvat scaling-tokens bovenop Ethereum (MATIC/Polygon, Arbitrum-
//     adjacent). "DeFi" is governance/utility van decentralised-finance
//     protocollen. "Memecoins" is z'n eigen rijtje — risico-bewustzijn.

export type CryptoCategory =
  | 'Bitcoin'
  | 'Ethereum'
  | 'Stablecoins'
  | 'Layer-1'
  | 'Layer-2'
  | 'DeFi'
  | 'Smart-contract'
  | 'Memecoins'
  | 'Cash'
  | 'Overig'

/**
 * Symbol → categorie. Gebruik `getCryptoCategory(symbol, isFiatBalance)` voor
 * lookup met fiat-fallback en case-normalisatie.
 *
 * Onderhoud: nieuwe symbols toevoegen volgt de bestaande lijst in
 * `lib/integrations/coingecko-client.ts` — daar definieert de coin-resolver
 * welke we überhaupt prijzen kunnen geven. Een symbol zonder mapping blijft
 * functioneel (valt in `Overig`), het verliest alleen z'n bucket-kleur.
 */
const CATEGORY_BY_SYMBOL: Record<string, CryptoCategory> = {
  // Bitcoin
  BTC: 'Bitcoin',
  WBTC: 'Bitcoin',

  // Ethereum
  ETH: 'Ethereum',
  STETH: 'Ethereum',
  WETH: 'Ethereum',

  // Stablecoins
  USDT: 'Stablecoins',
  USDC: 'Stablecoins',
  DAI: 'Stablecoins',
  BUSD: 'Stablecoins',
  TUSD: 'Stablecoins',
  USDP: 'Stablecoins',
  GUSD: 'Stablecoins',
  EURT: 'Stablecoins',
  EURS: 'Stablecoins',

  // Layer-1 (alternatieve smart-contract chains)
  SOL: 'Layer-1',
  ADA: 'Layer-1',
  AVAX: 'Layer-1',
  DOT: 'Layer-1',
  ATOM: 'Layer-1',
  NEAR: 'Layer-1',
  ALGO: 'Layer-1',
  XTZ: 'Layer-1',
  EGLD: 'Layer-1',
  ONE: 'Layer-1',
  ROSE: 'Layer-1',
  TIA: 'Layer-1',
  LUNA2: 'Layer-1',
  KSM: 'Layer-1',
  ICX: 'Layer-1',
  VET: 'Layer-1',
  IOTA: 'Layer-1',
  ZIL: 'Layer-1',

  // Layer-2 / scaling
  MATIC: 'Layer-2',
  ARB: 'Layer-2',
  OP: 'Layer-2',
  LRC: 'Layer-2',

  // Smart-contract platforms (oudere generatie + payment-rails)
  XRP: 'Smart-contract',
  BNB: 'Smart-contract',
  LTC: 'Smart-contract',
  TRX: 'Smart-contract',
  CRO: 'Smart-contract',
  FTM: 'Smart-contract',

  // DeFi protocollen
  UNI: 'DeFi',
  AAVE: 'DeFi',
  MKR: 'DeFi',
  COMP: 'DeFi',
  SNX: 'DeFi',
  YFI: 'DeFi',
  CRV: 'DeFi',
  LDO: 'DeFi',
  RUNE: 'DeFi',
  GRT: 'DeFi',
  LINK: 'DeFi',
  INJ: 'DeFi',
  FET: 'DeFi',
  SAND: 'DeFi',
  MANA: 'DeFi',
  AXS: 'DeFi',
  APE: 'DeFi',
  ENJ: 'DeFi',
  CHZ: 'DeFi',
  BAT: 'DeFi',
  FIL: 'DeFi',

  // Memecoins
  DOGE: 'Memecoins',
  SHIB: 'Memecoins',
  PEPE: 'Memecoins',
  FLOKI: 'Memecoins',
  WIF: 'Memecoins',
  BONK: 'Memecoins',

  // Privacy / overig opvallend
  ZEC: 'Smart-contract',
  DASH: 'Smart-contract',
  XMR: 'Smart-contract',
  HOT: 'Overig',
  BTT: 'Overig',
}

/**
 * Categorie-volgorde voor de UI (legend + stack-order in de chart). Vaste
 * volgorde > alfabetisch zodat de gebruiker z'n verhouding tussen "veilig"
 * (Bitcoin/Ethereum/Stablecoins) en "speculatief" (Memecoins/Overig) altijd
 * van links naar rechts kan lezen. Cash krijgt dezelfde plek als
 * Stablecoins (beide laag-risico) maar blijft als aparte bucket — fiat is
 * geen crypto.
 */
export const CRYPTO_CATEGORY_ORDER: readonly CryptoCategory[] = [
  'Bitcoin',
  'Ethereum',
  'Layer-1',
  'Layer-2',
  'Smart-contract',
  'DeFi',
  'Stablecoins',
  'Cash',
  'Memecoins',
  'Overig',
] as const

/**
 * Krant-palette per categorie. Bewust beperkt tot kern-tinten + één
 * accent-kleur per type — geen regenboog. Bitcoin/Ethereum krijgen hun
 * canonieke oranje/paars-blauwe associatie; Stablecoins een rustig grijs;
 * Memecoins een waarschuwend warm tint.
 *
 * Gebruikt directe oklch-strings (geen Tailwind-classes) zodat de UI ze in
 * inline SVG-fills kan toepassen waar dynamische class-namen niet werken.
 */
export const CRYPTO_CATEGORY_COLORS: Record<CryptoCategory, string> = {
  Bitcoin: 'oklch(0.68 0.16 55)', // bitcoin-oranje, gedempt
  Ethereum: 'oklch(0.55 0.13 270)', // ethereum-violet
  'Layer-1': 'oklch(0.55 0.10 220)', // koel blauw
  'Layer-2': 'oklch(0.62 0.10 195)', // teal
  'Smart-contract': 'oklch(0.50 0.06 250)', // staal-blauw
  DeFi: 'oklch(0.55 0.11 145)', // groen
  Stablecoins: 'oklch(0.65 0.03 95)', // warm grijs
  Cash: 'oklch(0.72 0.04 95)', // licht warm grijs
  Memecoins: 'oklch(0.62 0.13 35)', // warm rood-oranje (waarschuwing zonder paniek)
  Overig: 'oklch(0.55 0.02 95)', // neutraal grijs
}

export interface CryptoCategoryLookupInput {
  symbol: string
  isFiatBalance?: boolean
}

/**
 * Resolve een coin naar zijn portfolio-bucket. Fiat-saldi (EUR/USD bij
 * exchange) krijgen altijd `Cash`, ongeacht het symbol — anders zou een
 * EUR-balans als "Overig" eindigen wat de allocation-bucket vervuilt.
 */
export function getCryptoCategory({
  symbol,
  isFiatBalance,
}: CryptoCategoryLookupInput): CryptoCategory {
  if (isFiatBalance) return 'Cash'
  const upper = symbol.trim().toUpperCase()
  return CATEGORY_BY_SYMBOL[upper] ?? 'Overig'
}
