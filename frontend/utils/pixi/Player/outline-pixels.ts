/** Add one native pixel around each silhouette, without resizing or crossing atlas frames. */
export function outlinePixels(source: Uint8ClampedArray, width: number, height: number, frameSize = 48): Uint8ClampedArray {
    const output = new Uint8ClampedArray(source)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4
            if (source[offset + 3] !== 0) continue
            let alpha = 0
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const neighborX = x + dx
                    const neighborY = y + dy
                    if (neighborX < 0 || neighborY < 0 || neighborX >= width || neighborY >= height ||
                        Math.floor(neighborX / frameSize) !== Math.floor(x / frameSize) || Math.floor(neighborY / frameSize) !== Math.floor(y / frameSize)) continue
                    alpha = Math.max(alpha, source[(neighborY * width + neighborX) * 4 + 3])
                }
            }
            if (!alpha) continue
            output[offset] = 255
            output[offset + 1] = 255
            output[offset + 2] = 255
            output[offset + 3] = Math.round(alpha * 238 / 255)
        }
    }
    return output
}

export function outlineCanvas(canvas: HTMLCanvasElement, frameSize = 48): void {
    const context = canvas.getContext('2d')!
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    pixels.data.set(outlinePixels(pixels.data, canvas.width, canvas.height, frameSize))
    context.putImageData(pixels, 0, 0)
}
