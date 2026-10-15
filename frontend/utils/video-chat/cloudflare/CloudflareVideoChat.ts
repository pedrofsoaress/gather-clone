import signal from '../../signal'
import { clampRemoteVolume, createWithDeviceFallback, defaultDeviceId, mediaErrorMessage, readMediaPreferences, resolveDevicePreference, saveMediaPreferences, type MediaPreferences } from '../AudioPreference'
import type { Layer, MediaChat, MediaConfig } from '../media-chat'
import type { CloudflareMediaConfig, MediaKind, PeersSnapshot, SignalingSocket } from './protocol'
import { CloudflareEngine, type EngineEvent, type EngineOptions, type MediaEngine } from './CloudflareEngine'
import { LayerRequests, LAYER_DEBOUNCE_MS } from './layers'
import { CloudflareRemoteUser, LocalPreview, RemoteAudio, RemoteVideo, SPEAKING_AUDIO_LEVEL, signature } from './remote-media'
import { currentOfficeSocket, officeSocket, pinnedOfficeSocket } from './socket'

const RECEIVE_ERROR = 'Não foi possível receber a mídia de um participante.'
// A track this page was sending could not go out again after a reconnect: that toggle is turned off.
const REPUBLISH_ERROR: Record<MediaKind, string> = {
    mic: 'Não foi possível reenviar seu microfone.',
    camera: 'Não foi possível reenviar sua câmera.',
    screen: 'Não foi possível reenviar sua tela.',
    speaker: 'Não foi possível reenviar o áudio da caixa de som.',
}
// Socket.IO does not reconnect these by itself: the office socket is over (leaving, a kick, or a new visit).
const FINAL_DISCONNECTS = ['io client disconnect', 'io server disconnect']
// The f layer; h and q are half and a quarter of it.
const CAMERA_CONSTRAINTS: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }

export type ChatDeps = {
    socket: SignalingSocket
    // Identity of the socket `socket` talks to now; a change means the office socket was replaced. Optional.
    socketTarget?: () => unknown
    // `socket` bound to the office socket of now, never following a replacement: each engine gets one, so its
    // handlers are removed from the socket they were added to. Without it, `socket` is used.
    pinSocket?: () => SignalingSocket
    createEngine: (options: EngineOptions) => MediaEngine
    setTimeout: (callback: () => void, ms: number) => unknown
    clearTimeout: (timer: unknown) => void
    mediaDevices?: Partial<Pick<MediaDevices, 'getUserMedia' | 'getDisplayMedia' | 'enumerateDevices' | 'addEventListener' | 'removeEventListener'>>
}

function browserDeps(): ChatDeps {
    return {
        socket: officeSocket(),
        socketTarget: currentOfficeSocket,
        pinSocket: pinnedOfficeSocket,
        createEngine: options => new CloudflareEngine(options),
        setTimeout: (callback, ms) => window.setTimeout(callback, ms),
        clearTimeout: timer => window.clearTimeout(timer as number),
        mediaDevices: typeof navigator === 'undefined' ? undefined : navigator.mediaDevices,
    }
}

// Same surface as the Agora class. The server decides what this page receives; it only sends and plays.
export class CloudflareVideoChat implements MediaChat {
    private readonly deps: ChatDeps
    // Replaced only when the office socket is: the engine's handlers live on the socket it was made with.
    private engine: MediaEngine
    private readonly users = new Map<string, CloudflareRemoteUser>()
    private readonly speakers = new Map<string, RemoteAudio>()
    private peers: PeersSnapshot | null = null
    private microphone: MediaStreamTrack | null = null
    private microphoneMuted = false
    private camera: MediaStreamTrack | null = null
    private screen: MediaStreamTrack | null = null
    private screenStarting = false
    private readonly screenPreviews = new Set<LocalPreview>()
    private readonly preview = new LocalPreview()
    private cameraElement: string | HTMLElement = 'local-video'
    private preferences: MediaPreferences | null = null
    private readonly remoteVolumes = new Map<string, number>()
    private readonly remoteMuted = new Set<string>()
    // Speaker tracks this page sends, by speaker object.
    private readonly speakerTracks = new Map<string, MediaStreamTrack>()
    private readonly layers: LayerRequests
    private readonly layerTimers = new Map<string, unknown>()
    private readonly sentLayers = new Map<string, Layer>()
    private deviceRefresh: Promise<MediaDeviceInfo[]> | null = null
    private stopMonitoring: (() => void) | null = null
    private lifecycle = 0
    private destroyed = false
    // The engine was stopped with its office socket; the next configure opens a new one.
    private detached = false
    private socketTarget: unknown = undefined
    // The office socket the current engine and its disconnect handler are on.
    private engineSocket!: SignalingSocket
    private onSocketDisconnect: (reason?: string) => void = () => {}

    constructor(config: CloudflareMediaConfig, deps: ChatDeps = browserDeps()) {
        this.deps = deps
        this.layers = new LayerRequests((uid, layer) => this.scheduleLayer(uid, layer))
        this.engine = this.openEngine()
        // Synchronously: a negotiation step sent right after mediaConfig must find the engine started.
        void this.engine.start(config)
    }

    // A new mediaConfig (the office socket rejoined): reopen both connections with the fresh ICE servers.
    public configure(config: MediaConfig): void {
        if (config.provider !== 'cloudflare' || this.destroyed) return
        if (this.detached || this.deps.socketTarget?.() !== this.socketTarget) return this.reopen(config)
        void this.engine.start(config)
    }

    // An engine bound to the office socket of now, with its own disconnect handler.
    private openEngine(): MediaEngine {
        const socket = this.deps.pinSocket?.() ?? this.deps.socket
        const engine: MediaEngine = this.deps.createEngine({
            socket,
            createPeerConnection: rtcConfig => new RTCPeerConnection(rtcConfig),
            setTimeout: this.deps.setTimeout,
            clearTimeout: this.deps.clearTimeout,
            // A replaced engine speaks no more.
            onEvent: event => { if (engine === this.engine) this.onEngineEvent(event) },
        })
        this.socketTarget = this.deps.socketTarget?.()
        this.engineSocket = socket
        this.onSocketDisconnect = (reason?: string) => {
            if (engine !== this.engine) return
            if (reason && FINAL_DISCONNECTS.includes(reason)) this.retire()
            else engine.suspend()
        }
        socket.on('disconnect', this.onSocketDisconnect)
        return engine
    }

    // The office socket is over: stop the engine now, while `officeSocket()` still reaches the socket its handlers
    // are on. Everything the server held for this page went with that socket.
    private retire(): void {
        if (this.detached) return
        this.detached = true
        this.engine.stop()
        this.engineSocket.off('disconnect', this.onSocketDisconnect)
        this.dropScreen()
        this.applyPeers(null)
        for (const timer of this.layerTimers.values()) this.deps.clearTimeout(timer)
        this.layerTimers.clear()
        this.sentLayers.clear()
        this.syncSpeakers()
        for (const [objectId, track] of [...this.speakerTracks]) {
            this.speakerTracks.delete(objectId)
            track.stop()
            signal.emit('speaker-publish-failed', { objectId })
        }
    }

    // A new office socket (a new visit, or this chat was made on the old one): a new engine, started at once, and
    // the microphone and camera this page still has go out again.
    private reopen(config: CloudflareMediaConfig): void {
        this.retire()
        this.detached = false
        this.engine = this.openEngine()
        void this.engine.start(config)
        if (this.microphone && !this.microphoneMuted) this.republish('mic', this.microphone)
        if (this.camera) this.republish('camera', this.camera)
    }

    private republish(kind: 'mic' | 'camera', track: MediaStreamTrack): void {
        const engine = this.engine
        engine.resume(kind, track).catch(() => {
            const current = kind === 'mic' ? this.microphone : this.camera
            if (engine === this.engine && current === track) this.onPublishFailed(kind)
        })
    }

    private onEngineEvent = (event: EngineEvent) => {
        if (event.type === 'peers') return this.applyPeers(event.peers)
        if (event.type === 'tracks') { this.syncRemote(); this.syncSpeakers(); return }
        if (event.type === 'track-error') { signal.emit('officeFeedback', { message: RECEIVE_ERROR }); return }
        if (event.type === 'reconnect-notice') { signal.emit('officeNotice', { message: 'Reconectando o vídeo...', key: 'video-reconnecting' }); return }
        if (event.type === 'reconnected') return this.resendLayers()
        if (event.type === 'publish-failed') this.onPublishFailed(event.kind, event.objectId)
    }

    private applyPeers(peers: PeersSnapshot | null): void {
        const left = Boolean(this.peers?.conversation) && !peers?.conversation
        this.peers = peers
        this.syncRemote()
        if (left) {
            if (this.screen) void this.stopScreenShare()
            signal.emit('video-channel-left')
        }
    }

    // The engine forgot a track it could not publish again: this page stops sending it and says so.
    private onPublishFailed(kind: MediaKind, objectId?: string): void {
        if (kind === 'mic') {
            const track = this.microphone
            if (!track) return
            this.microphone = null
            this.microphoneMuted = false
            track.stop()
            signal.emit('local-microphone-changed', true)
        } else if (kind === 'camera') {
            const track = this.camera
            if (!track) return
            this.camera = null
            this.preview.stop()
            track.stop()
            signal.emit('local-camera-changed', true)
        } else if (kind === 'screen') {
            if (!this.dropScreen()) return
        } else {
            const track = objectId === undefined ? undefined : this.speakerTracks.get(objectId)
            if (!track) return
            this.speakerTracks.delete(objectId!)
            track.stop()
            // The speaker's owner (SpatialAudio) ends its publication.
            signal.emit('speaker-publish-failed', { objectId })
        }
        signal.emit('officeFeedback', { message: REPUBLISH_ERROR[kind] })
    }

    // Brings the remote users (tiles) in line with the server's roster and the tracks received now.
    private syncRemote(): void {
        const peers = this.peers
        const wanted = new Map<string, { hasAudio: boolean, hasVideo: boolean, kind: MediaKind | null, from: string }>()
        if (peers?.conversation) {
            for (const peer of peers.peers) {
                wanted.set(peer.uid, { hasAudio: peer.mic, hasVideo: peer.camera, kind: 'camera', from: peer.uid })
                if (peer.screen) wanted.set(`${peer.uid}-screen`, { hasAudio: false, hasVideo: true, kind: 'screen', from: peer.uid })
            }
            // Your own screen tile plays the local track (showScreenPreview); nothing is received for it.
            if (peers.ownScreen) wanted.set(`${peers.self}-screen`, { hasAudio: false, hasVideo: true, kind: null, from: peers.self })
        }
        for (const [id, user] of [...this.users]) {
            if (wanted.has(id)) continue
            user.videoTrack?.stop()
            user.audioTrack?.stop()
            this.users.delete(id)
            signal.emit('user-left', user)
        }
        for (const [id, want] of wanted) {
            let user = this.users.get(id)
            const created = !user
            if (!user) { user = new CloudflareRemoteUser(id); this.users.set(id, user) }
            const before = signature(user)
            user.hasAudio = want.hasAudio
            user.hasVideo = want.hasVideo
            const video = want.kind ? this.engine.remoteTrack(want.from, want.kind) : null
            if (!video) { user.videoTrack?.stop(); user.videoTrack = undefined }
            else if (!user.videoTrack) user.videoTrack = new RemoteVideo(video)
            else user.videoTrack.setTrack(video)
            if (want.kind === 'camera') {
                const audio = this.engine.remoteTrack(want.from, 'mic')
                if (!audio) { user.audioTrack?.stop(); user.audioTrack = undefined }
                else if (user.audioTrack?.track !== audio) {
                    user.audioTrack?.stop()
                    user.audioTrack = new RemoteAudio(audio, this.engine.receiver(want.from, 'mic'))
                    this.applyAudio(id)
                    user.audioTrack.play()
                }
            }
            if (created || signature(user) !== before) signal.emit('user-info-updated', user)
        }
    }

    private syncSpeakers(): void {
        let changed = false
        const ids = new Set(this.detached ? [] : this.engine.remoteSpeakers())
        for (const [id, audio] of [...this.speakers]) {
            const track = this.detached ? null : this.engine.remoteTrack(null, 'speaker', id)
            if (ids.has(id) && track === audio.track) continue
            audio.stop()
            this.speakers.delete(id)
            changed = true
        }
        for (const id of ids) {
            if (this.speakers.has(id)) continue
            const track = this.engine.remoteTrack(null, 'speaker', id)
            if (!track) continue
            // Silent until SpatialAudio applies the volume of this person's position.
            const audio = new RemoteAudio(track, this.engine.receiver(null, 'speaker', id))
            audio.setVolume(0)
            if (this.outputSupported) void audio.setPlaybackDevice(this.getPreferences().outputId || 'default').catch(() => {})
            audio.play()
            this.speakers.set(id, audio)
            changed = true
        }
        if (changed) signal.emit('remote-speakers-changed')
    }

    public speakerAudio(objectId: string): RemoteAudio | null { return this.speakers.get(objectId) ?? null }

    public async publishSpeaker(objectId: string, track: MediaStreamTrack): Promise<void> {
        this.speakerTracks.set(objectId, track)
        try { await this.engine.publish('speaker', track, objectId) } catch (error) {
            if (this.speakerTracks.get(objectId) === track) this.speakerTracks.delete(objectId)
            throw error
        }
    }

    public unpublishSpeaker(objectId: string): Promise<void> {
        this.speakerTracks.delete(objectId)
        return this.engine.unpublish('speaker', objectId)
    }

    public requestLayer(uid: string, layer: Layer): () => void { return this.layers.request(uid, layer) }

    private scheduleLayer(uid: string, layer: Layer): void {
        const timer = this.layerTimers.get(uid)
        if (timer) this.deps.clearTimeout(timer)
        this.layerTimers.set(uid, this.deps.setTimeout(() => {
            this.layerTimers.delete(uid)
            if ((this.sentLayers.get(uid) ?? 'q') === layer) return
            this.sentLayers.set(uid, layer)
            void this.engineSocket.request('mediaLayer', { fromUid: uid, layer }).catch(() => {})
        }, LAYER_DEBOUNCE_MS))
    }

    // After a reconnect the server starts from q again: repeat what the tiles ask for.
    private resendLayers(): void {
        this.sentLayers.clear()
        for (const uid of this.users.keys()) {
            const layer = this.layers.current(uid)
            if (layer && layer !== 'q') this.scheduleLayer(uid, layer)
        }
    }

    public isVideoSubscribed(uid: string): boolean { return Boolean(this.users.get(uid)?.videoTrack) }

    public getRemoteAudio(uid: string): { muted: boolean, volume: number, speaking: boolean } {
        const user = this.users.get(uid)
        const audio = user?.audioTrack
        // A muted person is never speaking, whatever level the browser still reports.
        return { muted: this.remoteMuted.has(uid), volume: this.remoteVolumes.get(uid) ?? 100, speaking: Boolean(user?.hasAudio && audio && audio.getVolumeLevel() > SPEAKING_AUDIO_LEVEL) }
    }

    public setRemoteMuted(uid: string, muted: boolean): void {
        if (muted) this.remoteMuted.add(uid)
        else this.remoteMuted.delete(uid)
        this.applyAudio(uid)
        signal.emit('remote-audio-preference-changed', uid)
    }

    public setRemoteVolume(uid: string, volume: number): void {
        this.remoteVolumes.set(uid, clampRemoteVolume(volume))
        this.applyAudio(uid)
        signal.emit('remote-audio-preference-changed', uid)
    }

    private applyAudio(uid: string): void {
        const audio = this.users.get(uid)?.audioTrack
        if (!audio) return
        audio.setVolume(this.remoteMuted.has(uid) ? 0 : this.remoteVolumes.get(uid) ?? 100)
        if (this.outputSupported) void audio.setPlaybackDevice(this.getPreferences().outputId || 'default').catch(() => {})
    }

    private applyAllAudio(): void {
        for (const uid of this.users.keys()) this.applyAudio(uid)
        const output = this.getPreferences().outputId || 'default'
        if (this.outputSupported) for (const audio of this.speakers.values()) void audio.setPlaybackDevice(output).catch(() => {})
    }

    public get outputSupported(): boolean { return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype }

    private async capture(kind: 'audioinput' | 'videoinput', deviceId: string): Promise<MediaStreamTrack> {
        const devices = this.deps.mediaDevices
        if (!devices?.getUserMedia) throw new Error('Este navegador não permite usar câmera e microfone.')
        const exact = deviceId ? { deviceId: { exact: deviceId } } : {}
        const stream = kind === 'videoinput'
            ? await devices.getUserMedia({ video: { ...CAMERA_CONSTRAINTS, ...exact } })
            : await devices.getUserMedia({ audio: { ...exact, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
        const track = (kind === 'videoinput' ? stream.getVideoTracks() : stream.getAudioTracks())[0]
        if (!track) throw Object.assign(new Error('Nenhum dispositivo disponível.'), { name: 'NotFoundError' })
        return track
    }

    public async toggleCamera(): Promise<boolean> {
        if (this.camera) { await this.cameraOff(); return true }
        const lifecycle = this.lifecycle
        const devices = await this.listDevices()
        if (lifecycle !== this.lifecycle) throw new Error('A chamada foi encerrada.')
        const { track, deviceId } = await createWithDeviceFallback(this.getPreferences().cameraId, 'videoinput', devices, id => this.capture('videoinput', id))
        if (lifecycle !== this.lifecycle) { track.stop(); throw new Error('A chamada foi encerrada.') }
        this.camera = track
        this.preview.play(this.cameraElement, track)
        this.savePreferences({ cameraId: deviceId })
        try { await this.engine.resume('camera', track) } catch (error) { await this.cameraOff(); throw error }
        return false
    }

    // Off means nothing is sent and the camera light goes off.
    private async cameraOff(): Promise<void> {
        const track = this.camera
        if (!track) return
        this.camera = null
        this.preview.stop()
        await this.engine.pause('camera').catch(() => {})
        track.stop()
    }

    public async turnOffCamera(): Promise<boolean> {
        if (!this.camera) return false
        await this.cameraOff()
        return true
    }

    public async toggleMicrophone(): Promise<boolean> {
        if (this.microphone && !this.microphoneMuted) {
            this.microphoneMuted = true
            await this.engine.pause('mic').catch(() => {})
            return true
        }
        if (this.microphone) {
            await this.engine.resume('mic', this.microphone)
            this.microphoneMuted = false
            return false
        }
        const lifecycle = this.lifecycle
        const devices = await this.listDevices()
        if (lifecycle !== this.lifecycle) throw new Error('A chamada foi encerrada.')
        const { track, deviceId } = await createWithDeviceFallback(this.getPreferences().microphoneId, 'audioinput', devices, id => this.capture('audioinput', id))
        if (lifecycle !== this.lifecycle) { track.stop(); throw new Error('A chamada foi encerrada.') }
        this.microphone = track
        this.microphoneMuted = false
        this.savePreferences({ microphoneId: deviceId })
        try { await this.engine.resume('mic', track) } catch (error) {
            if (this.microphone === track) this.microphone = null
            track.stop()
            throw error
        }
        return false
    }

    public isMicrophoneMuted(): boolean { return !this.microphone || this.microphoneMuted }

    public async muteMicrophone(): Promise<boolean> {
        if (!this.microphone || this.microphoneMuted) return false
        this.microphoneMuted = true
        await this.engine.pause('mic').catch(() => {})
        return true
    }

    private getPreferences(): MediaPreferences {
        if (!this.preferences) this.preferences = readMediaPreferences()
        return this.preferences
    }

    public getDevicePreferences(): MediaPreferences { return { ...this.getPreferences() } }

    private savePreferences(patch: Partial<MediaPreferences>): void {
        this.preferences = { ...this.getPreferences(), ...patch }
        saveMediaPreferences(this.preferences)
        signal.emit('media-preferences-changed', this.getDevicePreferences())
    }

    public startDeviceMonitoring(): () => void {
        this.stopMonitoring?.()
        const onChange = async () => {
            try { await this.listDevices() } catch (error) { signal.emit('officeFeedback', { message: mediaErrorMessage(error, 'dispositivo') }) }
        }
        this.deps.mediaDevices?.addEventListener?.('devicechange', onChange)
        const stop = () => {
            this.deps.mediaDevices?.removeEventListener?.('devicechange', onChange)
            if (this.stopMonitoring === stop) this.stopMonitoring = null
        }
        this.stopMonitoring = stop
        return stop
    }

    public listDevices(): Promise<MediaDeviceInfo[]> {
        if (!this.deviceRefresh) this.deviceRefresh = this.refreshDevices().finally(() => { this.deviceRefresh = null })
        return this.deviceRefresh
    }

    // Same rules as the Agora version: a device that disappeared is swapped for the default one, or turned off.
    private async refreshDevices(): Promise<MediaDeviceInfo[]> {
        if (!this.deps.mediaDevices?.enumerateDevices) throw new Error('Este navegador não permite listar dispositivos de mídia.')
        const devices = await this.deps.mediaDevices.enumerateDevices()
        const preferences = this.getPreferences()
        const next = {
            microphoneId: resolveDevicePreference(preferences.microphoneId, 'audioinput', devices),
            cameraId: resolveDevicePreference(preferences.cameraId, 'videoinput', devices),
            outputId: resolveDevicePreference(preferences.outputId, 'audiooutput', devices),
        }
        const gone = (track: MediaStreamTrack, kind: 'audioinput' | 'videoinput') => {
            const id = track.getSettings().deviceId
            return track.readyState === 'ended' || Boolean(id && !devices.some(device => device.kind === kind && device.deviceId === id))
        }
        if (this.microphone && ((preferences.microphoneId && !next.microphoneId) || gone(this.microphone, 'audioinput'))) {
            const replacement = defaultDeviceId('audioinput', devices)
            try {
                if (!replacement) throw new Error('Nenhum microfone está conectado. Conecte um dispositivo e ative o microfone novamente.')
                await this.switchDevice('audioinput', replacement)
            } catch (error) {
                const track = this.microphone
                this.microphone = null
                this.microphoneMuted = false
                await this.engine.unpublish('mic').catch(() => {})
                track?.stop()
                signal.emit('local-microphone-changed', true)
                signal.emit('officeFeedback', { message: mediaErrorMessage(error, 'microfone') })
            }
        }
        if (this.camera && ((preferences.cameraId && !next.cameraId) || gone(this.camera, 'videoinput'))) {
            const replacement = defaultDeviceId('videoinput', devices)
            try {
                if (!replacement) throw new Error('Nenhuma câmera está conectada. Conecte um dispositivo e ative a câmera novamente.')
                await this.switchDevice('videoinput', replacement)
            } catch (error) {
                const track = this.camera
                this.camera = null
                this.preview.stop()
                await this.engine.unpublish('camera').catch(() => {})
                track?.stop()
                signal.emit('local-camera-changed', true)
                signal.emit('officeFeedback', { message: mediaErrorMessage(error, 'câmera') })
            }
        }
        if (JSON.stringify(preferences) !== JSON.stringify(next)) this.savePreferences(next)
        if (preferences.outputId && !next.outputId) this.applyAllAudio()
        signal.emit('media-devices-changed', devices)
        return devices
    }

    // Captures `deviceId` and swaps it into the publication without renegotiating. If, while the device opened, the
    // call ended, that kind was turned off or its track was replaced, the new track is closed and nothing changes.
    private async switchDevice(kind: 'audioinput' | 'videoinput', deviceId: string): Promise<void> {
        const lifecycle = this.lifecycle
        const current = () => kind === 'audioinput' ? this.microphone : this.camera
        const old = current()
        const track = await this.capture(kind, deviceId)
        if (lifecycle !== this.lifecycle || !old || current() !== old) { track.stop(); return }
        try {
            if (kind === 'audioinput') {
                this.microphone = track
                await this.engine.replaceTrack('mic', track)
            } else {
                this.camera = track
                this.preview.play(this.cameraElement, track)
                await this.engine.replaceTrack('camera', track)
            }
        } finally { old.stop() }
    }

    public async selectMicrophone(deviceId: string): Promise<void> {
        const devices = await this.listDevices()
        if (deviceId && resolveDevicePreference(deviceId, 'audioinput', devices) !== deviceId) throw new Error('Microfone indisponível.')
        if (this.microphone) {
            const selected = deviceId || defaultDeviceId('audioinput', devices)
            if (!selected) throw new Error('Nenhum microfone disponível.')
            await this.switchDevice('audioinput', selected)
        }
        this.savePreferences({ microphoneId: deviceId })
    }

    public async selectCamera(deviceId: string): Promise<void> {
        const devices = await this.listDevices()
        if (deviceId && resolveDevicePreference(deviceId, 'videoinput', devices) !== deviceId) throw new Error('Câmera indisponível.')
        if (this.camera) {
            const selected = deviceId || defaultDeviceId('videoinput', devices)
            if (!selected) throw new Error('Nenhuma câmera disponível.')
            await this.switchDevice('videoinput', selected)
        }
        this.savePreferences({ cameraId: deviceId })
    }

    public async selectOutput(deviceId: string): Promise<void> {
        if (!this.outputSupported) throw new Error('Seu navegador não oferece seleção de saída de áudio.')
        const devices = await this.listDevices()
        if (deviceId && resolveDevicePreference(deviceId, 'audiooutput', devices) !== deviceId) throw new Error('Saída de áudio indisponível.')
        // Saved only once the audio really moved there.
        for (const user of this.users.values()) if (user.audioTrack) await user.audioTrack.setPlaybackDevice(deviceId || 'default')
        for (const audio of this.speakers.values()) await audio.setPlaybackDevice(deviceId || 'default')
        this.savePreferences({ outputId: deviceId })
    }

    public playVideoTrackAtElementId(elementId: string | HTMLElement): void {
        this.cameraElement = elementId
        if (this.camera) this.preview.play(elementId, this.camera)
    }

    public showCameraIn(element: HTMLElement): () => void {
        const previous = this.cameraElement
        this.playVideoTrackAtElementId(element)
        return () => { if (this.cameraElement === element) this.playVideoTrackAtElementId(previous) }
    }

    public get isConnected(): boolean { return !this.detached && this.engine.connected && Boolean(this.peers?.conversation) }

    // Receiving is decided by the server: the channel calls only exist for the Agora path.
    public rememberToken(): void {}
    public async joinChannel(): Promise<void> {}
    public async leaveChannel(): Promise<void> {}

    public async startScreenShare(): Promise<void> {
        if (this.screen || this.screenStarting) return
        if (!this.isConnected) throw new Error('Aproxime-se de alguém para iniciar uma chamada antes de compartilhar a tela.')
        this.screenStarting = true
        const lifecycle = this.lifecycle
        const engine = this.engine
        let stream: MediaStream | undefined
        let published = false
        try {
            const Controller = (window as Window & { CaptureController?: new () => { setFocusBehavior: (behavior: 'no-focus-change') => void } }).CaptureController
            const controller = Controller ? new Controller() : undefined
            controller?.setFocusBehavior('no-focus-change')
            if (!this.deps.mediaDevices?.getDisplayMedia) throw new Error('Este navegador não permite compartilhar a tela.')
            stream = await this.deps.mediaDevices.getDisplayMedia({ video: true, audio: false, ...(controller ? { controller } : {}) } as DisplayMediaStreamOptions)
            if (lifecycle !== this.lifecycle || engine !== this.engine || !this.isConnected) throw new Error('Compartilhamento cancelado.')
            const track = stream.getVideoTracks()[0]
            if (!track) throw new Error('Nenhuma tela foi selecionada para compartilhar.')
            track.contentHint = 'detail'
            await engine.publish('screen', track)
            published = true
            // The call ended, the engine was replaced or the conversation ended while the server accepted it.
            if (lifecycle !== this.lifecycle || engine !== this.engine || !this.isConnected) throw new Error('Compartilhamento cancelado.')
            this.screen = track
            track.addEventListener('ended', () => { if (this.screen === track) void this.stopScreenShare() }, { once: true })
            signal.emit('screen-share-changed', true)
        } catch (error) {
            stream?.getTracks().forEach(track => track.stop())
            if (published) await engine.unpublish('screen').catch(() => {})
            throw error
        } finally { this.screenStarting = false }
    }

    // The sharer's own screen tile plays the local track; receiving it back would be billed.
    public showScreenPreview(element: string | HTMLElement): () => void {
        const track = this.screen
        if (!track) return () => {}
        const preview = new LocalPreview()
        preview.play(element, track, { fit: 'contain', mirror: false })
        this.screenPreviews.add(preview)
        return () => { preview.stop(); this.screenPreviews.delete(preview) }
    }

    public async stopScreenShare(): Promise<void> {
        const track = this.screen
        if (!track) return
        this.dropScreen()
        await this.engine.unpublish('screen').catch(() => {})
    }

    // Ends the local share: the track, its previews and the button. Says whether there was one.
    private dropScreen(): boolean {
        const track = this.screen
        if (!track) return false
        this.screen = null
        for (const preview of this.screenPreviews) preview.stop()
        this.screenPreviews.clear()
        track.stop()
        signal.emit('screen-share-changed', false)
        return true
    }

    public destroy(): void {
        if (this.destroyed) return
        this.destroyed = true
        this.lifecycle++
        this.engine.stop()
        this.engineSocket.off('disconnect', this.onSocketDisconnect)
        this.stopMonitoring?.()
        this.layers.clear()
        for (const timer of this.layerTimers.values()) this.deps.clearTimeout(timer)
        this.layerTimers.clear()
        this.sentLayers.clear()
        this.preview.stop()
        this.camera?.stop()
        this.microphone?.stop()
        this.camera = null
        this.microphone = null
        this.microphoneMuted = false
        this.dropScreen()
        this.speakerTracks.clear()
        for (const user of this.users.values()) { user.videoTrack?.stop(); user.audioTrack?.stop() }
        this.users.clear()
        for (const audio of this.speakers.values()) audio.stop()
        this.speakers.clear()
        this.peers = null
        this.cameraElement = 'local-video'
        signal.emit('reset-users')
    }
}
