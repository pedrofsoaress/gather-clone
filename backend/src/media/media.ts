import { sessionManager } from '../session'
import { videoProviderFromEnv } from './config'
import { CloudflareRealtime, IceServerCache } from './CloudflareRealtime'
import { MediaSignaling } from './MediaSignaling'
import { CONFIG_REFRESH_MS } from './protocol'

let instance: MediaSignaling | null = null

// Created on first use, after index.ts loaded the environment.
export function media(): MediaSignaling {
    if (instance) return instance
    const provider = videoProviderFromEnv(process.env)
    const api = provider.provider === 'cloudflare' ? new CloudflareRealtime(provider.credentials) : null
    const turn = api ? new IceServerCache(api) : null
    instance = new MediaSignaling({ provider: provider.provider, api, iceServers: () => turn ? turn.get() : Promise.resolve([]), getSession: uid => sessionManager.getPlayerSession(uid) })
    console.log(`Vídeo pelo provedor ${provider.provider}.`)
    if (api) setInterval(() => { void instance?.refreshConfig() }, CONFIG_REFRESH_MS).unref()
    return instance
}
