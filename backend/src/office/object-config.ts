import type { RealmData } from '../session'
import { z } from 'zod'

const external = z.object({ url: z.string().url().startsWith('https://'), allowedHosts: z.array(z.string().min(1)).min(1).max(12), roomEditable: z.boolean() }).strict()
const presentation = z.object({ deckId: z.string().min(1).max(128), slides: z.array(z.object({ title: z.string().min(1).max(80), body: z.string().max(2000).optional(), imageUrl: z.string().url().startsWith('https://').optional() }).strict()).min(1).max(40) }).strict()
const speaker = z.object({ rangeTiles: z.number().int().min(1).max(40) }).strict()
const pet = z.object({ animationSet: z.string().min(1).max(48) }).strict()
const light = z.object({ radiusTiles: z.number().int().min(1).max(20), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), intensity: z.number().min(0).max(1) }).strict()

export function validateOfficeMap(map: RealmData): void {
  for (const room of map.rooms) {
    const ids = new Set<string>()
    for (const object of room.interactions ?? []) {
      if (ids.has(object.id)) throw new Error(`Duplicate office object: ${object.id}`)
      ids.add(object.id)
      if (!['external', 'presentation', 'speaker', 'pet', 'light'].includes(object.kind)) continue
      const config = object.config
      const valid = object.kind === 'external' ? external.safeParse(config).success
        : object.kind === 'presentation' ? presentation.safeParse(config).success
        : object.kind === 'speaker' ? speaker.safeParse(config).success
        : object.kind === 'pet' ? pet.safeParse(config).success
        : light.safeParse(config).success
      if (!valid) throw new Error(`Invalid office object configuration: ${object.id}`)
      if (object.kind === 'external') {
        const details = external.parse(config)
        if (!details.allowedHosts.includes(new URL(details.url).hostname)) throw new Error(`Unapproved office host: ${object.id}`)
      }
      const point = room.tilemap[`${object.approach.x}, ${object.approach.y}`]
      if (!point || point.impassable) throw new Error(`Unreachable office object: ${object.id}`)
      if (!Number.isInteger(object.bounds.x) || !Number.isInteger(object.bounds.y) || object.bounds.width < 1 || object.bounds.height < 1) throw new Error(`Invalid office object bounds: ${object.id}`)
      for (let x = object.bounds.x; x < object.bounds.x + object.bounds.width; x++) {
        for (let y = object.bounds.y; y < object.bounds.y + object.bounds.height; y++) {
          if (!room.tilemap[`${x}, ${y}`]) throw new Error(`Office object outside map: ${object.id}`)
        }
      }
    }
  }
}
