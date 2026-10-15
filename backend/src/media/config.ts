export type CloudflareCredentials = { appId: string, appSecret: string, turnKeyId: string, turnApiToken: string }
export type VideoProvider = { provider: 'agora' } | { provider: 'cloudflare', credentials: CloudflareCredentials }

const REQUIRED = ['CLOUDFLARE_SFU_APP_ID', 'CLOUDFLARE_SFU_APP_SECRET', 'CLOUDFLARE_TURN_KEY_ID', 'CLOUDFLARE_TURN_API_TOKEN'] as const

// Read once at startup. Logs name the missing variables, never a value.
export function videoProviderFromEnv(env: Record<string, string | undefined>, log: (line: string) => void = console.error): VideoProvider {
    if ((env.VIDEO_PROVIDER ?? '').trim().toLowerCase() !== 'cloudflare') return { provider: 'agora' }
    const value = (name: typeof REQUIRED[number]) => (env[name] ?? '').trim()
    const missing = REQUIRED.filter(name => !value(name))
    if (missing.length) {
        log(`VIDEO_PROVIDER=cloudflare sem ${missing.join(', ')}; usando agora.`)
        return { provider: 'agora' }
    }
    return { provider: 'cloudflare', credentials: { appId: value('CLOUDFLARE_SFU_APP_ID'), appSecret: value('CLOUDFLARE_SFU_APP_SECRET'), turnKeyId: value('CLOUDFLARE_TURN_KEY_ID'), turnApiToken: value('CLOUDFLARE_TURN_API_TOKEN') } }
}
