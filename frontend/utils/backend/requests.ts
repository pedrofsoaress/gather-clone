export async function request(url: string, params: Record<string, any> = {}, access_token?: string) {

    if (url.startsWith('/')) {
        url = url.substring(1)
    }

    const queryString = new URLSearchParams(params).toString()
    // In the browser, go through the site's own address (see app/api/backend): the backend accepts one origin only.
    const base = typeof window === 'undefined' ? process.env.NEXT_PUBLIC_BACKEND_URL : '/api/backend'
    const fullUrl = `${base}/${url}${queryString ? '?' + queryString : ''}`

    const headers = new Headers();
    if (access_token) {
        headers.append('Authorization', `Bearer ${access_token}`);
    }

    try {
        const response = await fetch(fullUrl, { headers })

        if (!response.ok) {
            const error = await response.json()
            return { data: null, error }
        }

        const data = await response.json()
        return { data, error: null }
    } catch (err) {
        if (err instanceof Error) {
            return { data: null, error: err.message }
        } else {
            return { data: null, error: 'An unknown error occurred.' }
        }
    }
}
