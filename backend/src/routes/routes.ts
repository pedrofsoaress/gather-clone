import { Router } from 'express'
import { GetPlayersInRoom, GetServerName, IsOwnerOfServer, UserIsInGuild, GetChannelName, GetPlayerCounts } from './route-types'
import { supabase } from '../supabase'
import { z } from 'zod'
import { sessionManager } from '../session'
import { authorizeConversation } from '../office/ConversationAuthorization'

export default function routes(): Router {
    const router = Router()

    router.get('/conversationAuthorization', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store')
        const token = req.headers.authorization?.split(' ')[1]
        const parsed = z.object({ channel: z.string().regex(/^[0-9a-f]{16}$/), uid: z.string().min(1).max(64) }).safeParse(req.query)
        if (!token || !parsed.success) return res.status(400).json({ error: 'Pedido inválido.' })
        try {
            const { data, error } = await supabase.auth.getUser(token)
            if (error || !data.user) return res.status(401).json({ error: 'Sessão inválida.' })
            const authorization = authorizeConversation(sessionManager.getPlayerSession(data.user.id), data.user.id, parsed.data.channel, parsed.data.uid)
            if (!authorization) return res.status(403).json({ error: 'Você não participa desta conversa.' })
            return res.json(authorization)
        } catch { return res.status(503).json({ error: 'Não foi possível validar a chamada.' }) }
    })

    router.get('/speakerAuthorization', async (req, res) => {
        const token = req.headers.authorization?.split(' ')[1]
        const parsed = z.object({ objectId: z.string().min(1).max(64), publish: z.enum(['true', 'false']) }).safeParse(req.query)
        if (!token || !parsed.success) return res.status(400).json({ error: 'Pedido inválido.' })
        const { data, error } = await supabase.auth.getUser(token)
        if (error || !data.user) return res.status(401).json({ error: 'Sessão inválida.' })
        const session = sessionManager.getPlayerSession(data.user.id)
        const authorization = session?.featuresFor(data.user.id).speakers.authorize(data.user.id, parsed.data.objectId, parsed.data.publish === 'true')
        if (!authorization) return res.status(403).json({ error: 'Você está fora da área da caixa de som.' })
        res.setHeader('Cache-Control', 'no-store')
        return res.json(authorization)
    })

    router.get('/getPlayersInRoom', async (req, res) => {
        const access_token = req.headers.authorization?.split(' ')[1];

        if (!access_token) {
            return res.status(401).json({ message: 'No access token provided' });
        }

        const params = req.query as unknown as z.infer<typeof GetPlayersInRoom>
        if (!GetPlayersInRoom.safeParse(params).success) {
            return res.status(400).json({ message: 'Invalid parameters' })
        }

        const { data: user, error: error } = await supabase.auth.getUser(access_token)

        if (error) {
            return res.status(401).json({ message: 'Invalid access token' })
        }

        const session = sessionManager.getPlayerSession(user.user.id)
        if (!session) {
            return res.status(400).json({ message: 'User not in a realm.' })
        }

        const players = session.getPlayersInRoom(params.roomIndex)
        return res.json({ players })
    })

    router.get('/getPlayerCounts', async (req, res) => {
        const access_token = req.headers.authorization?.split(' ')[1];

        if (!access_token) {
            return res.status(401).json({ message: 'No access token provided' });
        }

        let params = req.query as unknown as z.infer<typeof GetPlayerCounts>
        const parseResults = GetPlayerCounts.safeParse(params)
        if (!parseResults.success) {
            return res.status(400).json({ message: 'Invalid parameters' })
        }

        params = parseResults.data

        if (params.realmIds.length > 100) {
            return res.status(400).json({ message: 'Too many server IDs' })
        }

        const { data: user, error: error } = await supabase.auth.getUser(access_token)

        if (error) {
            return res.status(401).json({ message: 'Invalid access token' })
        }

        const playerCounts: number[] = []
        for (const realmId of params.realmIds) {
            const session = sessionManager.getSession(realmId)
            if (session) {
                const playerCount = session.getPlayerCount()

                playerCounts.push(playerCount)
            } else {
                playerCounts.push(0)
            }
        }

        return res.json({ playerCounts })
    })

    return router
}
