'use client'

import { useEffect, useState } from 'react'
import type { OfficeSnapshot } from '@/utils/pixi/office/types'

type Game = OfficeSnapshot['games'][string]
type GameAction = 'startGame' | 'joinGame' | 'returnBall' | 'leaveGame'

export default function PingPongPanel({ game, uid, busy, onAction }: {
    game?: Game, uid: string, busy: boolean, onAction: (action: GameAction) => void,
}) {
    const [now, setNow] = useState(Date.now())
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 100)
        return () => window.clearInterval(timer)
    }, [])
    const playing = game?.status === 'playing'
    const myTurn = playing && game.turn === uid
    const joined = Boolean(game?.players.some(player => player.uid === uid))
    const seconds = game?.deadline ? Math.max(0, (game.deadline - now) / 1000).toFixed(1) : null

    useEffect(() => {
        if (!myTurn || busy) return
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.code !== 'Space' || event.repeat) return
            event.preventDefault()
            onAction('returnBall')
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [myTurn, busy, onAction])

    return <div className="mt-4 space-y-3 border-t border-slate-700 pt-4" aria-label="Pingue-pongue">
        <p className="text-sm text-slate-300">{game?.players.map(player => player.name).join(' × ') || 'Mesa livre para começar uma partida.'}</p>
        {game && <p className="text-3xl font-bold tabular-nums text-teal-200">{game.scores[0]} <span className="text-slate-400">–</span> {game.scores[1]}</p>}
        {playing && <p className="text-xs text-slate-400">Trocas nesta jogada: {game.rally}</p>}
        <p role="status" className="text-sm text-white">
            {!game ? 'Convide outra pessoa para jogar.' :
                game.status === 'waiting' ? 'Aguardando o segundo jogador.' :
                game.status === 'ended' ? `Fim da partida · ${game.players[game.scores[0] > game.scores[1] ? 0 : 1]?.name} venceu.` :
                myTurn ? `Sua vez de rebater · ${seconds}s` : `Vez de ${game.players.find(player => player.uid === game.turn)?.name ?? 'outro jogador'} · ${seconds}s`}
        </p>
        {!game || game.status === 'ended' ? <button type="button" disabled={busy} onClick={() => onAction('startGame')}
            className="w-full rounded-xl bg-teal-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-50">{game ? 'Nova partida' : 'Iniciar partida'}</button> : null}
        {game?.status === 'waiting' && !joined && <button type="button" disabled={busy} onClick={() => onAction('joinGame')}
            className="w-full rounded-xl bg-teal-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-50">Entrar na partida</button>}
        {playing && <button type="button" disabled={busy || !myTurn} onClick={() => onAction('returnBall')}
            className="w-full rounded-xl bg-amber-300 px-5 py-5 text-xl font-black text-slate-950 disabled:bg-slate-600 disabled:text-slate-300">Rebater</button>}
        {myTurn && <p className="text-center text-xs text-slate-400">Toque no botão ou pressione Espaço.</p>}
        {joined && game?.status !== 'ended' && <button type="button" disabled={busy} onClick={() => onAction('leaveGame')}
            className="rounded-lg border border-slate-500 px-3 py-2 text-sm text-slate-200 disabled:opacity-50">Sair da partida</button>}
    </div>
}
