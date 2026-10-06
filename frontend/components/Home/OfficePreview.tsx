import Image from 'next/image'
import AnimatedCharacter from '@/app/play/SkinMenu/AnimatedCharacter'

// Positions are percentages of the map image; Task 5 adjusts them so each
// avatar stands on open floor in the screenshot.
const people = [
    { skin: '017', name: 'Ana', left: '31%', top: '58%' },
    { skin: '060', name: 'Bruno', left: '38%', top: '58%' },
    { skin: '009', name: 'Carla', left: '70%', top: '38%' },
]

export default function OfficePreview() {
    return <figure className='relative overflow-hidden rounded-3xl border border-white/10 bg-matte-surface shadow-[0_30px_80px_rgba(0,0,0,0.55)]'>
        <Image src='/matte-office-v2.png' alt='Mapa do escritório virtual da Matte' width={1600} height={960} priority sizes='(min-width: 1024px) 600px, 100vw' className='h-auto w-full' />
        <div aria-hidden='true' className='pointer-events-none absolute inset-0 bg-gradient-to-t from-matte-black/50 via-transparent to-transparent' />
        {people.map(person => <div key={person.name} aria-hidden='true' className='absolute flex -translate-x-1/2 -translate-y-full flex-col items-center' style={{ left: person.left, top: person.top }}>
            <span className='mb-0.5 rounded-md bg-matte-black/85 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white'>{person.name}</span>
            <AnimatedCharacter src={`/sprites/characters/Character_${person.skin}.png`} noAnimation className='!h-9 !w-9 sm:!h-11 sm:!w-11' />
        </div>)}
        <figcaption className='absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full bg-matte-black/85 px-3 py-1.5 text-xs font-semibold text-white'>
            <span aria-hidden='true' className='h-2 w-2 rounded-full bg-matte-pink' />
            Ana e Bruno estão conversando
        </figcaption>
    </figure>
}
