export function getLightDescriptors(objects) {
    return objects.filter(object => object.kind === 'light' && object.config && 'radiusTiles' in object.config).map(object => ({
        id: object.id,
        x: (object.bounds.x + object.bounds.width / 2) * 32,
        y: (object.bounds.y + object.bounds.height / 2) * 32,
        radius: Math.max(1, Math.min(30, object.config.radiusTiles)) * 32,
        color: Number.parseInt(object.config.color.replace('#', ''), 16),
        intensity: Math.max(0, Math.min(1, object.config.intensity)),
    }))
}

export function lightingStrength(presentationActive, lightCount) {
    return { shade: presentationActive ? 0.3 : lightCount ? 0.04 : 0, glow: presentationActive ? 0.45 : 1 }
}
