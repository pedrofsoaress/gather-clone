import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const runtime = 'nodejs'
export const alt = 'Mapa do escritório virtual da Matte'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpenGraphImage() {
  const [office, icon] = await Promise.all([
    readFile(path.join(process.cwd(), 'public/matte-office-v2.png')),
    readFile(path.join(process.cwd(), 'public/pwa/icon-192.png')),
  ])

  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', overflow: 'hidden', backgroundColor: '#191e32', color: '#fff' }}>
      <img src={`data:image/png;base64,${office.toString('base64')}`} alt='' style={{ position: 'absolute', width: 1200, height: 730, top: -50, left: 0 }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 250, backgroundColor: 'rgba(12,18,32,0.91)', borderTop: '3px solid #d3135a' }} />
      <div style={{ position: 'absolute', left: 44, bottom: 36, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <img src={`data:image/png;base64,${icon.toString('base64')}`} alt='' width={58} height={58} style={{ borderRadius: 12 }} />
          <span style={{ fontSize: 25, fontWeight: 800, letterSpacing: 5 }}>MATTE</span>
        </div>
        <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1 }}>Escritório virtual</div>
        <div style={{ fontSize: 24, color: '#e2e8f0', marginTop: 12 }}>Encontre o time no mapa e converse por proximidade.</div>
      </div>
    </div>,
    size,
  )
}
