/** @type {import('next').NextConfig} */
const nextConfig = {
    skipTrailingSlashRedirect: true,
    images: {
        domains: ['lh3.googleusercontent.com'],
    },
    async rewrites() {
        const proxy = process.env.LOCAL_BACKEND_PROXY
        return proxy ? [{ source: '/socket.io', destination: `${proxy}/socket.io/` }] : []
    },
};

module.exports = nextConfig;
