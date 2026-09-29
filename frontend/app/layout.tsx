import localFont from 'next/font/local'
import "./globals.css";
import Layout from '@/components/Layout/Layout'

const nunito = localFont({
    src: '../public/fonts/nunito.ttf',
    display: 'swap',
})

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000"

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Matte | Escritório virtual",
  description: "Entre no escritório virtual da Matte e converse com o time por proximidade.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={nunito.className}>
      <body>
        <Layout>
            {children}
        </Layout>
      </body>
    </html>
  );
}
