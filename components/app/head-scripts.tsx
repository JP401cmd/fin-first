'use client'

import { useServerInsertedHTML } from 'next/navigation'

/**
 * Pre-hydration inline scripts, geïnjecteerd in <head> via `useServerInsertedHTML`.
 *
 * Waarom niet gewoon <script> in de layout? React 19 waarschuwt bij elk
 * <script>-element dat in de gereconcilieerde component-tree staat
 * ("Encountered a script tag while rendering React component… never executed
 * when rendering on the client"). `useServerInsertedHTML` schrijft de markup
 * tijdens SSR rechtstreeks in de HTML-stream — buiten Reacts client-reconciliatie
 * om — dus de output is byte-identiek (script staat in de statische HTML, draait
 * synchroon vóór paint), maar de waarschuwing verdwijnt. Op de client is dit een
 * no-op; de scripts hoeven alleen bij de eerste full-page load te draaien.
 */

/**
 * Pre-hydration script — leest opgeslagen palette-keuze uit localStorage en zet
 * de CSS-vars (`--bg`, `--paper`, `--subtle`, `--border-ed`, `--border-md`,
 * `--background`) op `<html>` voordat de React-app rendert. Voorkomt een korte
 * flash van het default-palet (cream) wanneer de gebruiker een ander palet had
 * gekozen. De waardes hier zijn een 1:1 spiegel van `PALETTE_THEMES` in
 * `module-color-provider.tsx`; bij een nieuwe palette-optie beide updaten.
 */
const PALETTE_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('tf-palette-theme');if(!t)return;var p={cream:{bg:'#f5efe2',paper:'#fbf7ec',subtle:'#f3ead9',ed:'#e3dac8',md:'#ccc1aa'},licht:{bg:'#fbf2e7',paper:'#fef9ef',subtle:'#f5ecd6',ed:'#e6dcc4',md:'#d4c8a8'},'fd-bruin':{bg:'#e9dcb8',paper:'#f0e6cf',subtle:'#e0d2a8',ed:'#c9b88e',md:'#a89968'}}[t];if(!p)return;var r=document.documentElement.style;r.setProperty('--bg',p.bg);r.setProperty('--paper',p.paper);r.setProperty('--subtle',p.subtle);r.setProperty('--border-ed',p.ed);r.setProperty('--border-md',p.md);r.setProperty('--background',p.bg);}catch(e){}})();`

// Inline service-worker registratie. Reden voor inline (i.p.v. een client-component
// in <body>): static-analyzers (PWABuilder, Play Store crawl) parsen alleen HTML —
// een useEffect-call zien zij niet. Crawlers bezoeken alleen productie-URLs, dus we
// gaten registratie op productie en saneren in dev (een eerder gebouwde `public/sw.js`
// is in git getrackt en wordt door `next dev` gewoon geserveerd; zonder de unregister
// blijft een stale SW alle `/api/*`-requests onderscheppen en breekt HMR de fetches
// met "Failed to fetch").
//
// De dev-sanering moet SELF-HEALING zijn: een actieve Serwist-SW serveert
// `/_next/static/*.js`-chunks CacheFirst. In dev (Turbopack) wijzigt de inhoud van
// die chunks bij elke rebuild, dus een stale chunk levert "module factory is not
// available" op (de RSC-payload vraagt module-IDs die niet in de gecachete chunk
// zitten). `unregister()` + `caches.delete()` hebben pas effect op de VOLGENDE load,
// niet op de huidige door de SW gecontroleerde load — daarom: wacht tot het opschonen
// klaar is en herlaad dan EENMALIG (sessionStorage-guard tegen reload-loops) zodat de
// volgende load met lege caches verse chunks ophaalt.
const SW_REGISTER_SCRIPT = process.env.NODE_ENV === 'production'
  ? `(function(){if(!('serviceWorker' in navigator))return;window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(function(e){console.warn('[trifinity] sw register failed:',e);});});})();`
  : `(function(){if(!('serviceWorker' in navigator))return;var clear=function(){return Promise.all([navigator.serviceWorker.getRegistrations().then(function(regs){return Promise.all(regs.map(function(r){return r.unregister();}));}).catch(function(){}),(window.caches&&caches.keys)?caches.keys().then(function(keys){return Promise.all(keys.map(function(k){return caches.delete(k);}));}).catch(function(){}):Promise.resolve()]);};if(!navigator.serviceWorker.controller){try{sessionStorage.removeItem('tf-sw-healed');}catch(e){}clear();return;}clear().then(function(){try{if(!sessionStorage.getItem('tf-sw-healed')){sessionStorage.setItem('tf-sw-healed','1');location.reload();}}catch(e){}});})();`

export function HeadScripts() {
  useServerInsertedHTML(() => (
    <>
      <script dangerouslySetInnerHTML={{ __html: PALETTE_INIT_SCRIPT }} />
      <script dangerouslySetInnerHTML={{ __html: SW_REGISTER_SCRIPT }} />
    </>
  ))

  return null
}
