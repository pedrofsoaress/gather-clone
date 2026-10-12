import { NextRequest, NextResponse } from 'next/server'

// The office is served from more than one address (online.matteia.com and the
// vercel.app one) while the backend allows a single origin. Browser requests go
// through this same-origin route so every address can read the player list.
const ALLOWED = new Set(['getPlayersInRoom', 'getPlayerCounts'])

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { endpoint: string } }) {
    if (!ALLOWED.has(params.endpoint)) return NextResponse.json({ message: 'Not found' }, { status: 404 })
    const target = `${process.env.NEXT_PUBLIC_BACKEND_URL}/${params.endpoint}${request.nextUrl.search}`
    const authorization = request.headers.get('authorization')
    try {
        const response = await fetch(target, { headers: authorization ? { Authorization: authorization } : {}, cache: 'no-store' })
        const body = await response.text()
        return new NextResponse(body, { status: response.status, headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store' } })
    } catch {
        return NextResponse.json({ message: 'Backend unavailable' }, { status: 502 })
    }
}
