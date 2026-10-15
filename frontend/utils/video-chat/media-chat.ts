import type { MediaPreferences } from './AudioPreference'
import type { ChannelArea } from './subscription-policy'
import type { Layer, MediaConfig } from './cloudflare/protocol'
export type { Layer, MediaConfig, MediaProvider } from './cloudflare/protocol'

export type PlayableVideo = { play(element: string | HTMLElement, config?: { fit?: 'cover' | 'contain' }): void, stop(): void }
// What the tiles read from a remote person; Agora's IAgoraRTCRemoteUser fits it as well.
export interface MediaRemoteUser { uid: string | number, hasAudio: boolean, hasVideo: boolean, videoTrack?: PlayableVideo }
export type SpeakerAudio = { setVolume(volume: number): void, play(): void }

// Everything the screen uses, whichever provider is behind it.
export interface MediaChat {
    toggleCamera(): Promise<boolean>
    toggleMicrophone(): Promise<boolean>
    isMicrophoneMuted(): boolean
    muteMicrophone(): Promise<boolean>
    turnOffCamera(): Promise<boolean>
    getDevicePreferences(): MediaPreferences
    startDeviceMonitoring(): () => void
    listDevices(): Promise<MediaDeviceInfo[]>
    selectMicrophone(deviceId: string): Promise<void>
    selectCamera(deviceId: string): Promise<void>
    selectOutput(deviceId: string): Promise<void>
    readonly outputSupported: boolean
    getRemoteAudio(uid: string): { muted: boolean, volume: number, speaking: boolean }
    setRemoteMuted(uid: string, muted: boolean): void
    setRemoteVolume(uid: string, volume: number): void
    playVideoTrackAtElementId(elementId: string | HTMLElement): void
    showCameraIn(element: HTMLElement): () => void
    readonly isConnected: boolean
    isVideoSubscribed(uid: string): boolean
    rememberToken(channel: string, token: string): void
    startScreenShare(): Promise<void>
    showScreenPreview(element: string | HTMLElement): () => void
    stopScreenShare(): Promise<void>
    joinChannel(channel: string, uid: string, realmId: string, roomIndex: number, area?: ChannelArea | null): Promise<void>
    leaveChannel(): Promise<void>
    requestLayer(uid: string, layer: Layer): () => void
    configure(config: MediaConfig): void
    speakerAudio(objectId: string): SpeakerAudio | null
    publishSpeaker(objectId: string, track: MediaStreamTrack): Promise<void>
    unpublishSpeaker(objectId: string): Promise<void>
    destroy(): void
}
