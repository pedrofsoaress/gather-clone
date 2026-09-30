import localFont from 'next/font/local'
import "./globals.css";
import Layout from '@/components/Layout/Layout'
import PwaRegistration from '@/components/Pwa/PwaRegistration'
import type { Metadata, Viewport } from 'next'

const nunito = localFont({
    src: '../public/fonts/nunito.ttf',
    display: 'swap',
})

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000"

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Matte | Escritório virtual",
  description: "Entre no escritório virtual da Matte e converse com o time por proximidade.",
  applicationName: 'Matte Office',
  appleWebApp: { capable: true, title: 'Matte Office', statusBarStyle: 'default' },
  icons: { apple: '/pwa/apple-touch-icon.png' },
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
