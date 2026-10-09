import AgoraRTC, { type IAgoraRTCClient, type ILocalAudioTrack, type IRemoteAudioTrack } from 'agora-rtc-sdk-ng'
import { server } from '../backend/server'
import signal from '../signal'
import { generateSpeakerToken } from './generateToken'
import { videoChat } from './video-chat'

export type SpeakerSnapshot = Record<string, { ownerUid: string, channel: string, volume: number }>
type Listener = { client: IAgoraRTCClient, channel: string, track?: IRemoteAudioTrack, cancelled: boolean }
type Publication = { objectId: string, client: IAgoraRTCClient, stream: MediaStream, track?: ILocalAudioTrack, cancelled: boolean, authorized: boolean, reservationRequested: boolean, reservationReleased: boolean }
export type SpeakerSource = 'tab' | 'microphone'

function command(event: string, objectId: string): Promise<void> {
    return new Promise((resolve, reject) => server.socket.timeout(8000).emit(event, { objectId }, (timeout: Error | null, result: { ok: boolean, error?: string }) => {
        if (timeout || !result?.ok) reject(new Error(result?.error ?? 'Não foi possível atualizar a caixa de som.'))
        else resolve()
    }))
}

class SpatialAudio {
    private snapshot: SpeakerSnapshot = {}
    private readonly listeners = new Map<string, Listener>()
    private publication: Publication | null = null
    private capturing = false
    private captureVersion = 0
    public muted = false

    public update(snapshot: SpeakerSnapshot, uid: string) {
        this.snapshot = snapshot
        if (this.publication?.authorized && snapshot[this.publication.objectId]?.ownerUid !== uid) void this.stop(false)
        for (const [id, listener] of this.listeners) {
            const state = snapshot[id]
            if (!state || state.volume <= 0 || state.channel !== listener.channel || state.ownerUid === uid) this.removeListener(id, listener)
            else listener.track?.setVolume(this.muted ? 0 : state.volume)
        }
        for (const [id, state] of Object.entries(snapshot)) {
            if (state.volume > 0 && state.ownerUid !== uid && !this.listeners.has(id)) void this.listen(id, state)
        }
        signal.emit('officeSpeakerState', snapshot)
    }

    private async listen(id: string, state: SpeakerSnapshot[string]) {
        const client = AgoraRTC.createClient({ codec: 'vp8', mode: 'rtc' })
        const listener: Listener = { client, channel: state.channel, cancelled: false }
        this.listeners.set(id, listener)
        client.on('user-published', async (user, mediaType) => {
            if (mediaType !== 'audio' || user.uid !== `${state.ownerUid}-speaker` || listener.cancelled) return
            try {
                await client.subscribe(user, 'audio')
                if (listener.cancelled) return
                listener.track = user.audioTrack
                listener.track?.setVolume(this.muted ? 0 : this.snapshot[id]?.volume ?? 0)
                listener.track?.play()
                if (videoChat.outputSupported) await listener.track?.setPlaybackDevice(videoChat.getDevicePreferences().outputId || 'default').catch(() => {})
            } catch { if (!listener.cancelled) signal.emit('officeNotice', { message: 'Não foi possível ouvir a caixa de som.', kind: 'error', key: `speaker-${id}` }) }
        })
        client.on('user-unpublished', () => listener.track?.stop())
        client.on('token-privilege-will-expire', async () => {
            const token = await generateSpeakerToken(id, false).catch(() => null)
            if (token && !listener.cancelled && token.channel === listener.channel) await client.renewToken(token.token).catch(() => this.removeListener(id, listener))
            else this.removeListener(id, listener)
        })
        try {
            const authorization = await generateSpeakerToken(id, false)
            if (!authorization || authorization.channel !== state.channel) throw new Error('Fora da área.')
            if (listener.cancelled) return
            await client.join(process.env.NEXT_PUBLIC_AGORA_APP_ID!, authorization.channel, authorization.token, authorization.uid)
            if (listener.cancelled) await client.leave().catch(() => {})
        } catch {
            this.removeListener(id, listener)
        }
    }

    private removeListener(id: string, listener: Listener) {
        listener.cancelled = true
        listener.track?.stop()
        if (this.listeners.get(id) === listener) this.listeners.delete(id)
        if (listener.client.connectionState !== 'DISCONNECTED') void listener.client.leave().catch(() => {})
    }

    public async start(objectId: string, source: SpeakerSource = 'tab') {
        if (this.publication || this.capturing) throw new Error('Encerre o áudio atual antes de iniciar outro.')
        this.capturing = true
        const version = this.captureVersion
        let stream: MediaStream | undefined
        let publication: Publication | undefined
        try {
            if (source === 'microphone') {
                const microphoneId = videoChat.getDevicePreferences().microphoneId
                stream = await navigator.mediaDevices.getUserMedia({ audio: {
                    ...(microphoneId ? { deviceId: { ideal: microphoneId } } : {}),
                    echoCancellation: true, noiseSuppression: true, autoGainControl: true,
                } }).catch(() => { throw new Error('Permita o microfone no navegador para falar para a sala.') })
            } else {
                const Controller = (window as Window & { CaptureController?: new () => { setFocusBehavior: (behavior: 'no-focus-change') => void } }).CaptureController
                const controller = Controller ? new Controller() : undefined
                controller?.setFocusBehavior('no-focus-change')
                stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, ...(controller ? { controller } : {}) } as DisplayMediaStreamOptions)
            }
            if (version !== this.captureVersion) throw new Error('Compartilhamento cancelado ao sair do escritório.')
            const audio = stream.getAudioTracks()[0]
            if (!audio) throw new Error(source === 'microphone' ? 'Permita o microfone no navegador para falar para a sala.' : 'Escolha uma aba e marque “Compartilhar áudio” no navegador.')
            const client = AgoraRTC.createClient({ codec: 'vp8', mode: 'rtc' })
            const current: Publication = { objectId, client, stream, cancelled: false, authorized: false, reservationRequested: true, reservationReleased: false }
            publication = current
            this.publication = current
            for (const track of stream.getTracks()) track.addEventListener('ended', () => { void this.stopPublication(current, true) }, { once: true })
            await command('speakerStart', objectId)
            current.authorized = true
            if (current.cancelled) throw new Error('Compartilhamento cancelado.')
            const authorization = await generateSpeakerToken(objectId, true)
            if (!authorization || current.cancelled) throw new Error('A caixa de som ficou indisponível.')
            await client.join(process.env.NEXT_PUBLIC_AGORA_APP_ID!, authorization.channel, authorization.token, authorization.uid)
            if (current.cancelled) throw new Error('Compartilhamento cancelado.')
            current.track = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: audio })
            await client.publish(current.track)
            if (current.cancelled) throw new Error('Compartilhamento cancelado.')
            client.on('token-privilege-will-expire', async () => {
                const next = await generateSpeakerToken(objectId, true).catch(() => null)
                if (next && !current.cancelled && next.channel === authorization.channel) await client.renewToken(next.token).catch(() => this.stopPublication(current, true))
                else await this.stopPublication(current, true)
            })
            signal.emit('officeNotice', { message: source === 'microphone' ? 'Seu microfone está aberto para a sala toda.' : 'Áudio da aba tocando perto da caixa de som.', key: 'speaker-start' })
        } catch (error) {
            stream?.getTracks().forEach(track => track.stop())
            if (publication) await this.stopPublication(publication, true)
            throw error
        } finally { this.capturing = false }
    }

    public async stop(notifyServer = true) {
        const publication = this.publication
        if (!publication) return
        await this.stopPublication(publication, notifyServer)
    }

    private async stopPublication(publication: Publication, notifyServer: boolean) {
        if (this.publication === publication) this.publication = null
        publication.cancelled = true
        publication.stream.getTracks().forEach(track => track.stop())
        publication.track?.close()
        publication.track = undefined
        if (publication.client.connectionState !== 'DISCONNECTED') await publication.client.leave().catch(() => {})
        // Start and stop are ordered socket commands. Even a lost/late start ack
        // must release its claim; cleanup is bound to this capture, never a newer one.
        if (notifyServer && publication.reservationRequested && !publication.reservationReleased) {
            publication.reservationReleased = true
            await command('speakerStop', publication.objectId).catch(() => {})
        }
    }

    public setMuted(muted: boolean) {
        this.muted = muted
        for (const [id, listener] of this.listeners) listener.track?.setVolume(muted ? 0 : this.snapshot[id]?.volume ?? 0)
        signal.emit('speakerMuted', muted)
    }

    public refreshOutput() {
        if (!videoChat.outputSupported) return
        for (const listener of this.listeners.values()) void listener.track?.setPlaybackDevice(videoChat.getDevicePreferences().outputId || 'default').catch(() => {})
    }

    public destroy() {
        this.captureVersion++
        void this.stop(false)
        for (const [id, listener] of this.listeners) this.removeListener(id, listener)
        this.snapshot = {}
        signal.emit('officeSpeakerState', {})
    }
}

export const spatialAudio = new SpatialAudio()
