// Minimale Node ESM-resolve-hook die de Next.js '@/*' path-alias oplost naar
// de repo-root, zodat build-goud-set.ts de ECHTE productiemodules
// (lib/auto-categorize.ts, lib/parsers/categorize.ts, ...) rechtstreeks kan
// importeren zonder Next.js/webpack. Alleen voor deze wegwerp-spike; de
// productie-app gebruikt gewoon tsconfig 'paths' via de Next-bundler.
import { pathToFileURL } from 'node:url'
import { resolve as resolvePath, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const REPO_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '../../..')

const EXTS = ['.ts', '.tsx', '.mts', '/index.ts']

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const base = resolvePath(REPO_ROOT, specifier.slice(2))
    let target = base
    if (!/\.[a-zA-Z0-9]+$/.test(base)) {
      target = EXTS.map((ext) => base + ext).find((candidate) => existsSync(candidate)) ?? base + '.ts'
    }
    return nextResolve(pathToFileURL(target).href, context)
  }
  return nextResolve(specifier, context)
}
