// Registreert alias-loader.mjs (de '@/*' → repo-root resolve-hook) vóórdat
// het eigenlijke script draait. Gebruikt via `node --import`.
import { register } from 'node:module'

register('./alias-loader.mjs', import.meta.url)
