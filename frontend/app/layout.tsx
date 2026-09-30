import localFont from 'next/font/local'
import "./globals.css";
import Layout from '@/components/Layout/Layout'
import PwaRegistration from '@/components/Pwa/PwaRegistration'
import type { Metadata, Viewport } from 'next'

const nunito = localFont({
    src: '../public/fonts/nunito.ttf',
    display: 'swap',
})

const publicUrl = process.env.VERCEL_ENV === 'production'
  ? 'https://gather-clone-beta.vercel.app'
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'

const description = 'Entre no escritório virtual da Matte, encontre o time no mapa e converse por proximidade.'

export const metadata: Metadata = {
  metadataBase: new URL(publicUrl),
  title: "Matte | Escritório virtual",
  description,
  applicationName: 'Matte Office',
  appleWebApp: { capable: true, title: 'Matte Office', statusBarStyle: 'default' },
  icons: { icon: '/brand/matte-icon.svg', shortcut: '/brand/matte-icon.svg', apple: '/pwa/apple-touch-icon.png' },
  openGraph: {
    type: 'website', locale: 'pt_BR', siteName: 'Matte',
    title: 'Escritório virtual Matte', description,
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Mapa do escritório virtual da Matte' }],
  },
  twitter: { card: 'summary_large_image', title: 'Escritório virtual Matte', description, images: ['/opengraph-image'] },
}

export const viewport: Viewport = { themeColor: '#191e32' }

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={nunito.className}>
      <body>
        <PwaRegistration>
          <Layout>
              {children}
          </Layout>
        </PwaRegistration>
      </body>
    </html>
  );
}
