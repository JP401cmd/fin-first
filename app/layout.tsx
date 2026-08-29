import type { Metadata, Viewport } from "next";
import { Playfair_Display, Source_Serif_4, DM_Mono, Inter, Andada_Pro } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { HeadScripts } from "@/components/app/head-scripts";
import { WebVitalsReporter } from "@/components/app/web-vitals-reporter";
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
  // Toetsenbord verkleint de layout-viewport (B-013, 29-08-2026): zonder deze
  // instelling is Chrome/Android sinds v108 'resizes-visual' — het toetsenbord
  // schuift dan de visuele viewport omhoog en de kop van vol-hoge, dvh-gebaseerde
  // panelen (Fin-chat, sheets) valt uit beeld. Met 'resizes-content' krimpt
  // 100dvh mee en blijft bottom-verankerde UI boven het toetsenbord.
  interactiveWidget: 'resizes-content',
}

export const metadata: Metadata = {
  metadataBase: new URL('https://trifinity.app'),
  title: "TriFinity — Ken je waarheid. Kies je vrijheid. Leef je tijd.",
  description: "Geld is opgeslagen tijd. TriFinity vertaalt je financien naar vrijheid — jouw persoonlijke finance freedom navigator.",
  openGraph: {
    title: "TriFinity — Ken je waarheid. Kies je vrijheid. Leef je tijd.",
    description: "Geld is opgeslagen tijd. TriFinity vertaalt je financien naar vrijheid — jouw persoonlijke finance freedom navigator.",
    type: 'website',
    locale: 'nl_NL',
    siteName: 'TriFinity',
    url: 'https://trifinity.app',
  },
  twitter: {
    card: 'summary_large_image',
    title: "TriFinity — Ken je waarheid. Kies je vrijheid. Leef je tijd.",
    description: "Geld is opgeslagen tijd. TriFinity vertaalt je financien naar vrijheid — jouw persoonlijke finance freedom navigator.",
  },
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <body
        className={`${playfair.variable} ${sourceSerif.variable} ${dmMono.variable} ${inter.variable} ${andadaPro.variable} antialiased`}
        suppressHydrationWarning
      >
        <HeadScripts />
        {children}
        <SpeedInsights />
        <WebVitalsReporter />
      </body>
    </html>
  );
}
