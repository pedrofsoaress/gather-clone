import AgoraRTC, { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack, IAgoraRTCRemoteUser, IDataChannelConfig, ILocalVideoTrack } from 'agora-rtc-sdk-ng'
import signal from '../signal'
import { createHash } from 'crypto'
import { generateToken } from './generateToken'
import { clampRemoteVolume, createWithDeviceFallback, defaultDeviceId, mediaErrorMessage, readMediaPreferences, resolveDevicePreference, saveMediaPreferences, type MediaPreferences } from './AudioPreference'

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
    private cameraElementId = 'local-video'
    private deviceRefresh: Promise<MediaDeviceInfo[]> | null = null
    private stopDeviceMonitoring: (() => void) | null = null
    private lifecycle = 0
    private channelRequest = 0
    private channelOperation = Promise.resolve()
    private screenRequest = 0
    private screenStarting = false

    private remoteUsers: { [uid: string]: IAgoraRTCRemoteUser } = {}

    private channelTimeout: NodeJS.Timeout | null = null

    constructor() {
        AgoraRTC.setLogLevel(4)
        this.client.on('user-published', this.onUserPublished)
        this.client.on('user-unpublished', this.onUserUnpublished)
        this.client.on('user-left', this.onUserLeft)
        this.client.on('user-info-updated', this.onUserInfoUpdated)
        this.client.on('user-joined', this.onUserJoined)
        this.client.on('token-privilege-will-expire', () => { void this.renewConversationToken(false) })
        this.client.on('token-privilege-did-expire', () => { void this.renewConversationToken(false) })
        this.screenClient.on('token-privilege-will-expire', () => { void this.renewConversationToken(true) })
        this.screenClient.on('token-privilege-did-expire', () => { void this.renewConversationToken(true) })
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
        const lifecycle = this.lifecycle
        try {
            this.remoteUsers[user.uid] = user
            await this.client.subscribe(user, mediaType)
            if (lifecycle !== this.lifecycle) return

            if (mediaType === 'audio') {
                await this.applyRemoteAudio(user)
                user.audioTrack?.play()
            }

            if (mediaType === 'audio' || mediaType === 'video') signal.emit('user-info-updated', user)
        } catch { signal.emit('officeFeedback', { message: 'Não foi possível receber a mídia de um participante.' }) }
    }

    public onUserUnpublished = (user: IAgoraRTCRemoteUser, mediaType: "audio" | "video" | "datachannel") => {
        if (mediaType === 'audio') {
            user.audioTrack?.stop()
        }
        if (mediaType === 'audio' || mediaType === 'video') signal.emit('user-info-updated', user)
    }

    public onUserLeft = (user: IAgoraRTCRemoteUser, reason: string) => {
        delete this.remoteUsers[user.uid]
        signal.emit('user-left', user)
    }

    public async toggleCamera() {
        if (!this.cameraTrack) {
            const lifecycle = this.lifecycle
            const devices = await this.listDevices()
            if (lifecycle !== this.lifecycle) throw new Error('A chamada foi encerrada.')
            const { track, deviceId } = await createWithDeviceFallback(this.getPreferences().cameraId, 'videoinput', devices, id => AgoraRTC.createCameraVideoTrack(id ? { cameraId: id } : undefined))
            try {
                if (lifecycle !== this.lifecycle) throw new Error('A chamada foi encerrada.')
                if (this.client.connectionState === 'CONNECTED') await this.client.publish([track])
                if (lifecycle !== this.lifecycle) throw new Error('A chamada foi encerrada.')
                track.play(this.cameraElementId)
                this.cameraTrack = track
                this.savePreferences({ cameraId: deviceId })
            } catch (error) {
                await this.client.unpublish([track]).catch(() => {})
                track.close()
                throw error
            }
            return false
        }
        await this.cameraTrack.setEnabled(!this.cameraTrack.enabled)

        return !this.cameraTrack.enabled
    }

    public async toggleMicrophone() {
        if (!this.microphoneTrack) {
            const lifecycle = this.lifecycle
            const devices = await this.listDevices()
            if (lifecycle !== this.lifecycle) throw new Error('A chamada foi encerrada.')
            const { track, deviceId } = await createWithDeviceFallback(this.getPreferences().microphoneId, 'audioinput', devices, id => AgoraRTC.createMicrophoneAudioTrack(id ? { microphoneId: id } : undefined))
            try {
                if (lifecycle !== this.lifecycle) throw new Error('A chamada foi encerrada.')
                if (this.client.connectionState === 'CONNECTED') await this.client.publish([track])
                if (lifecycle !== this.lifecycle) throw new Error('A chamada foi encerrada.')
                this.microphoneTrack = track
                this.savePreferences({ microphoneId: deviceId })
            } catch (error) {
                await this.client.unpublish([track]).catch(() => {})
                track.close()
                throw error
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

    private savePreferences(patch: Partial<MediaPreferences>) {
        this.preferences = { ...this.getPreferences(), ...patch }
        saveMediaPreferences(this.preferences)
        signal.emit('media-preferences-changed', this.getDevicePreferences())
    }

    public startDeviceMonitoring(): () => void {
        this.stopDeviceMonitoring?.()
        const onChange = async () => {
            try { await this.listDevices() }
            catch (error) { signal.emit('officeFeedback', { message: mediaErrorMessage(error, 'dispositivo') }) }
        }
        navigator.mediaDevices?.addEventListener?.('devicechange', onChange)
        const stop = () => {
            navigator.mediaDevices?.removeEventListener?.('devicechange', onChange)
            if (this.stopDeviceMonitoring === stop) this.stopDeviceMonitoring = null
        }
        this.stopDeviceMonitoring = stop
        return stop
    }

    public listDevices(): Promise<MediaDeviceInfo[]> {
        if (!this.deviceRefresh) this.deviceRefresh = this.refreshDevices().finally(() => { this.deviceRefresh = null })
        return this.deviceRefresh
    }

    private async refreshDevices(): Promise<MediaDeviceInfo[]> {
        if (!navigator.mediaDevices?.enumerateDevices) throw new Error('Este navegador não permite listar dispositivos de mídia.')
        const devices = await navigator.mediaDevices.enumerateDevices()
        const preferences = this.getPreferences()
        const next = {
            microphoneId: resolveDevicePreference(preferences.microphoneId, 'audioinput', devices),
            cameraId: resolveDevicePreference(preferences.cameraId, 'videoinput', devices),
            outputId: resolveDevicePreference(preferences.outputId, 'audiooutput', devices),
        }
        const gone = (track: ICameraVideoTrack | IMicrophoneAudioTrack, kind: 'audioinput' | 'videoinput') => {
            const streamTrack = track.getMediaStreamTrack()
            const id = streamTrack.getSettings().deviceId
            return (track.enabled && streamTrack.readyState === 'ended') || Boolean(id && !devices.some(device => device.kind === kind && device.deviceId === id))
        }
        if (this.microphoneTrack && ((preferences.microphoneId && !next.microphoneId) || gone(this.microphoneTrack, 'audioinput'))) {
            const replacement = defaultDeviceId('audioinput', devices)
            const track = this.microphoneTrack
            try {
                if (!replacement) throw new Error('Nenhum microfone está conectado. Conecte um dispositivo e ative o microfone novamente.')
                await track.setDevice(replacement)
            } catch (error) {
                this.microphoneTrack = null
                await this.client.unpublish([track]).catch(() => {})
                track.close()
                signal.emit('local-microphone-changed', true)
                signal.emit('officeFeedback', { message: mediaErrorMessage(error, 'microfone') })
            }
        }
        if (this.cameraTrack && ((preferences.cameraId && !next.cameraId) || gone(this.cameraTrack, 'videoinput'))) {
            const replacement = defaultDeviceId('videoinput', devices)
            const track = this.cameraTrack
            try {
                if (!replacement) throw new Error('Nenhuma câmera está conectada. Conecte um dispositivo e ative a câmera novamente.')
                await track.setDevice(replacement)
                if (track.enabled) track.play(this.cameraElementId)
            } catch (error) {
                this.cameraTrack = null
                await this.client.unpublish([track]).catch(() => {})
                track.close()
                signal.emit('local-camera-changed', true)
                signal.emit('officeFeedback', { message: mediaErrorMessage(error, 'câmera') })
            }
        }
        if (JSON.stringify(preferences) !== JSON.stringify(next)) this.savePreferences(next)
        if (preferences.outputId && !next.outputId) await this.applyAllRemoteAudio()
        signal.emit('media-devices-changed', devices)
        return devices
    }

    public async selectMicrophone(deviceId: string): Promise<void> {
        const devices = await this.listDevices()
        if (deviceId && resolveDevicePreference(deviceId, 'audioinput', devices) !== deviceId) throw new Error('Microfone indisponível.')
        if (this.microphoneTrack) {
            const selected = deviceId || defaultDeviceId('audioinput', devices)
            if (!selected) throw new Error('Nenhum microfone disponível.')
            await this.microphoneTrack.setDevice(selected)
        }
        this.savePreferences({ microphoneId: deviceId })
    }

    public async selectCamera(deviceId: string): Promise<void> {
        const devices = await this.listDevices()
        if (deviceId && resolveDevicePreference(deviceId, 'videoinput', devices) !== deviceId) throw new Error('Câmera indisponível.')
        if (this.cameraTrack) {
            const selected = deviceId || defaultDeviceId('videoinput', devices)
            if (!selected) throw new Error('Nenhuma câmera disponível.')
            await this.cameraTrack.setDevice(selected)
            if (this.cameraTrack.enabled) this.cameraTrack.play(this.cameraElementId)
        }
        this.savePreferences({ cameraId: deviceId })
    }

    public get outputSupported(): boolean { return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype }

    public async selectOutput(deviceId: string): Promise<void> {
        if (!this.outputSupported) throw new Error('Seu navegador não oferece seleção de saída de áudio.')
        const devices = await this.listDevices()
        if (deviceId && resolveDevicePreference(deviceId, 'audiooutput', devices) !== deviceId) throw new Error('Saída de áudio indisponível.')
        for (const user of Object.values(this.remoteUsers)) if (user.audioTrack) await user.audioTrack.setPlaybackDevice(deviceId || 'default')
        this.savePreferences({ outputId: deviceId })
    }

    public getRemoteAudio(uid: string): { muted: boolean, volume: number, speaking: boolean } {
        const user = this.remoteUsers[uid]
        return { muted: this.remoteMuted.has(uid), volume: this.remoteVolumes.get(uid) ?? 100, speaking: Boolean(user?.audioTrack && user.audioTrack.getVolumeLevel() > 0.2) }
    }

    public setRemoteMuted(uid: string, muted: boolean): void {
        if (muted) this.remoteMuted.add(uid)
        else this.remoteMuted.delete(uid)
        void this.applyRemoteAudio(this.remoteUsers[uid]).catch(() => {})
        signal.emit('remote-audio-preference-changed', uid)
    }

    public setRemoteVolume(uid: string, volume: number): void {
        this.remoteVolumes.set(uid, clampRemoteVolume(volume))
        void this.applyRemoteAudio(this.remoteUsers[uid]).catch(() => {})
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
        this.cameraElementId = elementId
        if (this.cameraTrack) {
            this.cameraTrack.play(elementId)
        }
    }

    public get isConnected() { return this.client.connectionState === 'CONNECTED' }

    private async renewConversationToken(screen: boolean) {
        const channel = this.currentAgoraChannel
        const uid = screen ? `${this.currentUid}-screen` : this.currentUid
        if (!channel || !this.currentUid) return
        const client = screen ? this.screenClient : this.client
        this.channelOperation = this.channelOperation.then(async () => {
        if (channel !== this.currentAgoraChannel) return
        try {
            const token = await generateToken(channel, uid)
            if (channel !== this.currentAgoraChannel) return
            if (!token) throw new Error('A autorização da chamada terminou.')
            await client.renewToken(token)
        } catch {
            if (channel !== this.currentAgoraChannel) return
            if (screen) await this.stopScreenShare()
            else {
                await this.stopScreenShare()
                await this.client.leave().catch(() => {})
                this.currentChannel = ''
                this.currentAgoraChannel = ''
                this.currentUid = ''
                this.resetRemoteUsers()
                signal.emit('video-channel-left')
            }
            signal.emit('officeFeedback', { message: 'A chamada perdeu a autorização. Aproxime-se novamente para reconectar.' })
            signal.emit('video-channel-failed')
        }
        })
        await this.channelOperation
    }

    public async startScreenShare() {
        if (this.screenTrack || this.screenStarting) return
        if (!this.isConnected) throw new Error('Aproxime-se de alguém para iniciar uma chamada antes de compartilhar a tela.')
        this.screenStarting = true
        const request = ++this.screenRequest
        const lifecycle = this.lifecycle
        let stream: MediaStream | undefined
        let track: ILocalVideoTrack | undefined
        try {
        // Agora's built-in picker focuses the selected tab. Capture directly so
        // browsers with Conditional Focus can keep this office tab in front.
        const CaptureControllerClass = (window as Window & {
            CaptureController?: new () => { setFocusBehavior: (behavior: 'no-focus-change') => void }
        }).CaptureController
        const controller = CaptureControllerClass ? new CaptureControllerClass() : undefined
        controller?.setFocusBehavior('no-focus-change')
        stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false,
            ...(controller ? { controller } : {}),
        } as DisplayMediaStreamOptions)
        if (request !== this.screenRequest || lifecycle !== this.lifecycle || !this.isConnected) throw new Error('Compartilhamento cancelado.')
        const channel = this.currentAgoraChannel
        const screenUid = `${this.currentUid}-screen`
        const mediaTrack = stream.getVideoTracks()[0]
        if (!mediaTrack) {
            stream.getTracks().forEach(track => track.stop())
            throw new Error('Nenhuma tela foi selecionada para compartilhar.')
        }
        track = AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: mediaTrack, optimizationMode: 'detail' })
            const token = await generateToken(channel, screenUid)
            if (!token) throw new Error('Chamada indisponível para compartilhar a tela.')
            if (request !== this.screenRequest || channel !== this.currentAgoraChannel) throw new Error('Compartilhamento cancelado.')
            await this.screenClient.join(process.env.NEXT_PUBLIC_AGORA_APP_ID!, channel, token, screenUid)
            if (request !== this.screenRequest || channel !== this.currentAgoraChannel) throw new Error('Compartilhamento cancelado.')
            await this.screenClient.publish(track)
            if (request !== this.screenRequest || channel !== this.currentAgoraChannel) throw new Error('Compartilhamento cancelado.')
            this.screenTrack = track
            mediaTrack.addEventListener('ended', () => { void this.stopScreenShare() }, { once: true })
            signal.emit('screen-share-changed', true)
        } catch (error) {
            if (this.screenClient.connectionState === 'CONNECTED') await this.screenClient.leave().catch(() => {})
            track?.close()
            stream?.getTracks().forEach(track => track.stop())
            throw error
        } finally { this.screenStarting = false }
    }

    public async stopScreenShare() {
        this.screenRequest++
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

    public async joinChannel(channel: string, uid: string, realmId: string, roomIndex: number) {
        const key = `${roomIndex}:${channel}`
        const request = ++this.channelRequest
        if (this.channelTimeout) {
            clearTimeout(this.channelTimeout)
        }
        this.channelTimeout = setTimeout(() => {
            this.channelOperation = this.channelOperation.then(async () => {
                if (request !== this.channelRequest || (key === this.currentChannel && this.isConnected)) return
                const uniqueChannelId = this.createUniqueChannelId(realmId, roomIndex, channel)
                const token = await generateToken(uniqueChannelId, uid)
                if (request !== this.channelRequest) return
                if (!token) {
                    await this.stopScreenShare()
                    await this.client.leave().catch(() => {})
                    this.currentChannel = ''
                    this.currentAgoraChannel = ''
                    this.currentUid = ''
                    this.resetRemoteUsers()
                    signal.emit('video-channel-left')
                    signal.emit('video-channel-failed')
                    signal.emit('officeFeedback', { message: 'A chamada está indisponível ou você já saiu desta conversa.' })
                    return
                }
                this.screenRequest++
                if (this.screenClient.connectionState !== 'DISCONNECTED') await this.screenClient.leave()
                if (this.client.connectionState !== 'DISCONNECTED') await this.client.leave()
                if (request !== this.channelRequest) return
                this.resetRemoteUsers()
                await this.client.join(process.env.NEXT_PUBLIC_AGORA_APP_ID!, uniqueChannelId, token, uid)
                if (request !== this.channelRequest) { await this.client.leave().catch(() => {}); return }
                this.currentChannel = key
                this.currentAgoraChannel = uniqueChannelId
                this.currentUid = uid
                if (this.microphoneTrack && this.microphoneTrack.enabled) await this.client.publish([this.microphoneTrack])
                if (this.cameraTrack && this.cameraTrack.enabled) await this.client.publish([this.cameraTrack])
                if (request !== this.channelRequest) { await this.client.leave().catch(() => {}); return }
                if (this.screenTrack) {
                    try {
                        const screenUid = `${uid}-screen`
                        const screenToken = await generateToken(uniqueChannelId, screenUid)
                        if (request !== this.channelRequest || !this.screenTrack) return
                        if (!screenToken) throw new Error('Screen token unavailable')
                        await this.screenClient.join(process.env.NEXT_PUBLIC_AGORA_APP_ID!, uniqueChannelId, screenToken, screenUid)
                        if (request !== this.channelRequest || !this.screenTrack) { await this.screenClient.leave().catch(() => {}); return }
                        await this.screenClient.publish(this.screenTrack)
                    } catch (error) {
                        console.error('Failed to move screen share to new conversation', error)
                        await this.stopScreenShare()
                        signal.emit('officeFeedback', { message: 'O compartilhamento de tela foi encerrado ao mudar de conversa.' })
                    }
                }
            }).catch(async error => {
                if (request !== this.channelRequest) return
                await this.stopScreenShare()
                await this.client.leave().catch(() => {})
                this.currentChannel = ''
                this.currentAgoraChannel = ''
                this.currentUid = ''
                this.resetRemoteUsers()
                signal.emit('video-channel-left')
                signal.emit('video-channel-failed')
                console.error('Failed to join video conversation', error)
                signal.emit('officeFeedback', { message: 'Não foi possível entrar na chamada de vídeo.' })
            })
        }, 1000)
    }

    public async leaveChannel() {
        const request = ++this.channelRequest
        if (this.channelTimeout) {
            clearTimeout(this.channelTimeout)
        }

        this.channelTimeout = setTimeout(() => {
            this.channelOperation = this.channelOperation.then(async () => {
                if (request !== this.channelRequest) return
                await this.stopScreenShare()
                if (this.client.connectionState !== 'DISCONNECTED') await this.client.leave().catch(() => {})
                this.currentChannel = ''
                this.currentAgoraChannel = ''
                this.currentUid = ''
                this.resetRemoteUsers()
                signal.emit('video-channel-left')
            }).catch(() => { signal.emit('officeFeedback', { message: 'Não foi possível encerrar a chamada. Recarregue o escritório.' }) })
        }, 1000)
        
    }

    public destroy() {
        this.lifecycle++
        this.channelRequest++
        this.screenRequest++
        this.stopDeviceMonitoring?.()
        if (this.channelTimeout) clearTimeout(this.channelTimeout)
        if (this.screenTrack) {
            this.screenTrack.close()
            this.screenTrack = null
            signal.emit('screen-share-changed', false)
        }
        if (this.screenClient.connectionState === 'CONNECTED') void this.screenClient.leave().catch(() => {})
        if (this.client.connectionState === 'CONNECTED') void this.client.leave().catch(() => {})
        for (const user of Object.values(this.remoteUsers)) user.audioTrack?.stop()
        this.currentChannel = ''
        this.currentAgoraChannel = ''
        this.currentUid = ''
        this.cameraElementId = 'local-video'
        this.resetRemoteUsers()
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

    private createUniqueChannelId(realmId: string, roomIndex: number, channel: string): string {
        const combined = `${realmId}-${roomIndex}-${channel}`;
        return createHash('md5').update(combined).digest('hex').substring(0, 16);
    }
}

export const videoChat = new VideoChat()
