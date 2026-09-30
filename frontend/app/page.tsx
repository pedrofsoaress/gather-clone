import AnimatedCharacter from './play/SkinMenu/AnimatedCharacter'
import Link from 'next/link'
import BasicButton from '@/components/BasicButton'

const officeUrl = '/play/0d778bfd-8e16-49bc-832f-3aa60c5bef0c?shareId=f2ac1499-532e-47aa-9244-5b48f8926283'

export default function Index() {
  return (
    <main className='min-h-screen gradient px-6 py-16 flex items-center justify-center'>
      <div className='w-full max-w-3xl rounded-3xl border border-white/20 bg-[#1b2344]/80 px-8 py-12 text-center shadow-2xl sm:px-16'>
        <p className='mb-5 text-sm font-bold uppercase tracking-[0.35em] text-[#00d4b2]'>Matte</p>
        <h1 className='text-4xl font-bold sm:text-6xl'>Escritório virtual</h1>
        <p className='mx-auto mt-6 max-w-xl text-lg text-[#cad8ff]'>
          Encontre o time, circule pelo escritório e converse com quem estiver por perto.
        </p>
        <div className='my-8 flex justify-center'>
          <AnimatedCharacter src='/sprites/characters/Character_009.png' />
        </div>
        <Link href={officeUrl}>
          <BasicButton>Entrar no escritório</BasicButton>
        </Link>
        <p className='mt-6 text-sm text-[#b9c2db]'>Acesso aberto pelo link. Câmera e microfone começam desligados.</p>
        <Link href="/install" className="mt-4 inline-block text-sm text-teal-300 underline underline-offset-4">Instalar o aplicativo Matte Office</Link>
      </div>
    </main>
  )
}
