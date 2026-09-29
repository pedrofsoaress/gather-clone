import React from 'react'

type BasicButtonProps = {
    children?: React.ReactNode
    className?: string
    onClick?: () => void
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
}

const BasicButton:React.FC<BasicButtonProps> = ({ children, className, onClick, disabled, type = 'button' }) => {
    
    return (
        <button type={type} disabled={disabled} className={`bg-quaternary hover:bg-quaternaryhover animate-colors font-semibold text-button text-sm py-4 px-6 rounded-lg ${disabled ? 'pointer-events-none opacity-70' : ''} ${className}`} onClick={onClick}>
            {children} 
        </button>
    )
}

export default BasicButton
