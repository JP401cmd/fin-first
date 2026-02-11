# CLAUDE.md

## Project Overview

TriFinity is a personal finance freedom navigator built with Next.js 16 (App Router), TypeScript, Supabase, and Tailwind CSS v4.

## Philosophy & Design Principles

**Kernidee:** Geld is opgeslagen tijd. De app vertaalt financiën naar tijd zodat gebruikers bewuste keuzes maken.

- **Tijd, geen euro's** — toon bedragen als dagen/uren vrijheid, niet als getallen. "Dit kost 19 dagen vrijheid" in plaats van "Dit kost €500".
- **Autonomie, geen schaarste** — nooit "je mag nog €50 uitgeven", maar "als je deze €50 belegt, win je 2 dagen vrijheid". Kansen tonen, niet beperkingen.
- **De sweetspot** — niet losbandig, niet krenterig. Bewust genieten van wat waarde geeft, meedogenloos snoeien wat dat niet doet.
- **Optimalisatie, geen deprivatie** — bewuster genieten, niet minder genieten.
- **Het ∞-symbool** — het ultieme doel: passief inkomen dekt permanent de uitgaven. Vrijheid als percentage dat groeit.

### Drie modules (app-architectuur concept)

| Module | Naam | Kleur | Avatar | Rol |
|--------|------|-------|--------|-----|
| **The Core / De Kern** | Assets & waarheid | Goud/Amber (`amber`) | FHIN | Centrum van opgeslagen levensenergie — dynamisch, niet statisch |
| **The Will / De Wil** | Actie & keuzes | Teal/Cyan (`teal`) | FINN | De spier: wilskracht om bewust te sturen |
| **The Horizon / De Horizon** | Vrijheid & toekomst | Paars (`purple`) | FFIN | Het uitzicht dat dichterbij komt naarmate je bewuster leeft |

### Domein-kleuren (uit het TriFinity logo)

| Domein | Tailwind | Accent hex | Rationale |
|--------|----------|------------|-----------|
| De Kern | `amber` | `#D4A843` | Goud — vertrouwen, waarde, fundament |
| De Wil | `teal` | `#3CC8C8` | Teal/Cyan — actie, groei, wilskracht |
| De Horizon | `purple` | `#8B5CB8` | Paars — wijsheid, toekomst, vrijheid |

### Toon & taalgebruik in de UI

- Empowerend, nooit veroordelend
- Framing als "tijd verdienen", niet "geld besparen"
- Traditioneel: "Ik heb €450.000 vermogen" → Fin: "Ik heb 12 jaar en 4 maanden vrijgekocht"
- Inspiratie: de film "In Time" (2011) — tijd als zichtbare valuta, maar dan als bevrijding

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build
npm start        # Start production server
npm run lint     # ESLint
```

## Architecture

- **Framework**: Next.js 16 with App Router (`app/` directory)
- **Language**: TypeScript (strict mode, ES2017 target)
- **Styling**: Tailwind CSS v4 via PostCSS — zinc color palette, dark mode via `prefers-color-scheme`
- **Fonts**: Geist and Geist Mono (loaded via `next/font/google`)
- **Database/Auth**: Supabase (PostgreSQL + Auth)
- **Package manager**: npm

## Project Structure

```
app/                    # Routes and layouts (App Router)
  (app)/                # Route group for authenticated pages
    layout.tsx          # Shared layout with AppHeader
    dashboard/          # Three-domain hub
    core/               # De Kern module
    will/               # De Wil module
    horizon/            # De Horizon module
  auth/callback/        # OAuth/email verification callback route handler
  login/, signup/       # Auth pages (client components)
  logout/               # Server component sign-out
  forgot-password/      # Password reset request
  reset-password/       # Password update
components/landing/     # Landing page sections (header, hero, features, footer)
components/app/         # Authenticated app components
  app-header.tsx        # Navigation for logged-in users
  domain-card.tsx       # Reusable domain card component
  avatars.tsx           # FHIN, FINN, FFIN animated SVG avatars
lib/supabase/           # Supabase client helpers
  client.ts             # Browser client (createBrowserClient)
  server.ts             # Server client with cookie handling
  proxy.ts              # Middleware session refresh
proxy.ts                # Root Next.js middleware — protects routes, refreshes sessions
```

## Auth Pattern

Supabase email/password auth with `@supabase/ssr` for cookie-based sessions.

- **Browser**: `lib/supabase/client.ts` — use `createClient()` for client components
- **Server**: `lib/supabase/server.ts` — use `createClient()` for server components/route handlers
- **Middleware** (`proxy.ts`): refreshes sessions on every request; redirects unauthenticated users to `/login`
- **Public paths**: `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/*`

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=<supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
```

## Conventions

- Server components by default; add `'use client'` only when needed
- Named exports for components (`export function ComponentName()`)
- File naming: kebab-case for routes/files, PascalCase for components
- Path alias: `@/*` maps to project root
- Tailwind utility classes inline — no CSS modules or styled-components
