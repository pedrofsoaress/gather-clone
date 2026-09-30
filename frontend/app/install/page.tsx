import Link from 'next/link'
import InstallButton from '@/components/Pwa/InstallButton'

export const metadata = {
    title: 'Instalar Matte Office',
    description: 'Adicione o escritório virtual da Matte ao seu computador ou celular.',
}

export default function InstallPage() {
    return <main className='min-h-screen bg-[#191e32] px-6 py-12 text-white sm:py-20'>
        <div className='mx-auto max-w-2xl'>
            <Link href='/' className='text-sm text-[#00d4b2] underline underline-offset-4'>Voltar ao escritório</Link>
            <p className='mt-10 text-sm font-bold uppercase tracking-widest text-[#00d4b2]'>Matte Office</p>
            <h1 className='mt-3 text-3xl font-bold sm:text-4xl'>Seu escritório, em uma janela própria</h1>
            <p className='mt-5 text-lg text-[#cad8ff]'>Instale pelo navegador para abrir a Matte direto da área de trabalho ou da tela inicial. Você usa o mesmo escritório, com seu nome, câmera e conversas.</p>
            <InstallButton />
            <section aria-labelledby='install-instructions' className='mt-8 border-t border-white/15 pt-8'>
                <h2 id='install-instructions' className='text-xl font-bold'>Como instalar</h2>
                <dl className='mt-5 space-y-5 text-[#cad8ff]'>
                    <div><dt className='font-bold text-white'>Chrome ou Edge no computador</dt><dd className='mt-1'>Abra o menu do navegador e procure a opção para instalar esta página como aplicativo. O ícone de instalação também pode aparecer na barra de endereço.</dd></div>
                    <div><dt className='font-bold text-white'>Safari no Mac</dt><dd className='mt-1'>No menu Arquivo, escolha “Adicionar ao Dock”, quando essa opção estiver disponível.</dd></div>
                    <div><dt className='font-bold text-white'>iPhone ou iPad</dt><dd className='mt-1'>Abra no Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”. Ative “Abrir como App” se essa opção aparecer.</dd></div>
                    <div><dt className='font-bold text-white'>Android</dt><dd className='mt-1'>No Chrome, abra o menu e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.</dd></div>
                </dl>
            </section>
            <p className='mt-8 rounded-lg border border-white/15 p-4 text-sm text-[#cad8ff]'>O escritório precisa de internet. Câmera, microfone e compartilhamento de tela continuam dependendo da sua autorização e do suporte do navegador. As atualizações chegam ao reabrir ou recarregar o aplicativo; uma reunião em andamento não é recarregada automaticamente.</p>
        </div>
    </main>
}
