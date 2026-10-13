import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MapTrifold } from '@phosphor-icons/react'
import { bestGrid, sideColumnWidth } from './meeting-grid'

// Pure layout pieces of the expanded call view: no call state lives here.

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function useElementSize<T extends HTMLElement>() {
    const ref = useRef<T>(null)
    const [size, setSize] = useState({ width: 0, height: 0 })
    useIsomorphicLayoutEffect(() => {
        const element = ref.current
        if (!element) return
        const update = () => {
            const { width, height } = element.getBoundingClientRect()
            setSize(current => current.width === width && current.height === height ? current : { width, height })
        }
        update()
        const observer = new ResizeObserver(update)
        observer.observe(element)
        return () => observer.disconnect()
    }, [])
    return [ref, size] as const
}

// Height of the empty strip under the videos. The "Avisos" chip (OfficeNotifications)
// and the closed "Chat" button (OfficeChat) are placed inside it in meeting mode.
export const MEETING_BOTTOM_STRIP = 'h-16'

type MeetingShellProps = {
    personCount: number
    chatOpen: boolean
    onExit: () => void
    controls?: React.ReactNode
    children: React.ReactNode
}

export function MeetingShell({ personCount, chatOpen, onExit, controls, children }: MeetingShellProps) {
    return <div className="absolute inset-x-0 bottom-14 top-0 z-30 flex flex-col bg-[#181c2d] text-white">
        <div className={`flex min-h-0 flex-1 flex-col ${chatOpen ? 'w-full sm:w-[calc(100%-340px)]' : 'w-full'}`}>
            <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-700 pl-5 pr-3 text-sm font-semibold">
                <span className="min-w-0 truncate">Conversa por proximidade · {personCount} {personCount === 1 ? 'pessoa' : 'pessoas'}</span>
                <button type="button" onClick={onExit} className="flex shrink-0 items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 font-normal shadow-lg hover:bg-slate-700" aria-label="Visualização de mapa" title="Visualização de mapa">
                    <MapTrifold size={18} />
                    <span className="hidden min-[400px]:inline">Visualização de mapa</span>
                </button>
            </header>
            <div className="pointer-events-none flex shrink-0 justify-end px-3 pt-3 empty:hidden">{controls}</div>
            <section id="video-container" className="relative min-h-0 flex-1 overflow-hidden">
                <div className="absolute inset-3">{children}</div>
            </section>
        </div>
        <div aria-hidden="true" className={`${MEETING_BOTTOM_STRIP} shrink-0`} />
    </div>
}

// Everyone in a centered grid of 16:9 tiles sized to fit the area without scrolling.
export function MeetingGrid({ children, gap = 12 }: { children: React.ReactNode, gap?: number }) {
    const [ref, size] = useElementSize<HTMLDivElement>()
    const tiles = React.Children.toArray(children) as React.ReactElement[]
    const grid = bestGrid(tiles.length, size.width, size.height, gap)
    const rowWidth = grid.columns * grid.tileWidth + Math.max(0, grid.columns - 1) * gap
    return <div ref={ref} className="flex h-full w-full items-center justify-center overflow-hidden">
        <div className="flex flex-wrap content-center justify-center" style={{ width: rowWidth, gap }}>
            {tiles.map(tile => <div key={tile.key} className="relative shrink-0" style={{ width: grid.tileWidth, height: grid.tileHeight }}>{tile}</div>)}
        </div>
    </div>
}

// A shared screen or presentation with people next to it (a column on wide areas,
// a row below it on narrow ones). The people scroll only when they do not fit.
export function MeetingStage({ main, children, gap = 8 }: { main: React.ReactNode, children: React.ReactNode, gap?: number }) {
    const [ref, size] = useElementSize<HTMLDivElement>()
    const tiles = React.Children.toArray(children) as React.ReactElement[]
    const wide = size.width >= 760
    const sideWidth = sideColumnWidth(tiles.length, size.width, size.height, gap)
    const rowHeight = Math.max(72, Math.min(120, Math.floor(size.height * 0.2)))
    return <div ref={ref} className={`flex h-full w-full gap-3 ${wide ? 'flex-row' : 'flex-col'}`}>
        <div className="relative min-h-0 min-w-0 flex-1">{main}</div>
        <div className={`flex shrink-0 ${wide ? 'flex-col overflow-y-auto' : 'overflow-x-auto [&>*:first-child]:ml-auto [&>*:last-child]:mr-auto'}`} style={wide ? { width: sideWidth, gap } : { height: rowHeight, gap }}>
            {tiles.map(tile => <div key={tile.key} className={`relative aspect-video shrink-0 ${wide ? 'w-full' : 'h-full'}`}>{tile}</div>)}
        </div>
    </div>
}
