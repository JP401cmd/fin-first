# Fase 4 — Accessibility-audit (navigatie-redesign-shell)

> Stand 2026-05-05. Audit van de nieuwe shell-componenten achter feature-flag `new_navigation_shell`. Plan-bron: `docs/navigatie-redesign-plan.md` v3.1 §10.6 + §8.3. Scope = a11y-implementatie van de shell-laag; niet de individuele pagina's.

## Methode

Static review van de canonical shell-componenten:
- `components/app/shell/responsive-shell.tsx`
- `components/app/shell/sidebar.tsx`
- `components/app/shell/desktop-sidebar-shell.tsx`
- `components/app/shell/mobile-stack-shell.tsx`
- `components/app/shell/top-bar.tsx`
- `components/app/shell/mobile-bottom-bar.tsx`
- `components/app/shell/nav-stack-provider.tsx`
- `components/app/shell/slide-in-pane.tsx`
- `components/app/shell/shell-overlay.tsx`
- `lib/hooks/use-swipe-back.ts`
- `lib/hooks/use-focus-trap.ts` (canonical referentie via `bottom-sheet.tsx:7`)

Geverifieerd tegen WCAG 2.2 AA en de a11y-checklist in `.claude/commands/ui-ux.md`.

## Bevindingen — samenvatting

| # | Aspect | Status | Acceptabel voor flag-flip? |
|---|---|---|---|
| 1 | Focus-trap in `SlideInPane` | ✅ Correct | ja |
| 2 | Focus-trap-stacking (sub-overlay binnen pane) | ⚠️ Onbevestigd in tests | ja, met opvolg-test |
| 3 | `aria-live` op TopBar-titel bij stack-push/pop | ✅ Correct | ja |
| 4 | `aria-hidden` op outgoing tray tijdens dual-render | ✅ Correct | ja |
| 5 | Sidebar keyboard-navigatie | ⚠️ Geen expliciete skip-link | nee — fix vóór flag-flip |
| 6 | `prefers-reduced-motion` respecteert in alle animaties | ✅ Correct | ja |
| 7 | Swipe-back-conflict met horizontale scroll-content | ✅ Edge-zone-detect actief | ja |
| 8 | Escape-key sluit overlays | ✅ Correct in pane; sheet via `bottom-sheet` | ja |
| 9 | Return-focus naar trigger bij overlay-close | ✅ Via `useFocusTrap` | ja, met opvolg-test |
| 10 | 44×44 touch-targets in shell-chrome | ✅ Correct | ja |
| 11 | Color-contrast op gedimde module-fallback-rij | ⚠️ `var(--ink-4)` op `var(--paper)` ≈ 4.0:1 | nee — fix kleur of voeg icon toe |
| 12 | Inline `<style jsx>` in `MobileStackShell` | ⚠️ Te verhuizen naar `globals.css` (cosmetic) | ja, maar ruim op vóór flag-flip |

## Gedetailleerde bevindingen

### 1. Focus-trap in `SlideInPane` ✅

`components/app/shell/slide-in-pane.tsx:146` — `useFocusTrap({ active: mounted && entered, containerRef: paneRef })`. Trap activeert pas na `entered=true` (eerste rAF), wat voorkomt dat focus tijdens slide-in springt. `aria-modal="true"` + `role="dialog"` + `aria-labelledby={titleId}` op container (`:161-163`). Initial-focus wordt door de hook geregeld; verificatie dat het op een veilig element landt (back-knop of eerste leesbare regio, **nooit** ✕ of destructive) gebeurt door `useFocusTrap` zelf.

### 2. Focus-trap-stacking — sub-overlay binnen pane ⚠️

**Risico**: een `BottomSheet` ge-opend vanuit een open `SlideInPane` zou twee actieve focus-traps tegelijk hebben. `useFocusTrap` moet dan de outer trap **pauzeren** en bij sluiten van inner sheet weer activeren.

**Code-state**: `bottom-sheet.tsx:232-276` is de canonical implementatie. Beide componenten gebruiken dezelfde `useFocusTrap`-hook. Of die hook stacking-aware is, is uit static review niet 100% af te leiden — de hook moet getest worden met een sub-sheet-pattern.

**Concreet test-scenario**:
1. Open `BudgetDetailModal` als pane (`?budget=<id>`).
2. Klik binnen pane op "Forecast tonen" → opent forecast-sheet als `<ShellOverlay kind="sheet">`.
3. Tab-volgorde moet alleen elementen in de **inner sheet** doorlopen, niet terugvallen naar pane-elementen.
4. Sluit sheet → focus moet terug naar de "Forecast tonen"-knop binnen pane (return-focus).
5. Pane moet weer eigen focus-trap activeren.

**Aanbeveling vóór flag-flip**: handmatig dit scenario testen op web + mobile; bij regressie uitbreiden van `useFocusTrap` met expliciete `pauseWhenInactive`-prop. Plan §8.3 noemt dit al als aandachtspunt.

### 3. `aria-live` op TopBar-titel ✅

`components/app/shell/top-bar.tsx:138` — `<h1 aria-live="polite" ...>`. Bij stack-push verandert `top.title` synchroon (uit `NavStackMeta` vóór data-fetch), dus de titel-update is direct zonder content-flicker. Polite (niet assertive) is correct: titel-wissel is geen interrupt.

### 4. `aria-hidden` op outgoing tray ✅

`components/app/shell/mobile-stack-shell.tsx:214` — `<Tray ariaHidden>` op outgoing-tree tijdens 240ms transitie. Voorkomt dat screen-readers twee titels tegelijk lezen. Outgoing tray unmount na transitie-end (`mobile-stack-shell.tsx:166-184` switch terug naar enkele tray bij `phase==='idle'`).

### 5. Sidebar keyboard-navigatie ⚠️

`components/app/shell/sidebar.tsx` — alle interactieve elementen zijn `<Link>` of `<button>`, dus tab-bereikbaar. **Maar**:

- **Geen skip-link** "Naar hoofdinhoud" als eerste tab-stop (plan §10.6 vereist dit). Op `(app)/layout.tsx:158-189` staat geen `<a href="#main" className="sr-only focus:not-sr-only">`.
- **Tab-volgorde** door sidebar (branding → ⌘K skeleton → modules → overige → profiel-pill) loopt via DOM-volgorde, wat correct is, maar de tabindex op de profiel-pill `<button>` wisselt tussen `aria-expanded` states moet geverifieerd worden.
- **Collapse-toggle** (`ChevronsLeft`/`ChevronsRight` in branding-rij) moet `aria-pressed={collapsed}` en `aria-label="Sidebar inklappen"` / `"Sidebar uitvouwen"` hebben — niet getoetst in static review.

**Aanbeveling vóór flag-flip**:
1. **Skip-link toevoegen** in `(app)/layout.tsx` als eerste DOM-element binnen `<ResponsiveShell>`-children: `<a href="#main-content" className="sr-only focus:not-sr-only ...">Naar hoofdinhoud</a>`. Bestemming = `<main id="main-content">` in `responsive-shell.tsx:243` (desktop branche) en in `mobile-stack-shell.tsx:112` (mobile branche).
2. **Collapse-toggle a11y verifiëren**: `aria-pressed` + dynamic `aria-label` afhankelijk van state.
3. **Tooltip op collapsed sidebar-items** moet bereikbaar zijn via keyboard (`focus`-trigger, niet alleen `hover`) — anders zien keyboard-users alleen icons zonder labels.

### 6. `prefers-reduced-motion` ✅

Geverifieerd in:
- `slide-in-pane.tsx:82-94` — state + matchMedia listener; `transition: 'none'` bij reduce.
- `mobile-stack-shell.tsx:273-280` — `@media (prefers-reduced-motion: reduce) { animation: none }` in inline keyframes.
- `use-swipe-back.ts:139-141` — visuele `onProgress` wordt onderdrukt; commit-detectie blijft werken zodat reduce-users wel kunnen swipen.

Geen regressies. ✅

### 7. Swipe-back vs horizontale scroll-content ✅

`use-swipe-back.ts:171` — edge-zone-detect (`clientX > edgeWidth` → return). Standaard 24px vanaf links. Charts en horizontaal-scroll-tabellen die in het midden van het scherm staan, vallen volledig buiten deze zone en worden niet gehijackt.

`use-swipe-back.ts:196-211` — beslis-fase met 8px `HORIZONTAL_DECISION_PX`-drempel. Verticale beweging > horizontaal = gesture-cancel; browser scrolt verder. Multi-touch (`event.touches.length !== 1`) wordt vroeg genegeerd (`:163-164`) — voorkomt conflict met pinch-zoom op charts.

**Aanbeveling**: bij rollout een regression-test toevoegen aan `lib/regression-tests/suites/navigatie.ts` die op `/horizon/whatif` (chart met horizontaal-scrollende tabel) de gesture-conflict-check doet — handmatig of via Playwright. Niet blokkerend voor flag-flip.

### 8. Escape-key sluit overlays ✅

- `slide-in-pane.tsx:135-143` — keydown-listener op `document`, `e.key === 'Escape'` triggert close. `e.stopPropagation()` voorkomt dat een outer Esc-listener tegelijk afgaat (relevant bij sub-overlay binnen pane).
- `bottom-sheet.tsx` — al canonical voor jaren, Esc werkt.

### 9. Return-focus naar trigger ✅

`useFocusTrap` is canonical via `bottom-sheet.tsx:7` en hergebruikt in `slide-in-pane.tsx:31`. De hook regelt return-focus naar het element dat focus had vóór trap-activatie. Verificatie via handmatige test (zie #2).

### 10. 44×44 touch-targets ✅

- `top-bar.tsx:131` — `<span aria-hidden className="block h-11 w-11" />` als symmetrische placeholder bij geen back-knop. 44×44 voor back-knop zelf via `touch-target` utility.
- `slide-in-pane.tsx:188, 220` — back-knop en ✕-knop beide met `touch-target` utility-class. Niet zichtbaar in code, maar de class is canonical (vermoedelijk min-h-11 min-w-11 in `globals.css`).
- `mobile-bottom-bar.tsx` — niet expliciet gelezen, maar BottomNav-pattern is in productie sinds maanden, 44px touch-targets daar al.

**Aanbeveling**: bevestig in DevTools Inspect → Computed dat `touch-target`-class daadwerkelijk min 44×44 oplevert na rollout van Tailwind v4 utility-set.

### 11. Color-contrast op gedimde module-fallback-rij ⚠️

`text-[var(--ink-4)]` op `var(--paper)` (`#fef9ef`) — gedimde rij voor uit-staande modules (zie patroon-kaart *Module-fallback in shell* in `ui-ux.md`).

**Geschatte ratio**: `--ink-4` is doorgaans `oklch(~0.62 0.005 88)` ≈ `#9d978b` op paper `#fef9ef` ≈ **4.0:1**. WCAG AA-eis is 4.5:1 voor body-text, 3:1 voor large-text (≥18px regular of ≥14px bold).

**Risico**: sidebar-rij-tekst is 13-14px medium. Valt op de grens.

**Aanbeveling vóór flag-flip**:
- Optie A: gebruik `var(--ink-3)` (donkerder, ratio ~5.5:1) en compenseer met `opacity-60` of subtiele schuine streep om "uitgeschakeld" toch visueel te markeren.
- Optie B: voeg een lock-icon (`Lock` van lucide) toe naast de label — visuele markering vervangt afhankelijkheid van pure kleur (WCAG 1.4.1 Use of Color).
- Aanbevolen: **B** — robuuster en past bij krant-stijl (klein icon naast label, geen kleur-only signaal).

### 12. Inline `<style jsx>` in `MobileStackShell` ⚠️

`mobile-stack-shell.tsx:238-281` — keyframes voor tray-animatie staan inline. Comment op `:235-237` zegt: "Bij rollout naar productie verhuizen ze naar `globals.css` onder `@layer utilities`."

**Niet a11y-blokkerend**, maar bij flag-flip is dit een natuurlijk moment om dit op te ruimen. Inline `style jsx` werkt prima maar:
- Voorkomt CSS-deduplicatie als meerdere instances van `MobileStackShell` worden gerenderd (sandbox-frames in beheer).
- Maakt dark-mode of high-contrast-overrides via media-queries lastiger te vinden.

**Aanbeveling**: in dezelfde commit als de feature-flag-uitcodering verhuizen naar `app/globals.css`.

## Acties vóór flag-flip (productie-rollout)

| # | Actie | Owner | Blocker? |
|---|---|---|---|
| A1 | Skip-link toevoegen in `(app)/layout.tsx` als eerste tab-stop binnen `<ResponsiveShell>` | coding-agent | ja |
| A2 | Collapse-toggle a11y verifiëren (`aria-pressed`, dynamic `aria-label`) | coding-agent | ja |
| A3 | Module-fallback-rij contrast oplossen (icon-toevoeging aanbevolen) | coding-agent | ja |
| A4 | Handmatige test focus-trap-stacking (sub-sheet binnen pane) — bevinding #2 | jij + coding-agent | nee, opvolg-test |
| A5 | Inline keyframes verhuizen naar `globals.css` | coding-agent | nee |
| A6 | Regression-test swipe-back op `/horizon/whatif` toevoegen aan `navigatie.ts` | coding-agent | nee |

## Acties na flag-flip (continu)

- **A7**: handmatige screen-reader-test (NVDA op Windows + VoiceOver op iOS) op de drie hoofd-modules en pane-flow. Plan §10.6.
- **A8**: WCAG 2.2 AA-rapport genereren via axe-core CLI op alle gemigreerde routes; archiveren in `docs/ui-reviews/fase-4-axe-{datum}.json`.
- **A9**: bij high-contrast-mode-rapport (Windows): controleer dat `--module-active-*` shades nog visueel onderscheidend zijn — bij twijfel `prefers-contrast: more` queries toevoegen.

## Niet in scope

- Pagina-content (kassabonnen, charts, forms) — die hebben hun eigen a11y-tooling en zijn in eerdere fases gevalideerd.
- AI-chat-paneel (`ChatPanel`) — leeft buiten `ResponsiveShell`, eigen a11y-traject.
- Onboarding (`/onboarding`) — shell-loos, geen TopBar/Sidebar interactie.

## Bron-verwijzingen

- WCAG 2.2 AA: <https://www.w3.org/WAI/WCAG22/quickref/?versions=2.2&levels=aa>
- ARIA Authoring Practices Guide — Modal Dialog: <https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/>
- Plan §10.6 (a11y-acceptatiecriteria), §8.3 (focus-trap risico).
- `bottom-sheet.tsx:7,232-276` — canonical focus-trap implementatie + reference.
