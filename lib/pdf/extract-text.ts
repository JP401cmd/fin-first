// ── Gedeelde pdfjs-tekstextractie (client-side, geen egress) ──────────────────
//
// Opgetild uit components/aangifte/upload-step.tsx, waar dit als lokale helper
// begon. Er is nu een tweede consument (het lokale pensioen-PDF-pad), en de
// worker-strategie is precies het soort detail dat je niet twee keer wilt
// overtypen: één afwijking en de tweede consument haalt de worker stilletjes van
// een CDN. Vandaar één plek.
//
// NO-EGRESS. De worker (`pdf.worker.min.mjs`) wordt door de postinstall-hook
// `scripts/copy-pdfjs-worker.mjs` uit node_modules naar `public/` gekopieerd en
// hier op dat eigen-origin-pad gepind. Dezelfde filosofie als de zelf-gehoste
// LiteRT-WASM-assets: geen third-party script, geen IP/UA-lek, CSP blijft smal.
//
// BUILD-KEUZE: bewust de LEGACY-build (`pdfjs-dist/legacy/build/pdf.mjs`). De
// v6 modern-build trok de browser-baseline flink op; deze PDF's (aangifte, UPO)
// worden juist vaak vanaf een telefoon geüpload. De worker MOET dan óók uit
// `legacy/build/` komen, anders faalt pdf.js met een API/worker-versiemismatch.
// De type-shim voor de deep-import staat in `types/pdfjs-dist-legacy.d.ts`.
//
// GEHEUGEN. Een UPO van 10 MB komt op een toestel binnen waar óók ~2 GB
// modelgewicht op gedeeld iGPU-geheugen staat. Daarom leest deze module PAGINA
// VOOR PAGINA en geeft elke pagina direct vrij (`page.cleanup()`), en wordt het
// document na afloop altijd afgebroken (`pdf.destroy()`, ook bij een fout). Dat
// is het verschil tussen "even 30 MB extra" en een out-of-memory op mobiel.

/**
 * Eigen-origin pad naar de gekopieerde pdf.js-worker. Statisch onder /public;
 * gevuld door de postinstall-hook. Zie de kop: nooit een CDN-pad.
 */
export const PDFJS_WORKER_SRC = '/pdf.worker.min.mjs'

export interface PdfTextProgress {
  /** 1-gebaseerd paginanummer dat zojuist is gelezen. */
  page: number
  /** Aantal pagina's dat deze aanroep zal lezen (na toepassing van `maxPages`). */
  totalPages: number
}

export interface ExtractPdfOptions {
  /** Per gelezen pagina aangeroepen — voor voortgang in een trage, lokale flow. */
  onProgress?: (p: PdfTextProgress) => void
  /**
   * Harde bovengrens op het aantal te lezen pagina's. Een UPO is enkele
   * pagina's; een per ongeluk aangeboden boekwerk moet niet minutenlang de
   * hoofdthread bezighouden.
   */
  maxPages?: number
}

/**
 * Lees de tekstlaag van een PDF uit, PAGINA VOOR PAGINA.
 *
 * Retourneert één string per pagina (fragmenten met spaties aaneengeregen,
 * exact zoals de oorspronkelijke aangifte-helper deed). Een pagina zonder
 * tekstlaag levert een lege string op — de aanroeper beslist wat dat betekent;
 * deze module oordeelt daar bewust niet over.
 *
 * LET OP (bekende beperking, relevant voor iedere consument): `getTextContent()`
 * levert fragmenten in de leesvolgorde van de PDF-contentstream, NIET in
 * visuele kolomvolgorde. Bij een tabel met labels links en bedragen rechts kan
 * de koppeling label↔bedrag dus door elkaar lopen. Wie op die koppeling
 * vertrouwt, moet dat downstream afvangen.
 */
export async function extractPdfPageTexts(
  file: File,
  opts: ExtractPdfOptions = {},
): Promise<string[]> {
  // Dynamische import: houdt pdfjs uit de SSR-bundel en uit de initiële
  // client-bundel van iedereen die deze flow niet aanraakt.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC
  }

  const arrayBuffer = await file.arrayBuffer()
  // De loadingTask vasthouden (niet alleen `.promise`): de teardown hangt daar,
  // niet op het document — `PDFDocumentProxy` heeft in pdfjs v6 geen `destroy()`
  // meer. Zonder deze referentie blijft de worker met het volledige document in
  // het geheugen staan tot de pagina ververst.
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise

  const pages: string[] = []
  try {
    const limit = opts.maxPages && opts.maxPages > 0 ? Math.min(pdf.numPages, opts.maxPages) : pdf.numPages
    for (let pageNum = 1; pageNum <= limit; pageNum += 1) {
      const page = await pdf.getPage(pageNum)
      try {
        const content = await page.getTextContent()
        pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '))
      } finally {
        // Direct de per-pagina-buffers vrijgeven; zonder dit houdt pdf.js de
        // operatorlijst van élke gelezen pagina vast tot het document sluit.
        page.cleanup()
      }
      opts.onProgress?.({ page: pageNum, totalPages: limit })
    }
  } finally {
    // Ook bij een fout: breek het document (en daarmee de worker-state) af.
    await loadingTask.destroy()
  }

  return pages
}

/**
 * Zelfde extractie, maar als één platte string — de vorm die de aangifte-flow
 * gebruikt. Pagina's worden met een newline gescheiden; gedrag is identiek aan
 * de oorspronkelijke helper in `upload-step.tsx`.
 */
export async function extractTextFromPdf(file: File, opts: ExtractPdfOptions = {}): Promise<string> {
  const pages = await extractPdfPageTexts(file, opts)
  return pages.map((p) => `${p}\n`).join('')
}
