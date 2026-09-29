/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        domains: ['lh3.googleusercontent.com'],
    },
    async rewrites() {
        return process.env.NODE_ENV === 'development'
            ? [
                { source: '/socket.io', destination: 'http://localhost:3001/socket.io/' },
                { source: '/socket.io/:path*', destination: 'http://localhost:3001/socket.io/:path*' },
                { source: '/getPlayersInRoom', destination: 'http://localhost:3001/getPlayersInRoom' },
                { source: '/getPlayerCounts', destination: 'http://localhost:3001/getPlayerCounts' },
            ]
            : []
    },
};

module.exports = nextConfig;
