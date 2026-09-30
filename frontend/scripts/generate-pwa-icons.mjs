import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

// Original Matte monogram. The complete mark fits inside the maskable safe circle.
const mark = [[136, 344], [136, 152], [184, 152], [256, 244], [328, 152], [376, 152], [376, 344], [328, 344], [328, 232], [256, 320], [184, 232], [184, 344]]
const output = fileURLToPath(new URL('../public/pwa/', import.meta.url))
mkdirSync(output, { recursive: true })

function inside(x, y, points) {
    let result = false
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i]
        const [xj, yj] = points[j]
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) result = !result
    }
    return result
}

function colorAt(x, y) {
    if (inside(x, y, mark)) return [0, 212, 178, 255]
    if (x >= 176 && x < 336 && y >= 374 && y < 394) return [242, 248, 255, 255]
    return [25, 30, 50, 255]
}

function crc32(bytes) {
    let crc = 0xffffffff
    for (const byte of bytes) {
        crc ^= byte
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
    return (crc ^ 0xffffffff) >>> 0
}

function chunk(name, data) {
    const typeAndData = Buffer.concat([Buffer.from(name), data])
    const header = Buffer.alloc(4)
    const checksum = Buffer.alloc(4)
    header.writeUInt32BE(data.length)
    checksum.writeUInt32BE(crc32(typeAndData))
    return Buffer.concat([header, typeAndData, checksum])
}

function png(size) {
    const raw = Buffer.alloc(size * (size * 4 + 1))
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const color = [0, 0, 0, 0]
        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
            const sample = colorAt((x + (sx + .5) / 4) * 512 / size, (y + (sy + .5) / 4) * 512 / size)
            sample.forEach((value, channel) => { color[channel] += value / 16 })
        }
        const offset = y * (size * 4 + 1) + 1 + x * 4
        color.forEach((value, channel) => { raw[offset + channel] = Math.round(value) })
    }
    const header = Buffer.alloc(13)
    header.writeUInt32BE(size, 0)
    header.writeUInt32BE(size, 4)
    header[8] = 8
    header[9] = 6
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

for (const size of [180, 192, 512]) writeFileSync(`${output}${size === 180 ? 'apple-touch-icon' : `icon-${size}`}.png`, png(size))
writeFileSync(`${output}matte-office.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#191e32"/><polygon points="${mark.map(p => p.join(',')).join(' ')}" fill="#00d4b2"/><path d="M176 374h160v20H176z" fill="#f2f8ff"/></svg>\n`)
