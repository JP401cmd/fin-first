import { Header } from '@/components/landing/header'
import { Hero } from '@/components/landing/hero'
import { Features } from '@/components/landing/features'
import { Pricing } from '@/components/landing/pricing'
import { Faq } from '@/components/landing/faq'
import { Footer } from '@/components/landing/footer'

export default function Home() {
  return (
    <div className="bg-[var(--bg)] text-[var(--ink)]">
      {/* Skip-link — eerste tab-stop voor keyboard- en screen-reader-gebruikers
          (WCAG 2.1 Bypass Blocks). sr-only verbergt visueel; focus:not-sr-only
          maakt zichtbaar bij focus. Target = #main-content op <main>. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:bg-[var(--paper)] focus:px-4 focus:py-2 focus:border-2 focus:border-[var(--ink)] focus:text-sm focus:font-medium focus:text-[var(--ink)] focus:no-underline"
      >
        Naar inhoud
      </a>
      <Header />
      <main id="main-content">
        <Hero />
        <Features />
        <Pricing />
        <Faq />
      </main>
      <Footer />
    </div>
  )
}
