import React from 'react'

type GoogleSignInButtonProps = {
    onClick: () => void
}

const GoogleSignInButton:React.FC<GoogleSignInButtonProps> = ({ onClick }) => {
    
    return (
        <button type='button' className='flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-bold text-black transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white' onClick={onClick}>
            <img src='/google-logo.png' alt='' className='h-5' />
            <span>Entrar com Google</span>
        </button>
    );
}

export default GoogleSignInButton