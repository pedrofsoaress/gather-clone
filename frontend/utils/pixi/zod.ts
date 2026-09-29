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

export const OfficeObjectSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(['guide', 'seat', 'desk', 'board', 'drink', 'snack', 'guestbook', 'pingpong']),
  label: z.string().min(1).max(48),
  bounds: z.object({
    x: z.number().int(), y: z.number().int(),
    width: z.number().int().positive(), height: z.number().int().positive(),
  }),
  approach: z.object({ x: z.number().int(), y: z.number().int() }),
  seatVisual: z.object({ x: z.number(), y: z.number() }).optional(),
  effect: z.enum(['coffee', 'water', 'snack']).optional(),
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
