type Options = { fit?: 'cover' | 'contain', mirror?: boolean }

// RTP audio level is 0 (silence) to 1; normal speech sits well above this.
export const SPEAKING_AUDIO_LEVEL = 0.05

// A container id of this page, or an element of any document (the floating window has its own).
function attach(element: string | HTMLElement, track: MediaStreamTrack, { fit = 'cover', mirror = false }: Options): HTMLVideoElement | null {
    const box = typeof element === 'string' ? document.getElementById(element) : element
    if (!box) return null
    const video = box.ownerDocument.createElement('video')
    video.autoplay = true
    video.muted = true
    video.playsInline = true
    video.srcObject = new MediaStream([track])
    Object.assign(video.style, { width: '100%', height: '100%', objectFit: fit, transform: mirror ? 'scaleX(-1)' : '' })
    box.replaceChildren(video)
    void video.play().catch(() => {})
    return video
}

export class RemoteVideo {
    private track: MediaStreamTrack
    private video: HTMLVideoElement | null = null
    constructor(track: MediaStreamTrack) { this.track = track }
    play(element: string | HTMLElement, config?: { fit?: 'cover' | 'contain' }): void {
        this.video?.remove()
        this.video = attach(element, this.track, { fit: config?.fit ?? 'cover' })
    }
    setTrack(track: MediaStreamTrack): void {
        this.track = track
        if (this.video) this.video.srcObject = new MediaStream([track])
    }
    stop(): void { this.video?.remove(); this.video = null }
}

export class RemoteAudio {
    readonly track: MediaStreamTrack
    private readonly receiver: RTCRtpReceiver | null
    private readonly element: HTMLAudioElement
    constructor(track: MediaStreamTrack, receiver: RTCRtpReceiver | null) {
        this.track = track
        this.receiver = receiver
        this.element = document.createElement('audio')
        this.element.autoplay = true
        this.element.srcObject = new MediaStream([track])
    }
    setVolume(volume: number): void { this.element.volume = Math.max(0, Math.min(100, volume)) / 100 }
    async setPlaybackDevice(deviceId: string): Promise<void> {
        await (this.element as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId(deviceId === 'default' ? '' : deviceId)
    }
    play(): void { void this.element.play().catch(() => {}) }
    stop(): void { this.element.pause(); this.element.srcObject = null }
    getVolumeLevel(): number { return this.receiver?.getSynchronizationSources?.()[0]?.audioLevel ?? 0 }
}

// Your own camera (mirrored) or your own shared screen, played from the local track.
export class LocalPreview {
    private video: HTMLVideoElement | null = null
    play(element: string | HTMLElement, track: MediaStreamTrack, options: Options = { fit: 'cover', mirror: true }): void {
        this.stop()
        this.video = attach(element, track, options)
    }
    stop(): void { this.video?.remove(); this.video = null }
}

export class CloudflareRemoteUser {
    readonly uid: string
    hasAudio = false
    hasVideo = false
    videoTrack?: RemoteVideo
    audioTrack?: RemoteAudio
    constructor(uid: string) { this.uid = uid }
}

// What the tiles render from; a change means a `user-info-updated`.
export const signature = (user: CloudflareRemoteUser) => `${user.hasAudio}|${user.hasVideo}|${Boolean(user.videoTrack)}|${Boolean(user.audioTrack)}`
