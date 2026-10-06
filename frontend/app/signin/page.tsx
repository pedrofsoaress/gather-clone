'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SpinnerGap } from '@phosphor-icons/react'
import { createClient } from '@/utils/supabase/client'
import MatteLogo from '@/components/Brand/MatteLogo'
import { card, primaryButton, secondaryButton } from '@/components/Brand/styles'
import GoogleSignInButton from './GoogleSignInButton'

type Mode = 'checking' | 'joining' | 'form'

// How long the office link waits for the guest entry before offering a retry.
const AUTO_JOIN_TIMEOUT_MS = 15000

export default function Login() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [status, setStatus] = useState('')
    const [loading, setLoading] = useState(false)
    // Starts as 'checking' so the prerendered HTML and the first paint show the
    // loading card; visitors from the office link never see a flash of the form.
    const [mode, setMode] = useState<Mode>('checking')
    const [guestFailed, setGuestFailed] = useState(false)
    // Guest failures show under the guest button; email and Google results at the bottom.
    const [guestStatus, setGuestStatus] = useState('')
    const autoJoinStarted = useRef(false)
    const autoJoinTimer = useRef<number | null>(null)
    const autoJoinPending = useRef(false)

    const getDestination = () => {
        const requested = new URLSearchParams(window.location.search).get('next')
        if (!requested?.startsWith('/play/') || requested.startsWith('//')) return '/app'
        const destination = new URL(requested, window.location.origin)
        return destination.origin === window.location.origin
            ? `${destination.pathname}${destination.search}`
            : '/app'
    }

    const clearAutoJoinTimer = () => {
        if (autoJoinTimer.current !== null) window.clearTimeout(autoJoinTimer.current)
        autoJoinTimer.current = null
    }

    const armAutoJoinTimer = () => {
        clearAutoJoinTimer()
        autoJoinTimer.current = window.setTimeout(() => {
            autoJoinTimer.current = null
            failGuest('A entrada está demorando. Tente novamente.')
        }, AUTO_JOIN_TIMEOUT_MS)
    }

    const settleAutoJoin = () => {
        autoJoinPending.current = false
        clearAutoJoinTimer()
    }

    const failGuest = (message: string) => {
        settleAutoJoin()
        setGuestStatus(message)
        setGuestFailed(true)
        setMode('form')
        setLoading(false)
    }

    const signInAsGuest = async () => {
        setLoading(true)
        setStatus('')
        setGuestStatus('')
        setGuestFailed(false)
        try {
            const supabase = createClient()
            const guestName = `Guest-${crypto.randomUUID().slice(0, 6)}`
            const { data, error } = await supabase.auth.signInAnonymously({
                options: { data: { email: `${guestName}@guest.local` } },
            })
            if (error || !data.user) {
                if (error) console.error(error)
                return failGuest('Não foi possível criar sua entrada como visitante.')
            }

            const { error: profileError } = await supabase.from('profiles').upsert(
                { id: data.user.id },
                { onConflict: 'id', ignoreDuplicates: true },
            )
            if (profileError) {
                console.error(profileError)
                return failGuest('Não foi possível preparar seu perfil.')
            }

            settleAutoJoin()
            router.push(getDestination())
            router.refresh()
        } catch (error) {
            console.error(error)
            failGuest('Não foi possível criar sua entrada como visitante. Confira sua conexão.')
        }
    }

    useEffect(() => {
        if (autoJoinStarted.current) {
            // React Strict Mode (dev) re-runs this effect after its cleanup: keep the timeout armed.
            if (!autoJoinPending.current) return
            armAutoJoinTimer()
            return clearAutoJoinTimer
        }
        const destination = getDestination()
        if (destination === '/app' || !destination.includes('shareId=')) {
            setMode('form')
            return
        }
        autoJoinStarted.current = true
        autoJoinPending.current = true
        setMode('joining')
        armAutoJoinTimer()
        const supabase = createClient()
        void supabase.auth.getSession().then(({ data }) => {
            if (data.session) {
                settleAutoJoin()
                router.replace(destination)
            } else {
                void signInAsGuest()
            }
        }).catch(error => {
            console.error(error)
            failGuest('Não foi possível verificar sua entrada.')
        })
        return clearAutoJoinTimer
    }, [])

    const signInWithEmail = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setLoading(true)
        setStatus('')
        const supabase = createClient()
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        })
        setStatus(error ? 'Não foi possível enviar o link. Confira o e-mail e tente novamente.' : 'Enviamos um link de acesso para o seu e-mail.')
        setLoading(false)
    }

    const signInWithGoogle = async () => {
        const supabase = createClient()
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: process.env.NEXT_PUBLIC_BASE_URL + '/auth/callback'
            }
        })
        if (error) setStatus('Não foi possível entrar com o Google.')
    }

    return (
        <main className='matte-backdrop grid min-h-screen place-items-center px-4 py-12 text-white'>
            <div className={`${card} w-full max-w-sm p-6 sm:p-8`}>
                <div className={mode === 'form' ? '' : 'flex justify-center'}>
                    <MatteLogo />
                </div>
                {mode !== 'form' ? <div className='mt-8 flex flex-col items-center gap-4 text-center' role='status'>
                    <SpinnerGap size={32} aria-hidden='true' className='animate-spin text-matte-pink' />
                    <p className='text-lg font-bold'>{mode === 'joining' ? 'Entrando no escritório…' : 'Carregando…'}</p>
                    {mode === 'joining' && <p className='text-sm text-white/60'>Estamos preparando sua entrada como visitante.</p>}
                </div> : <>
                    <h1 className='mt-8 text-2xl font-extrabold tracking-tight'>Entrar no escritório</h1>
                    <p className='mt-2 text-sm text-white/60'>Entre como visitante ou use seu e-mail da equipe.</p>
                    <button type='button' onClick={signInAsGuest} disabled={loading} className={`${primaryButton} mt-6 w-full`}>
                        {guestFailed ? 'Tentar novamente' : 'Entrar como visitante'}
                    </button>
                    {guestStatus && <p role='status' className='mt-3 text-center text-sm text-white/80'>{guestStatus}</p>}
                    <p className='mt-3 text-xs leading-relaxed text-white/60'>Como visitante, seus espaços ficam salvos só neste navegador e se perdem ao sair da conta ou limpar os dados do navegador.</p>
                    <form onSubmit={signInWithEmail} className='mt-6 flex flex-col gap-2 border-t border-white/10 pt-6'>
                        <label htmlFor='email' className='text-sm font-semibold'>E-mail da equipe</label>
                        <input id='email' type='email' required autoComplete='email' value={email} onChange={(event) => setEmail(event.target.value)}
                            className='w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none transition-colors focus:border-matte-pink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'/>
                        <button type='submit' disabled={loading} className={`${secondaryButton} mt-1 w-full`}>
                            {loading ? 'Enviando…' : 'Receber link de acesso'}
                        </button>
                    </form>
                    {process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true' && <div className='mt-3'><GoogleSignInButton onClick={signInWithGoogle} /></div>}
                </>}
                {status && <p role='status' className='mt-4 text-center text-sm text-white/80'>{status}</p>}
            </div>
        </main>
    )
}
