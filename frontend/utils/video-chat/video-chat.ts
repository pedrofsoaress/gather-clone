import signal from '../signal'
import { AgoraVideoChat } from './agora-video-chat'
import { CloudflareVideoChat } from './cloudflare/CloudflareVideoChat'
import type { Layer, MediaChat, MediaConfig, MediaProvider } from './media-chat'
import type { CloudflareMediaConfig } from './cloudflare/protocol'
import type { MediaPreferences } from './AudioPreference'
import type { ChannelArea } from './subscription-policy'

export type { MediaRemoteUser } from './media-chat'

type Factories = { agora: () => MediaChat, cloudflare: (config: CloudflareMediaConfig) => MediaChat }

// The screen talks to `videoChat`; the server's mediaConfig decides whether Agora or Cloudflare is behind it.
export class VideoChatRouter implements MediaChat {
    private readonly factories: Factories
    private impl: MediaChat | null = null
    private current: MediaProvider = 'agora'
    private lastConfig: CloudflareMediaConfig | null = null
    private cameraElement: string | HTMLElement = 'local-video'
    private monitoring = false
    // Bumped by every startDeviceMonitoring: an older stopper no longer stops anything.
    private monitorSession = 0
    private stopImpl: (() => void) | null = null

    constructor(factories: Factories) {
        this.factories = factories
        // Synchronous on purpose: the Cloudflare engine must be started before the server's next negotiation step.
        signal.on('mediaConfig', (config: MediaConfig) => this.useProvider(config))
    }

    get provider(): MediaProvider { return this.current }

    private get chat(): MediaChat {
        if (!this.impl) this.impl = this.current === 'cloudflare' && this.lastConfig ? this.factories.cloudflare(this.lastConfig) : this.factories.agora()
        return this.impl
    }

    useProvider(config: MediaConfig): void {
        if (config.provider === 'cloudflare') this.lastConfig = config
        if (config.provider === this.current && this.impl) { this.impl.configure(config); return }
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
    }

    toggleCamera(): Promise<boolean> { return this.chat.toggleCamera() }
    toggleMicrophone(): Promise<boolean> { return this.chat.toggleMicrophone() }
    isMicrophoneMuted(): boolean { return this.chat.isMicrophoneMuted() }
    muteMicrophone(): Promise<boolean> { return this.chat.muteMicrophone() }
    turnOffCamera(): Promise<boolean> { return this.chat.turnOffCamera() }
    getDevicePreferences(): MediaPreferences { return this.chat.getDevicePreferences() }
    startDeviceMonitoring(): () => void {
        this.stopImpl?.()
        const session = ++this.monitorSession
        this.monitoring = true
        this.stopImpl = this.chat.startDeviceMonitoring()
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
    get outputSupported(): boolean { return this.chat.outputSupported }
    getRemoteAudio(uid: string) { return this.chat.getRemoteAudio(uid) }
    setRemoteMuted(uid: string, muted: boolean): void { this.chat.setRemoteMuted(uid, muted) }
    setRemoteVolume(uid: string, volume: number): void { this.chat.setRemoteVolume(uid, volume) }
    playVideoTrackAtElementId(elementId: string | HTMLElement): void { this.cameraElement = elementId; this.chat.playVideoTrackAtElementId(elementId) }
    // The floating call window lives in another document; the returned function gives the preview back.
    showCameraIn(element: HTMLElement): () => void {
        const previous = this.cameraElement
        this.playVideoTrackAtElementId(element)
        return () => { if (this.cameraElement === element) this.playVideoTrackAtElementId(previous) }
    }
    get isConnected(): boolean { return this.chat.isConnected }
    isVideoSubscribed(uid: string): boolean { return this.chat.isVideoSubscribed(uid) }
    rememberToken(channel: string, token: string): void { this.chat.rememberToken(channel, token) }
    startScreenShare(): Promise<void> { return this.chat.startScreenShare() }
    showScreenPreview(element: string | HTMLElement): () => void { return this.chat.showScreenPreview(element) }
    stopScreenShare(): Promise<void> { return this.chat.stopScreenShare() }
    joinChannel(channel: string, uid: string, realmId: string, roomIndex: number, area: ChannelArea | null = null): Promise<void> { return this.chat.joinChannel(channel, uid, realmId, roomIndex, area) }
    leaveChannel(): Promise<void> { return this.chat.leaveChannel() }
    requestLayer(uid: string, layer: Layer): () => void { return this.chat.requestLayer(uid, layer) }
    configure(config: MediaConfig): void { this.useProvider(config) }
    speakerAudio(objectId: string) { return this.chat.speakerAudio(objectId) }
    publishSpeaker(objectId: string, track: MediaStreamTrack): Promise<void> { return this.chat.publishSpeaker(objectId, track) }
    unpublishSpeaker(objectId: string): Promise<void> { return this.chat.unpublishSpeaker(objectId) }
    destroy(): void {
        this.impl?.destroy()
        // The Agora chat is reusable after destroy and keeps its page-long state (pushed tokens), as it always did.
        // A destroyed Cloudflare chat is final: the next use makes a new one with the latest config.
        if (this.current !== 'agora') this.impl = null
        this.stopImpl = null
        this.monitoring = false
        this.cameraElement = 'local-video'
    }
}

export const videoChat = new VideoChatRouter({
    agora: () => new AgoraVideoChat(),
    cloudflare: config => new CloudflareVideoChat(config),
})
