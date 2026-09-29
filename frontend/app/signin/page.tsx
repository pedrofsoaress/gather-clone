'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import GoogleSignInButton from './GoogleSignInButton'

export default function Login() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [status, setStatus] = useState('')
    const [loading, setLoading] = useState(false)
    const autoJoinStarted = useRef(false)

    const getDestination = () => {
        const requested = new URLSearchParams(window.location.search).get('next')
        if (!requested?.startsWith('/play/') || requested.startsWith('//')) return '/app'
        const destination = new URL(requested, window.location.origin)
        return destination.origin === window.location.origin
            ? `${destination.pathname}${destination.search}`
            : '/app'
    }

    const signInAsGuest = async () => {
        setLoading(true)
        setStatus('')
        const supabase = createClient()
        const guestName = `Guest-${crypto.randomUUID().slice(0, 6)}`
        const { data, error } = await supabase.auth.signInAnonymously({
            options: { data: { email: `${guestName}@guest.local` } },
        })
        if (error || !data.user) {
            setStatus(error?.message || 'Could not create a guest session.')
            setLoading(false)
            return
        }

        const { error: profileError } = await supabase.from('profiles').upsert(
            { id: data.user.id },
            { onConflict: 'id', ignoreDuplicates: true },
        )
        if (profileError) {
            setStatus(profileError.message)
            setLoading(false)
            return
        }

        router.push(getDestination())
        router.refresh()
    }

    useEffect(() => {
        if (autoJoinStarted.current) return
        const destination = getDestination()
        if (destination === '/app' || !destination.includes('shareId=')) return
        autoJoinStarted.current = true
        const supabase = createClient()
        void supabase.auth.getSession().then(({ data }) => {
            if (data.session) {
                router.replace(destination)
            } else {
                void signInAsGuest()
            }
        })
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
        setStatus(error ? error.message : 'Check your email for the sign-in link.')
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
        if (error) setStatus(error.message)
    }

  return (
    <div className='flex flex-col items-center w-full pt-56 gap-6'>
        <button type='button' onClick={signInAsGuest} disabled={loading} className='h-14 w-64 rounded-md bg-white text-black disabled:opacity-50'>
            Continue as guest
        </button>
        <p className='max-w-sm text-center text-sm'>Guest spaces stay tied to this browser and cannot be recovered after signing out or clearing browser data.</p>
        <p className='text-sm'>Team members can sign in by email</p>
        <form onSubmit={signInWithEmail} className='flex flex-col gap-3 w-64'>
            <label htmlFor='email'>Email</label>
            <input id='email' type='email' required autoComplete='email' value={email} onChange={(event) => setEmail(event.target.value)} className='rounded-md px-3 py-2 text-black'/>
            <button type='submit' disabled={loading} className='rounded-md bg-white px-3 py-2 text-black disabled:opacity-50'>
                {loading ? 'Sending...' : 'Email me a sign-in link'}
            </button>
        </form>
        {process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true' && <GoogleSignInButton onClick={signInWithGoogle} />}
        {status && <p role='status' className='text-center max-w-sm'>{status}</p>}
    </div>
  );
}
