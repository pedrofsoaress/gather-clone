type Options = { fit?: 'cover' | 'contain', mirror?: boolean }

// RTP audio level is 0 (silence) to 1; normal speech sits well above this.
export const SPEAKING_AUDIO_LEVEL = 0.05
// The browser keeps a source's last level for about 10 s after its last packet (a remote mute): older is silence.
export const AUDIO_LEVEL_FRESH_MS = 500

// RTCRtpSynchronizationSource.timestamp is relative to the time origin (spec); some browsers report epoch time.
const clockFor = (timestamp: number) => timestamp > 1e12 ? Date.now() : performance.now()

// Cloudflare forwards audio without the ssrc-audio-level header extension, so the receiver's sources carry no level.
// The level is then measured from the decoded audio: RMS amplitude, the same 0 to 1 scale. One context per page.
type AudioContextLike = { state: string, resume(): Promise<void>, createMediaStreamSource(stream: MediaStream): MediaStreamAudioSourceNode, createAnalyser(): AnalyserNode }
let sharedContext: AudioContextLike | null = null
function audioContext(): AudioContextLike | null {
    if (sharedContext) return sharedContext
    const Context = (globalThis as { AudioContext?: new () => AudioContextLike }).AudioContext
    if (!Context) return null
    try { sharedContext = new Context() } catch { return null }
    return sharedContext
}
type Meter = { context: AudioContextLike, source: MediaStreamAudioSourceNode, analyser: AnalyserNode, samples: Float32Array }

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
        // The same track again (any roster or track event): the playing element is left alone, so it never blinks.
        if (track === this.track) return
        this.track = track
        if (this.video) this.video.srcObject = new MediaStream([track])
    }
    stop(): void { this.video?.remove(); this.video = null }
}

export class RemoteAudio {
    readonly track: MediaStreamTrack
    private readonly receiver: RTCRtpReceiver | null
    private readonly element: HTMLAudioElement
    private stopGestureRetry: (() => void) | null = null
    private meter: Meter | null = null
    private meterFailed = false
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
    // Blocked by the autoplay policy: played again on the next click or key press, as Agora does.
    play(): void { void this.element.play().catch(() => this.retryOnGesture()) }
    stop(): void {
        this.stopGestureRetry?.()
        this.element.pause()
        this.element.srcObject = null
        try { this.meter?.source.disconnect() } catch { /* already disconnected */ }
        this.meter = null
    }
    getVolumeLevel(): number {
        const source = this.receiver?.getSynchronizationSources?.()[0]
        if (source && typeof source.audioLevel === 'number') {
            if (typeof source.timestamp === 'number' && clockFor(source.timestamp) - source.timestamp > AUDIO_LEVEL_FRESH_MS) return 0
            return source.audioLevel
        }
        return this.measuredLevel()
    }
    private measuredLevel(): number {
        if (!this.element.srcObject || this.meterFailed) return 0
        if (!this.meter) {
            const context = audioContext()
            if (!context) { this.meterFailed = true; return 0 }
            try {
                const source = context.createMediaStreamSource(new MediaStream([this.track]))
                const analyser = context.createAnalyser()
                analyser.fftSize = 512
                source.connect(analyser)
                this.meter = { context, source, analyser, samples: new Float32Array(analyser.fftSize) }
            } catch { this.meterFailed = true; return 0 }
        }
        const { context, analyser, samples } = this.meter
        // Created before any click, the context starts suspended; it measures once resumed.
        if (context.state === 'suspended') void context.resume().catch(() => {})
        analyser.getFloatTimeDomainData(samples)
        let sum = 0
        for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
        return Math.sqrt(sum / samples.length)
    }
    private retryOnGesture(): void {
        if (this.stopGestureRetry || !this.element.srcObject) return
        const page = this.element.ownerDocument ?? document
        const retry = () => {
            this.stopGestureRetry?.()
            if (this.element.srcObject) void this.element.play().catch(() => {})
        }
        page.addEventListener('pointerdown', retry)
        page.addEventListener('keydown', retry)
        this.stopGestureRetry = () => {
            page.removeEventListener('pointerdown', retry)
            page.removeEventListener('keydown', retry)
            this.stopGestureRetry = null
        }
    }
}

// The camera's stand-in while it is off (CloudflareEngine, PLACEHOLDER_BITRATE): black 1280x720 (all three simulcast
// layers stay up) at one frame a second. Nobody sees it: tiles show the avatar while the camera is off.
export function blackFrames(): MediaStreamTrack | null {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas') as HTMLCanvasElement
    if (typeof canvas.captureStream !== 'function') return null
    canvas.width = 1280
    canvas.height = 720
    const context = canvas.getContext('2d')
    if (!context) return null
    // A canvas yields a frame only when painted.
    const paint = () => { context.fillStyle = '#000'; context.fillRect(0, 0, canvas.width, canvas.height) }
    paint()
    const track = canvas.captureStream(1).getVideoTracks()[0]
    if (!track) return null
    const timer = setInterval(paint, 1000)
    const stop = track.stop.bind(track)
    track.stop = () => { clearInterval(timer); stop() }
    return track
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
