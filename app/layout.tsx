import type { Metadata, Viewport } from "next";
import { Playfair_Display, Source_Serif_4, DM_Mono, Inter, Andada_Pro } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const andadaPro = Andada_Pro({
  variable: "--font-andada",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl">
      <head>
        <script dangerouslySetInnerHTML={{ __html: PALETTE_INIT_SCRIPT }} />
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
