// Wallet address format validation. Pattern-only — does not check whether
// the address actually exists on-chain. The on-chain check happens during
// sync via Blockchair.

import type { WalletChain } from '@/lib/connections-data'

const BTC_REGEX = /^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,62}$/
const EVM_REGEX = /^0x[a-fA-F0-9]{40}$/
// Solana addresses are base58-encoded ed25519 public keys, 32-44 chars.
const SOLANA_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

const EVM_CHAINS: ReadonlySet<WalletChain> = new Set(['ethereum', 'polygon', 'arbitrum', 'base'])

export function isValidWalletAddress(chain: WalletChain, address: string): boolean {
  const trimmed = address.trim()
  if (!trimmed) return false
  if (chain === 'bitcoin') return BTC_REGEX.test(trimmed)
  if (chain === 'solana') return SOLANA_REGEX.test(trimmed)
  if (EVM_CHAINS.has(chain)) return EVM_REGEX.test(trimmed)
  return false
}

export function normalizeWalletAddress(chain: WalletChain, address: string): string {
  const trimmed = address.trim()
  // EVM addresses are case-insensitive (EIP-55 checksums aside); store lowercase
  // so the duplicate-detect unique constraint catches user-entered case variants.
  // Solana addresses are case-sensitive base58 — preserve as-is.
  if (EVM_CHAINS.has(chain)) return trimmed.toLowerCase()
  return trimmed
}
