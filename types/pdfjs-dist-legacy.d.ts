// Ambient type-shim voor de pdfjs-dist LEGACY build-subpath.
//
// `components/aangifte/upload-step.tsx` importeert bewust de legacy-build
// (`pdfjs-dist/legacy/build/pdf.mjs`) i.p.v. de bare module, omdat de v6
// modern-build de browser-baseline flink optrok (polyfills verwijderd) en de
// aangifte-PDF door consumenten op diverse (mobiele) devices geüpload wordt.
// De legacy-build transpileert terug naar een bredere browser-set
// (Chrome 125+/Safari 18+/Firefox ESR+).
//
// pdfjs-dist heeft geen `exports`-map en levert geen `.d.ts` náást de
// legacy-build; het `types`-veld (types/src/pdf.d.ts) dekt alleen de bare
// import. Zonder deze shim faalt `tsc` met TS2307 op de deep-import. De
// legacy- en modern-build exporteren exact dezelfde publieke API, dus we
// aliassen de types 1-op-1 naar de bare module.
declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export * from 'pdfjs-dist'
}
