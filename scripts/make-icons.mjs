import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

const out = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url))

const mark = `
  <circle cx="256" cy="196" r="54" fill="#C1442E"/>
  <path d="M256 286c-28-22-66-28-102-22v126c36-6 74 0 102 22 28-22 66-28 102-22V264c-36-6-74 0-102 22Z" fill="none" stroke="#1C1A17" stroke-width="17" stroke-linejoin="round"/>
  <path d="M256 286v126" fill="none" stroke="#1C1A17" stroke-width="17" stroke-linecap="round"/>
`

const icon = (scale, rounded) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="#F5F1E8"/>
  ${rounded ? '<rect x="28" y="28" width="456" height="456" rx="92" fill="none" stroke="#1C1A17" stroke-opacity="0.08" stroke-width="2"/>' : ''}
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${mark}</g>
</svg>
`

await sharp(Buffer.from(icon(1, true))).resize(192, 192).png().toFile(out('pwa-192x192.png'))
await sharp(Buffer.from(icon(1, true))).resize(512, 512).png().toFile(out('pwa-512x512.png'))
await sharp(Buffer.from(icon(0.72, false))).resize(512, 512).png().toFile(out('pwa-maskable-512x512.png'))
await sharp(Buffer.from(icon(1, true))).resize(180, 180).png().toFile(out('apple-touch-icon.png'))

console.log('icons generated')
