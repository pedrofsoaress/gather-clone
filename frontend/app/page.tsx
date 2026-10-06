import Link from 'next/link'
import type { Viewport } from 'next'
import { ChatsCircle, Desk, PictureInPicture } from '@phosphor-icons/react/dist/ssr'
import MatteLogo from '@/components/Brand/MatteLogo'
import OfficePreview from '@/components/Home/OfficePreview'
import { card, focusRing, kicker, primaryButton, secondaryButton } from '@/components/Brand/styles'

const officeUrl = '/play/0d778bfd-8e16-49bc-832f-3aa60c5bef0c?shareId=f2ac1499-532e-47aa-9244-5b48f8926283'

// Black browser bar on this page; the office keeps the root layout's navy.
export const viewport: Viewport = { themeColor: '#0B0B0F' }

const features = [
    { Icon: ChatsCircle, title: 'Conversa por proximidade', text: 'Chegue perto de alguém e a chamada abre sozinha. Ao se afastar, ela termina.' },
    { Icon: Desk, title: 'Sua mesa no mapa', text: 'Sente na sua mesa, deixe recados no quadro e veja quem está no escritório.' },
    { Icon: PictureInPicture, title: 'Janela flutuante', text: 'Saia da aba e continue vendo a conversa numa janelinha por cima dos outros programas.' },
]

export default function Index() {
    return <main className='matte-backdrop min-h-screen text-white'>
        <header className='mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6'>
            <MatteLogo />
            <Link href='/install' className={`rounded-lg px-2 py-1 text-sm font-semibold text-white/70 transition-colors hover:text-white ${focusRing}`}>Instalar app</Link>
        </header>

        <section className='mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-14 lg:pb-20 lg:pt-12'>
            <div className='max-w-xl'>
                <p className={kicker}>Matte Office</p>
                <h1 className='mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl'>Escritório virtual da Matte</h1>
                <p className='mt-5 text-lg leading-relaxed text-white/70'>Encontre o time no mapa, sente na sua mesa e converse com quem estiver por perto, com vídeo e áudio direto no navegador.</p>
                <div className='mt-8 flex flex-col gap-3 sm:flex-row'>
                    <Link href={officeUrl} className={primaryButton}>Entrar no escritório</Link>
                    <Link href='/install' className={secondaryButton}>Instalar o aplicativo</Link>
                </div>
                <p className='mt-4 text-sm text-white/60'>Câmera e microfone começam desligados.</p>
            </div>
            <OfficePreview />
        </section>

        <section aria-label='O que dá para fazer no escritório' className='mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:px-6 md:grid-cols-3'>
            {features.map(({ Icon, title, text }) => <article key={title} className={`${card} p-6`}>
                <span className='grid h-11 w-11 place-items-center rounded-xl bg-matte-pink/15 text-matte-pink'><Icon size={22} weight='bold' /></span>
                <h2 className='mt-4 text-base font-bold'>{title}</h2>
                <p className='mt-2 text-sm leading-relaxed text-white/60'>{text}</p>
            </article>)}
        </section>

        <footer className='border-t border-white/10 py-6 text-center text-xs text-white/60'>© {new Date().getFullYear()} Matte</footer>
    </main>
}
