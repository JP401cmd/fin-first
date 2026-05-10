import type { Metadata, Viewport } from "next";
import { Playfair_Display, Source_Serif_4, DM_Mono, Inter, Andada_Pro } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

// LCP-font: hero h1 op /core, /will, /horizon en alle category-pages.
// preload: true zodat de browser hem direct prioriteert. Alleen Playfair
// krijgt deze voorkeur — andere fonts dingen anders mee om bandbreedte.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
  preload: true,
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  preload: false,
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false,
});

const andadaPro = Andada_Pro({
  variable: "--font-andada",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#faf9f6',
}

export const metadata: Metadata = {
  title: "TriFinity — Ken je waarheid. Kies je vrijheid. Leef je tijd.",
  description: "Geld is opgeslagen tijd. TriFinity vertaalt je financien naar vrijheid — jouw persoonlijke finance freedom navigator.",
  manifest: '/manifest.json',
  // Icons block: gives Next.js explicit references for favicon, Apple touch
  // icon, and the PWA icons that Bubblewrap reads from the manifest later.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TriFinity',
  },
};

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
const SW_REGISTER_SCRIPT = process.env.NODE_ENV === 'production'
  ? `(function(){if(!('serviceWorker' in navigator))return;window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(function(e){console.warn('[trifinity] sw register failed:',e);});});})();`
  : `(function(){if(!('serviceWorker' in navigator))return;navigator.serviceWorker.getRegistrations().then(function(regs){regs.forEach(function(r){r.unregister();});}).catch(function(){});if(window.caches&&caches.keys){caches.keys().then(function(keys){keys.forEach(function(k){caches.delete(k);});}).catch(function(){});}})();`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PALETTE_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SW_REGISTER_SCRIPT }} />
      </head>
      <body
        className={`${playfair.variable} ${sourceSerif.variable} ${dmMono.variable} ${inter.variable} ${andadaPro.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
