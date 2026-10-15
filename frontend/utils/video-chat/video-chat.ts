import signal from '../signal'
import { AgoraVideoChat } from './agora-video-chat'
import { CloudflareVideoChat } from './cloudflare/CloudflareVideoChat'
import type { Layer, MediaChat, MediaConfig, MediaProvider } from './media-chat'
import type { CloudflareMediaConfig } from './cloudflare/protocol'
import { readMediaPreferences, type MediaPreferences } from './AudioPreference'
import type { ChannelArea } from './subscription-policy'

export type { MediaRemoteUser } from './media-chat'

type Factories = { agora: () => MediaChat, cloudflare: (config: CloudflareMediaConfig) => MediaChat }
type JoinArgs = [channel: string, uid: string, realmId: string, roomIndex: number, area: ChannelArea | null]

// The screen talks to `videoChat`; the server's mediaConfig decides whether Agora or Cloudflare is behind it.
export class VideoChatRouter implements MediaChat {
    private readonly factories: Factories
    private impl: MediaChat | null = null
    // One Agora chat per page, as before the router: it is reusable after destroy and keeps its pushed-token state.
    private agora: MediaChat | null = null
    private current: MediaProvider = 'agora'
    private lastConfig: CloudflareMediaConfig | null = null
    private cameraElement: string | HTMLElement = 'local-video'
    private monitoring = false
    // Bumped by every startDeviceMonitoring: an older stopper no longer stops anything.
    private monitorSession = 0
    private stopImpl: (() => void) | null = null
    // The conversation the office asked for last; a provider switch joins it again on the new chat.
    private joined: JoinArgs | null = null
    // A Cloudflare chat was destroyed (the office was left): until the next mediaConfig, reads are answered without
    // making a chat on the old config. Only an action from the person makes one.
    private awaitingConfig = false

    constructor(factories: Factories) {
        this.factories = factories
        // Synchronous on purpose: the Cloudflare engine must be started before the server's next negotiation step.
        signal.on('mediaConfig', (config: MediaConfig) => this.useProvider(config))
    }

    get provider(): MediaProvider { return this.current }

    private get chat(): MediaChat {
        if (!this.impl) {
            const waited = this.awaitingConfig
            this.awaitingConfig = false
            this.impl = this.current === 'cloudflare' && this.lastConfig ? this.factories.cloudflare(this.lastConfig) : this.agora ??= this.factories.agora()
            // An action made it before the fresh config: it gets the preview element and monitoring the page asked for meanwhile.
            if (waited) {
                this.impl.playVideoTrackAtElementId(this.cameraElement)
                if (this.monitoring) this.stopImpl = this.impl.startDeviceMonitoring()
            }
        }
        return this.impl
    }

    // The chat when there is one to ask, or null while waiting for a fresh mediaConfig after destroy.
    private get existing(): MediaChat | null { return this.impl ?? (this.awaitingConfig ? null : this.chat) }

    useProvider(config: MediaConfig): void {
        if (config.provider === 'cloudflare') this.lastConfig = config
        this.awaitingConfig = false
        if (config.provider === this.current && this.impl) { this.impl.configure(config); return }
        const switched = config.provider !== this.current
        // The old provider is fully stopped before the new one exists: the office never runs both.
        const previous = this.impl
        this.impl = null
        this.stopImpl = null
        this.current = config.provider
        if (previous) {
            previous.destroy()
            // The camera and microphone of the old provider are gone: the buttons go back to off.
            signal.emit('local-camera-changed', true)
            signal.emit('local-microphone-changed', true)
        }
        const next = this.chat
        next.playVideoTrackAtElementId(this.cameraElement)
        if (this.monitoring) this.stopImpl = next.startDeviceMonitoring()
        // People stay in their conversation through a switch (a rollback to Agora mid-session included): the Player
        // only joins when the channel changes, so the router joins the new chat itself.
        if (previous && this.joined) void next.joinChannel(...this.joined).catch(() => {})
        // Told only on a real switch, once the new chat answers: what lives outside the chat (the speakers in
        // SpatialAudio) moves to the new provider without depending on the order of mediaConfig handlers.
        if (switched) signal.emit('video-provider-changed', { provider: this.current })
    }

    toggleCamera(): Promise<boolean> { return this.chat.toggleCamera() }
    toggleMicrophone(): Promise<boolean> { return this.chat.toggleMicrophone() }
    isMicrophoneMuted(): boolean { return this.existing?.isMicrophoneMuted() ?? true }
    // Forced mutes never turn anything on: without a chat nothing is on, so there is nothing to make.
    muteMicrophone(): Promise<boolean> { return this.existing?.muteMicrophone() ?? Promise.resolve(false) }
    turnOffCamera(): Promise<boolean> { return this.existing?.turnOffCamera() ?? Promise.resolve(false) }
    getDevicePreferences(): MediaPreferences { return this.existing?.getDevicePreferences() ?? readMediaPreferences() }
    startDeviceMonitoring(): () => void {
        this.stopImpl?.()
        const session = ++this.monitorSession
        this.monitoring = true
        // While waiting for a fresh config, the chat made by it starts monitoring (useProvider).
        this.stopImpl = this.existing?.startDeviceMonitoring() ?? null
        return () => {
            if (session !== this.monitorSession) return
            this.monitoring = false
            this.stopImpl?.()
            this.stopImpl = null
        }
    }
    listDevices(): Promise<MediaDeviceInfo[]> { return this.chat.listDevices() }
    selectMicrophone(deviceId: string): Promise<void> { return this.chat.selectMicrophone(deviceId) }
    selectCamera(deviceId: string): Promise<void> { return this.chat.selectCamera(deviceId) }
    selectOutput(deviceId: string): Promise<void> { return this.chat.selectOutput(deviceId) }
    get outputSupported(): boolean { return this.existing?.outputSupported ?? (typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype) }
    getRemoteAudio(uid: string) { return this.existing?.getRemoteAudio(uid) ?? { muted: false, volume: 100, speaking: false } }
    setRemoteMuted(uid: string, muted: boolean): void { this.existing?.setRemoteMuted(uid, muted) }
    setRemoteVolume(uid: string, volume: number): void { this.existing?.setRemoteVolume(uid, volume) }
    // Without a chat the element is only remembered; the chat made by the next mediaConfig is given it (useProvider).
    playVideoTrackAtElementId(elementId: string | HTMLElement): void { this.cameraElement = elementId; this.existing?.playVideoTrackAtElementId(elementId) }
    // The floating call window lives in another document; the returned function gives the preview back.
    showCameraIn(element: HTMLElement): () => void {
        const previous = this.cameraElement
        this.playVideoTrackAtElementId(element)
        return () => { if (this.cameraElement === element) this.playVideoTrackAtElementId(previous) }
    }
    get isConnected(): boolean { return this.existing?.isConnected ?? false }
    isVideoSubscribed(uid: string): boolean { return this.existing?.isVideoSubscribed(uid) ?? false }
    rememberToken(channel: string, token: string): void { this.existing?.rememberToken(channel, token) }
    startScreenShare(): Promise<void> { return this.chat.startScreenShare() }
    showScreenPreview(element: string | HTMLElement): () => void { return this.existing?.showScreenPreview(element) ?? (() => {}) }
    stopScreenShare(): Promise<void> { return this.existing?.stopScreenShare() ?? Promise.resolve() }
    joinChannel(channel: string, uid: string, realmId: string, roomIndex: number, area: ChannelArea | null = null): Promise<void> {
        this.joined = [channel, uid, realmId, roomIndex, area]
        return this.chat.joinChannel(channel, uid, realmId, roomIndex, area)
    }
    leaveChannel(): Promise<void> {
        this.joined = null
        return this.existing?.leaveChannel() ?? Promise.resolve()
    }
    requestLayer(uid: string, layer: Layer): () => void { return this.existing?.requestLayer(uid, layer) ?? (() => {}) }
    configure(config: MediaConfig): void { this.useProvider(config) }
    speakerAudio(objectId: string) { return this.existing?.speakerAudio(objectId) ?? null }
    publishSpeaker(objectId: string, track: MediaStreamTrack): Promise<void> { return this.chat.publishSpeaker(objectId, track) }
    unpublishSpeaker(objectId: string): Promise<void> { return this.existing?.unpublishSpeaker(objectId) ?? Promise.resolve() }
    destroy(): void {
        this.impl?.destroy()
        // The Agora chat is reusable after destroy and keeps its page-long state (pushed tokens), as it always did.
        // A destroyed Cloudflare chat is final: the next mediaConfig (or an action) makes a new one.
        if (this.current !== 'agora') {
            this.impl = null
            this.awaitingConfig = true
        }
        this.joined = null
        this.stopImpl = null
        this.monitoring = false
        this.cameraElement = 'local-video'
    }
}

export const videoChat = new VideoChatRouter({
    agora: () => new AgoraVideoChat(),
    cloudflare: config => new CloudflareVideoChat(config),
})
