import { z } from 'zod'

const TeleporterSchema = z.object({
  roomIndex: z.number(),
  x: z.number(),
  y: z.number(),
})

const TileSchema = z.object({
  floor: z.string().optional(),
  above_floor: z.string().optional(),
  object: z.string().optional(),
  impassable: z.boolean().optional(),
  teleporter: TeleporterSchema.optional(),
  privateAreaId: z.string().optional(),
})

const TileMapSchema = z.record(z.string().regex(/^(-?\d+), (-?\d+)$/), TileSchema)

const ExternalConfigSchema = z.object({
  url: z.string().url().startsWith('https://'),
  allowedHosts: z.array(z.string().min(1)).min(1).max(12),
  roomEditable: z.boolean(),
}).strict().refine(config => {
  try {
    return config.allowedHosts.includes(new URL(config.url).hostname)
  } catch {
    return false
  }
}, 'O domínio da URL precisa estar na lista permitida.')

const ObjectConfigSchema = z.union([
  ExternalConfigSchema,
  z.object({ deckId: z.string().min(1).max(128) }).strict(),
  z.object({ rangeTiles: z.number().int().min(1).max(40) }).strict(),
  z.object({ animationSet: z.string().min(1).max(48) }).strict(),
  z.object({ radiusTiles: z.number().int().min(1).max(20), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), intensity: z.number().min(0).max(1) }).strict(),
])

export const OfficeObjectSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(['guide', 'seat', 'desk', 'board', 'drink', 'snack', 'guestbook', 'pingpong', 'external', 'presentation', 'speaker', 'pet', 'light']),
  label: z.string().min(1).max(48),
  bounds: z.object({
    x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative(),
    width: z.number().finite().positive(), height: z.number().finite().positive(),
  }),
  approach: z.object({ x: z.number().int(), y: z.number().int() }),
  seatVisual: z.object({
    x: z.number(), y: z.number(),
    facing: z.enum(['up', 'down', 'left', 'right']).optional(),
  }).optional(),
  effect: z.enum(['coffee', 'water', 'snack']).optional(),
  config: ObjectConfigSchema.optional(),
}).superRefine((object, context) => {
  const config = object.config
  const valid = object.kind === 'external' ? Boolean(config && 'url' in config)
    : object.kind === 'presentation' ? Boolean(config && 'deckId' in config)
    : object.kind === 'speaker' ? Boolean(config && 'rangeTiles' in config)
    : object.kind === 'pet' ? Boolean(config && 'animationSet' in config)
    : object.kind === 'light' ? Boolean(config && 'radiusTiles' in config)
    : !config
  if (!valid) context.addIssue({ code: z.ZodIssueCode.custom, path: ['config'], message: 'Configuração incompatível com o objeto.' })
  if (['external', 'presentation', 'speaker', 'pet', 'light'].includes(object.kind) &&
      !Object.values(object.bounds).every(Number.isInteger)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['bounds'], message: 'Novos objetos precisam de área em tiles inteiros.' })
  }
})

const RoomSchema = z.object({
  name: z.string(),
  tilemap: TileMapSchema,
  channelId: z.string().optional(),
  backgroundImage: z.object({
    src: z.string().startsWith('/'),
    width: z.number().positive(),
    height: z.number().positive(),
  }).optional(),
  interactions: z.array(OfficeObjectSchema).optional(),
}).superRefine((room, context) => {
  const ids = new Set<string>()
  for (const [index, object] of (room.interactions ?? []).entries()) {
    if (ids.has(object.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['interactions', index, 'id'], message: 'IDs de objetos precisam ser únicos.' })
    ids.add(object.id)
    if (!['external', 'presentation', 'speaker', 'pet', 'light'].includes(object.kind)) continue
    const tile = room.tilemap[`${object.approach.x}, ${object.approach.y}`]
    if (!tile || tile.impassable) context.addIssue({ code: z.ZodIssueCode.custom, path: ['interactions', index, 'approach'], message: 'A aproximação deve estar em um piso acessível.' })
    for (let x = object.bounds.x; x < object.bounds.x + object.bounds.width; x++) {
      for (let y = object.bounds.y; y < object.bounds.y + object.bounds.height; y++) {
        if (!room.tilemap[`${x}, ${y}`]) context.addIssue({ code: z.ZodIssueCode.custom, path: ['interactions', index, 'bounds'], message: 'O objeto precisa caber no mapa.' })
      }
    }
  }
})

const SpawnpointSchema = z.object({
  roomIndex: z.number(),
  x: z.number(),
  y: z.number(),
})

const RealmDataSchema = z.object({
  spawnpoint: SpawnpointSchema,
  rooms: z.array(RoomSchema),
})

export { RealmDataSchema, RoomSchema }
