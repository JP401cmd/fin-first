const fs = require('fs')
const path = require('path')

// Create a large file (11 MB) - exceeds the 10 MB limit
const largeSize = 11 * 1024 * 1024
const largeBuf = Buffer.alloc(largeSize, 'A')
const largePath = path.join(__dirname, '..', 'test-large-file.csv')
fs.writeFileSync(largePath, largeBuf)
console.log('Created large file:', (largeBuf.length / (1024 * 1024)).toFixed(1), 'MB at', largePath)

// Create a small file (1 KB) - well under the 10 MB limit
const smallContent = 'Datum;Naam / Omschrijving;Rekening;Tegenrekening;Code;Af Bij;Bedrag (EUR);Mutatiesoort;Mededelingen\n20260101;Test Transaction;NL00INGB0001234567;NL00INGB0009876543;GT;Af;25,00;Internetbankieren;Test betaling\n'
const smallPath = path.join(__dirname, '..', 'test-small-file.csv')
fs.writeFileSync(smallPath, smallContent)
console.log('Created small file:', (Buffer.byteLength(smallContent) / 1024).toFixed(1), 'KB at', smallPath)
