import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack, IAgoraRTCRemoteUser, IDataChannelConfig, ILocalVideoTrack } from 'agora-rtc-sdk-ng'
import signal from '../signal'
import { createHash } from 'crypto'
import { generateToken } from './generateToken'
import { clampRemoteVolume, readMediaPreferences, resolveDevicePreference, saveMediaPreferences, type MediaPreferences } from './AudioPreference'

export class VideoChat {
    private client: IAgoraRTCClient = AgoraRTC.createClient({ codec: "vp8", mode: "rtc" })
    private screenClient: IAgoraRTCClient = AgoraRTC.createClient({ codec: "vp8", mode: "rtc" })
    private microphoneTrack: IMicrophoneAudioTrack | null = null
    private cameraTrack: ICameraVideoTrack | null = null
    private screenTrack: ILocalVideoTrack | null = null
    private currentChannel: string = ''
    private currentAgoraChannel: string = ''
    private currentUid: string = ''
    private preferences: MediaPreferences | null = null
    private readonly remoteVolumes = new Map<string, number>()
    private readonly remoteMuted = new Set<string>()

    private remoteUsers: { [uid: string]: IAgoraRTCRemoteUser } = {}

    private channelTimeout: NodeJS.Timeout | null = null

    constructor() {
        AgoraRTC.setLogLevel(4)
        this.client.on('user-published', this.onUserPublished)
        this.client.on('user-unpublished', this.onUserUnpublished)
        this.client.on('user-left', this.onUserLeft)
        this.client.on('user-info-updated', this.onUserInfoUpdated)
        this.client.on('user-joined', this.onUserJoined)
    }

    private onUserInfoUpdated = (uid: string) => {
        if (!this.remoteUsers[uid]) return
        signal.emit('user-info-updated', this.remoteUsers[uid])
    }

    private onUserJoined = (user: IAgoraRTCRemoteUser) => {
        this.remoteUsers[user.uid] = user
        signal.emit('user-info-updated', user)
    }

    public onUserPublished = async (user: IAgoraRTCRemoteUser, mediaType: "audio" | "video" | "datachannel", config?: IDataChannelConfig) => {
        this.remoteUsers[user.uid] = user
        await this.client.subscribe(user, mediaType)

        if (mediaType === 'audio') {
            user.audioTrack?.play()
            await this.applyRemoteAudio(user)
        }

        if (mediaType === 'audio' || mediaType === 'video') {
            signal.emit('user-info-updated', user)
        }
    }

    public onUserUnpublished = (user: IAgoraRTCRemoteUser, mediaType: "audio" | "video" | "datachannel") => {
        if (mediaType === 'audio') {
            user.audioTrack?.stop()
        }
        if (mediaType === 'video') signal.emit('user-info-updated', user)
    }

    public onUserLeft = (user: IAgoraRTCRemoteUser, reason: string) => {
        delete this.remoteUsers[user.uid]
        signal.emit('user-left', user)
    }

    public async toggleCamera() {
        if (!this.cameraTrack) {
            this.cameraTrack = await AgoraRTC.createCameraVideoTrack(this.getPreferences().cameraId ? { cameraId: this.getPreferences().cameraId } : undefined)
            this.cameraTrack.play('local-video')

            if (this.client.connectionState === 'CONNECTED') {
                await this.client.publish([this.cameraTrack])
            }

            return false
        }
        await this.cameraTrack.setEnabled(!this.cameraTrack.enabled)

        return !this.cameraTrack.enabled
    }

    // TODO: Set it up so microphone gets muted and unmuted instead of enabled and disabled

    public async toggleMicrophone() {
        if (!this.microphoneTrack) {
            this.microphoneTrack = await AgoraRTC.createMicrophoneAudioTrack(this.getPreferences().microphoneId ? { microphoneId: this.getPreferences().microphoneId } : undefined)

            if (this.client.connectionState === 'CONNECTED') {
                await this.client.publish([this.microphoneTrack])
            }

            return false
        }
        await this.microphoneTrack.setMuted(!this.microphoneTrack.muted)

        return this.microphoneTrack.muted
    }

    private getPreferences(): MediaPreferences {
        if (!this.preferences) this.preferences = readMediaPreferences()
        return this.preferences
    }

    public getDevicePreferences(): MediaPreferences { return { ...this.getPreferences() } }

    public async listDevices(): Promise<MediaDeviceInfo[]> {
        if (!navigator.mediaDevices?.enumerateDevices) throw new Error('Este navegador não permite listar dispositivos de mídia.')
        const devices = await navigator.mediaDevices.enumerateDevices()
        const preferences = this.getPreferences()
        const next = {
            microphoneId: resolveDevicePreference(preferences.microphoneId, 'audioinput', devices),
            cameraId: resolveDevicePreference(preferences.cameraId, 'videoinput', devices),
            outputId: resolveDevicePreference(preferences.outputId, 'audiooutput', devices),
        }
        if (JSON.stringify(preferences) !== JSON.stringify(next)) {
            this.preferences = next
            saveMediaPreferences(next)
            if (preferences.microphoneId && !next.microphoneId && this.microphoneTrack) await this.microphoneTrack.setDevice('default').catch(() => {})
            if (preferences.cameraId && !next.cameraId && this.cameraTrack) await this.cameraTrack.setDevice('default').catch(() => {})
            if (preferences.outputId && !next.outputId) await this.applyAllRemoteAudio()
        }
        return devices
    }

    public async selectMicrophone(deviceId: string): Promise<void> {
        const devices = await this.listDevices()
        if (deviceId && resolveDevicePreference(deviceId, 'audioinput', devices) !== deviceId) throw new Error('Microfone indisponível.')
        if (this.microphoneTrack) await this.microphoneTrack.setDevice(deviceId || 'default')
        this.preferences = { ...this.getPreferences(), microphoneId: deviceId }
        saveMediaPreferences(this.preferences)
    }

    public async selectCamera(deviceId: string): Promise<void> {
        const devices = await this.listDevices()
        if (deviceId && resolveDevicePreference(deviceId, 'videoinput', devices) !== deviceId) throw new Error('Câmera indisponível.')
        if (this.cameraTrack) await this.cameraTrack.setDevice(deviceId || 'default')
        this.preferences = { ...this.getPreferences(), cameraId: deviceId }
        saveMediaPreferences(this.preferences)
    }

    public get outputSupported(): boolean { return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype }

    public async selectOutput(deviceId: string): Promise<void> {
        if (!this.outputSupported) throw new Error('Seu navegador não oferece seleção de saída de áudio.')
        const devices = await this.listDevices()
        if (deviceId && resolveDevicePreference(deviceId, 'audiooutput', devices) !== deviceId) throw new Error('Saída de áudio indisponível.')
        for (const user of Object.values(this.remoteUsers)) if (user.audioTrack) await user.audioTrack.setPlaybackDevice(deviceId || 'default')
        this.preferences = { ...this.getPreferences(), outputId: deviceId }
        saveMediaPreferences(this.preferences)
    }

    public getRemoteAudio(uid: string): { muted: boolean, volume: number, speaking: boolean } {
        const user = this.remoteUsers[uid]
        return { muted: this.remoteMuted.has(uid), volume: this.remoteVolumes.get(uid) ?? 100, speaking: Boolean(user?.audioTrack && user.audioTrack.getVolumeLevel() > 0.2) }
    }

    public setRemoteMuted(uid: string, muted: boolean): void {
        if (muted) this.remoteMuted.add(uid)
        else this.remoteMuted.delete(uid)
        void this.applyRemoteAudio(this.remoteUsers[uid])
        signal.emit('remote-audio-preference-changed', uid)
    }

    public setRemoteVolume(uid: string, volume: number): void {
        this.remoteVolumes.set(uid, clampRemoteVolume(volume))
        void this.applyRemoteAudio(this.remoteUsers[uid])
        signal.emit('remote-audio-preference-changed', uid)
    }

    private async applyRemoteAudio(user?: IAgoraRTCRemoteUser): Promise<void> {
        if (!user?.audioTrack) return
        const uid = String(user.uid)
        user.audioTrack.setVolume(this.remoteMuted.has(uid) ? 0 : this.remoteVolumes.get(uid) ?? 100)
        if (this.outputSupported) await user.audioTrack.setPlaybackDevice(this.getPreferences().outputId || 'default').catch(() => {})
    }

    private async applyAllRemoteAudio(): Promise<void> {
        await Promise.all(Object.values(this.remoteUsers).map(user => this.applyRemoteAudio(user)))
    }

    public playVideoTrackAtElementId(elementId: string) {
        if (this.cameraTrack) {
            this.cameraTrack.play(elementId)
        }
    }

    public get isConnected() { return this.client.connectionState === 'CONNECTED' }

    public async startScreenShare() {
        if (this.screenTrack) return
        if (!this.isConnected) throw new Error('Aproxime-se de alguém para iniciar uma chamada antes de compartilhar a tela.')
        // Agora's built-in picker focuses the selected tab. Capture directly so
        // browsers with Conditional Focus can keep this office tab in front.
        const CaptureControllerClass = (window as Window & {
            CaptureController?: new () => { setFocusBehavior: (behavior: 'no-focus-change') => void }
        }).CaptureController
        const controller = CaptureControllerClass ? new CaptureControllerClass() : undefined
        controller?.setFocusBehavior('no-focus-change')
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false,
            ...(controller ? { controller } : {}),
        } as DisplayMediaStreamOptions)
        const mediaTrack = stream.getVideoTracks()[0]
        if (!mediaTrack) {
            stream.getTracks().forEach(track => track.stop())
            throw new Error('Nenhuma tela foi selecionada para compartilhar.')
        }
        const track = AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: mediaTrack, optimizationMode: 'detail' })
        try {
            const screenUid = `${this.currentUid}-screen`
            const token = await generateToken(this.currentAgoraChannel, screenUid)
            if (!token) throw new Error('Chamada indisponível para compartilhar a tela.')
            await this.screenClient.join(process.env.NEXT_PUBLIC_AGORA_APP_ID!, this.currentAgoraChannel, token, screenUid)
            await this.screenClient.publish(track)
            this.screenTrack = track
            mediaTrack.addEventListener('ended', () => { void this.stopScreenShare() }, { once: true })
            signal.emit('screen-share-changed', true)
        } catch (error) {
            if (this.screenClient.connectionState === 'CONNECTED') await this.screenClient.leave().catch(() => {})
            track.close()
            throw error
        }
    }

    public async stopScreenShare() {
        const track = this.screenTrack
        if (!track) return
        this.screenTrack = null
        if (this.screenClient.connectionState === 'CONNECTED') await this.screenClient.leave().catch(() => {})
        track.close()
        signal.emit('screen-share-changed', false)
    }

    private resetRemoteUsers() {
        this.remoteUsers = {}
        signal.emit('reset-users')
    }

    public async joinChannel(channel: string, uid: string, realmId: string) {
        if (this.channelTimeout) {
            clearTimeout(this.channelTimeout)
        }

        this.channelTimeout = setTimeout(async () => {
            if (channel === this.currentChannel) return
            const uniqueChannelId = this.createUniqueChannelId(realmId, channel)
            const token = await generateToken(uniqueChannelId, uid)
            if (!token) {
                signal.emit('officeFeedback', { message: 'Chamada indisponível. O administrador precisa concluir a configuração do Agora.' })
                return
            }

            try {
                if (this.screenClient.connectionState === 'CONNECTED') await this.screenClient.leave()
                if (this.client.connectionState === 'CONNECTED') await this.client.leave()
                this.resetRemoteUsers()
                await this.client.join(process.env.NEXT_PUBLIC_AGORA_APP_ID!, uniqueChannelId, token, uid)
                this.currentChannel = channel
                this.currentAgoraChannel = uniqueChannelId
                this.currentUid = uid
                if (this.microphoneTrack && this.microphoneTrack.enabled) await this.client.publish([this.microphoneTrack])
                if (this.cameraTrack && this.cameraTrack.enabled) await this.client.publish([this.cameraTrack])
                if (this.screenTrack) {
                    try {
                        const screenUid = `${uid}-screen`
                        const screenToken = await generateToken(uniqueChannelId, screenUid)
                        if (!screenToken) throw new Error('Screen token unavailable')
                        await this.screenClient.join(process.env.NEXT_PUBLIC_AGORA_APP_ID!, uniqueChannelId, screenToken, screenUid)
                        await this.screenClient.publish(this.screenTrack)
                    } catch (error) {
                        console.error('Failed to move screen share to new conversation', error)
                        await this.stopScreenShare()
                        signal.emit('officeFeedback', { message: 'O compartilhamento de tela foi encerrado ao mudar de conversa.' })
                    }
                }
            } catch (error) {
                console.error('Failed to join video conversation', error)
                signal.emit('officeFeedback', { message: 'Não foi possível entrar na chamada de vídeo.' })
            }
        }, 1000)
    }

    public async leaveChannel() {
        if (this.channelTimeout) {
            clearTimeout(this.channelTimeout)
        }

        this.channelTimeout = setTimeout(async () => {
            if (this.currentChannel === '') return

            await this.stopScreenShare()

            if (this.client.connectionState === 'CONNECTED') {
                await this.client.leave()
                this.currentChannel = ''
                this.currentAgoraChannel = ''
                this.currentUid = ''
            }
            this.resetRemoteUsers()
            signal.emit('video-channel-left')
        }, 1000)
        
    }

    public destroy() {
        if (this.screenTrack) {
            this.screenTrack.close()
            this.screenTrack = null
            signal.emit('screen-share-changed', false)
        }
        if (this.screenClient.connectionState === 'CONNECTED') void this.screenClient.leave()
        if (this.cameraTrack) {
            this.cameraTrack.stop()
            this.cameraTrack.close()
        }
        if (this.microphoneTrack) {
            this.microphoneTrack.stop()
            this.microphoneTrack.close()
        }
        this.microphoneTrack = null
        this.cameraTrack = null
    }

    private createUniqueChannelId(realmId: string, channel: string): string {
        const combined = `${realmId}-${channel}`;
        return createHash('md5').update(combined).digest('hex').substring(0, 16);
    }
}

export const videoChat = new VideoChat()
