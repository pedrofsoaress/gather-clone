# Interactive Matte Office Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o escritório público da Matte em um mapa com móveis utilizáveis, ações visíveis e estados compartilhados entre visitantes, mantendo o link atual.

**Architecture:** Os objetos ficam descritos no `map_data` como hotspots em coordenadas de tiles, separados da imagem de fundo. PixiJS cuida de descoberta, caminho, realce e efeitos; React apresenta painéis acessíveis; Socket.io valida ações e sincroniza ocupação e jogo; Supabase persiste notas e livro de visitas. O backend é a fonte da verdade para estado compartilhado.

**Tech Stack:** Next.js 14/React 18, PixiJS 8, TypeScript 5, Socket.io 4, Node.js 22, Supabase Postgres, testes nativos `node:test`, Vercel e Render existentes.

**Spec:** `docs/superpowers/specs/2026-09-29-interactive-matte-office.md`

## Global Constraints

- Preservar o escritório e o URL público `https://gather-clone-beta.vercel.app/play/0d778bfd-8e16-49bc-832f-3aa60c5bef0c?shareId=f2ac1499-532e-47aa-9244-5b48f8926283`.
- Os 22 objetos funcionais da especificação devem ter clique/toque, tecla `E`, realce e resposta visual; plantas, paredes, pisos e quadros decorativos não são ações.
- Não adicionar serviços, pacotes de produção ou variáveis secretas no cliente; a chave Supabase de serviço fica apenas no backend.
- Preservar vídeo por proximidade e áudio privado da sala de reunião.
- Textos de interface em português brasileiro; nomes de APIs e arquivos seguem o estilo existente do repositório.
- Novas tabelas em `public` têm RLS ativo e `anon`/`authenticated` sem acesso direto; o backend valida a sessão antes de usar a chave de serviço.
- Cada task termina com um teste útil e um commit; `frontend` e `backend` precisam compilar antes da publicação.

## Review Focus

1. Clique fora do mapa ou em decoração: não iniciar busca infinita nem abrir painel — teste de geometria na Task 1.
2. Hotspot com ponto de aproximação bloqueado ou inacessível: rejeitar a ação com mensagem, sem atravessar móvel — teste de caminho na Task 2.
3. Dois visitantes tentando ocupar a mesma cadeira quase juntos: apenas uma confirmação e o mesmo ocupante para ambos — teste de concorrência na Task 3.
4. Evento Socket.io forjado com ID inexistente, jogador distante ou texto grande: rejeitar sem alterar estado — testes das Tasks 3 e 4.
5. Desconexão, atualização da página ou reinício do Render durante nota/partida: assentos liberados, jogo encerrado, notas preservadas e erro legível — testes das Tasks 3, 4 e 5.

---

## File structure and interfaces

| File | Responsibility |
| --- | --- |
| `scripts/matte-office-map.mjs` | Fonte dos 22 hotspots e seus pontos de aproximação; preserva tilemap, imagem e spawn. |
| `frontend/utils/pixi/zod.ts` | Valida `Room.interactions` recebido no navegador. |
| `frontend/utils/pixi/office/geometry.ts` | Hit test, distância, limites e escolha de objeto próximo; sem Pixi/React. |
| `frontend/utils/pixi/office/InteractionLayer.ts` | Contorno, cursor, nome e efeitos desenhados sobre a imagem. |
| `frontend/utils/pixi/PlayApp.ts`, `Player/Player.ts` | Inicia caminho até objeto, cancela ação pendente e abre ação ao chegar. |
| `frontend/app/play/OfficeHud.tsx` | Instrução `E`, painel acessível e adaptação a toque. |
| `frontend/app/play/OfficeBoard.tsx` | Quadro compartilhado e livro de visitas. |
| `frontend/app/play/PingPongPanel.tsx` | Desafio, rebater e placar para dois jogadores. |
| `backend/src/office/OfficeState.ts` | Ocupação e partida temporárias, validação de distância e transições. |
| `backend/src/office/OfficeNotes.ts` | Leitura/gravação de mensagens persistentes. |
| `backend/src/sockets/socket-types.ts`, `sockets.ts` | Contrato e handlers Socket.io, com confirmação/erro. |
| `supabase/migrations/` (arquivo criado por `supabase migration new office_notes`) | Tabela, limites, índice, RLS e grants. |

Contrato de objeto, igual no frontend e no backend:

```ts
type OfficeObject = {
  id: string
  kind: 'guide' | 'seat' | 'desk' | 'board' | 'drink' | 'snack' | 'guestbook' | 'pingpong'
  label: string
  bounds: { x: number; y: number; width: number; height: number } // tiles, origem inclusiva
  approach: { x: number; y: number } // tile caminhável
  seatVisual?: { x: number; y: number } // centro do assento pintado, apenas para renderização
  effect?: 'coffee' | 'water' | 'snack'
}
```

Eventos: `officeStep({x,y}, ack)`, `officeGetSnapshot(ack)`, `officeAction({objectId, action}, ack)`, `officeReadNotes({objectId}, ack)`, `officeAddNote({objectId, body}, ack)`, `officeStateChanged`, `officeNoteCreated`. `ack` sempre contém `{ok:boolean,error?:string,...}`. Mensagens públicas são texto simples; nunca HTML.

## Task 1: Catálogo de objetos e geometria verificável

**Files:** Modify `scripts/matte-office-map.mjs`, `frontend/utils/pixi/zod.ts`, `frontend/utils/pixi/types.ts`, `backend/src/session.ts`; create `frontend/utils/pixi/office/geometry.ts`, `frontend/utils/pixi/office/geometry.test.mjs`, `scripts/matte-office-map.test.mjs`.

**Interfaces:** Consumes o tilemap 50×30 e `bfs` existente. Produces `OfficeObject`, `findObjectAt(objects,x,y)`, `nearestObject(objects,x,y,maxDistance)`, `isWithinMap(x,y,width,height)` e `Room.interactions`.

- [ ] **Step 1: Add the 22 hotspots to a failing map audit.** Create `scripts/matte-office-map.test.mjs` with `node:test`; assert the exact IDs below, uniqueness, bounds inside 50×30, unblocked approaches and BFS reachability from `(25,18)`.

```js
const ids = ['lounge-books','lounge-sofa','boardroom-table','coffee','water','vending','kitchen-table',
  'desk-left-1','desk-left-2','desk-left-3','desk-left-4','desk-right-1','desk-right-2','desk-right-3','desk-right-4',
  'project-table','workshop-shelves','workbench','reception','reception-seats','pingpong','games-sofa']
assert.deepEqual(map.rooms[0].interactions.map(item => item.id), ids)
const reachableFromSpawn = new Set(['25, 18'])
const queue = [[25, 18]]
for (let i = 0; i < queue.length; i++) {
  const [x, y] = queue[i]
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const next = `${x + dx}, ${y + dy}`
    if (map.rooms[0].tilemap[next] && !map.rooms[0].tilemap[next].impassable && !reachableFromSpawn.has(next)) {
      reachableFromSpawn.add(next)
      queue.push([x + dx, y + dy])
    }
  }
}
for (const item of map.rooms[0].interactions) {
  assert.ok(item.bounds.x >= 0 && item.bounds.y >= 0)
  assert.ok(item.bounds.x + item.bounds.width <= 50 && item.bounds.y + item.bounds.height <= 30)
  assert.notEqual(map.rooms[0].tilemap[`${item.approach.x}, ${item.approach.y}`]?.impassable, true)
  assert.ok(reachableFromSpawn.has(`${item.approach.x}, ${item.approach.y}`))
}
```

- [ ] **Step 2: Run `node --test scripts/matte-office-map.test.mjs`; expect FAIL because `interactions` is absent.**
- [ ] **Step 3: Add `interactions` to the generator and schema.** Use these exact data rows (`id : kind : x,y,w,h : approach`); `effect` is the matching name for `coffee`, `water`, `vending` (`snack`).

```text
lounge-books:guide:2,1,8,3:10,3       lounge-sofa:seat:5,4,6,3:11,6
boardroom-table:board:21,3,8,5:25,8  coffee:drink:35,1,7,4:35,5
water:drink:41,1,2,4:42,5             vending:snack:43,1,5,4:46,5
kitchen-table:seat:37,5,5,3:37,8      desk-left-1:desk:5,11,5,2:7,13
desk-left-2:desk:11,11,5,2:13,13      desk-left-3:desk:5,14,5,2:7,16
desk-left-4:desk:11,14,5,2:13,16      desk-right-1:desk:35,11,5,2:37,13
desk-right-2:desk:41,11,5,2:43,13     desk-right-3:desk:35,14,5,2:37,16
desk-right-4:desk:41,14,5,2:43,16     project-table:board:22,12,7,4:25,16
workshop-shelves:guide:2,19,4,3:6,20 workbench:board:5,22,7,3:8,25
reception:guestbook:21,20,8,3:25,19  reception-seats:seat:22,23,7,3:25,26
pingpong:pingpong:35,21,4,5:34,23    games-sofa:seat:42,21,6,3:42,24
```

Use estes rótulos na mesma ordem: `Estante do lounge`, `Sofá do lounge`, `Mesa da reunião`, `Café`, `Água`, `Máquina de snacks`, `Mesa da cozinha`, `Mesa esquerda 1`, `Mesa esquerda 2`, `Mesa esquerda 3`, `Mesa esquerda 4`, `Mesa direita 1`, `Mesa direita 2`, `Mesa direita 3`, `Mesa direita 4`, `Mesa de projetos`, `Prateleiras da oficina`, `Bancada de ideias`, `Recepção`, `Poltronas da recepção`, `Pingue-pongue`, `Sofá dos jogos`. `seatVisual` para os assentos: `lounge-sofa` `(8,5)`, `kitchen-table` `(39,6)`, `reception-seats` `(25,24)`, `games-sofa` `(44,22)`; nas oito mesas, usar o respectivo `approach`. Assim o local de sentar é separado do tile caminhável.

```ts
const OfficeObjectSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(['guide','seat','desk','board','drink','snack','guestbook','pingpong']),
  label: z.string().min(1).max(48),
  bounds: z.object({ x:z.number().int(), y:z.number().int(), width:z.number().int().positive(), height:z.number().int().positive() }),
  approach: z.object({ x:z.number().int(), y:z.number().int() }),
  seatVisual: z.object({ x:z.number(), y:z.number() }).optional(),
  effect: z.enum(['coffee','water','snack']).optional(),
})
// RoomSchema: interactions: z.array(OfficeObjectSchema).optional()
export type OfficeObject = z.infer<typeof OfficeObjectSchema>
```

- [ ] **Step 4: Write failing geometry tests and implement the pure helpers.** A point on a boundary belongs to one hotspot; outside coordinates and decoration return `null`; `nearestObject` selects the lowest Manhattan distance to `approach`, then lexical ID on ties.

```ts
export function findObjectAt(objects: OfficeObject[], x: number, y: number): OfficeObject | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return objects.find(o => x >= o.bounds.x && x < o.bounds.x + o.bounds.width &&
    y >= o.bounds.y && y < o.bounds.y + o.bounds.height) ?? null
}
export const isWithinMap = (x:number,y:number,w:number,h:number) =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < w && y < h
export function nearestObject(objects: OfficeObject[], x:number, y:number, maxDistance:number): OfficeObject | null {
  return objects.map(object => ({object, distance:Math.abs(object.approach.x-x)+Math.abs(object.approach.y-y)}))
    .filter(item => item.distance <= maxDistance)
    .sort((a,b) => a.distance-b.distance || a.object.id.localeCompare(b.object.id))[0]?.object ?? null
}
```

- [ ] **Step 5: Run `node --experimental-strip-types --test frontend/utils/pixi/office/geometry.test.mjs scripts/matte-office-map.test.mjs`, `yarn build` in `frontend`, and `yarn build` in `backend`; expect PASS.** Commit: `git add ... && git commit -m "feat: define interactive Matte office objects"`.

## Task 2: Realce, caminho e painel de interação

**Files:** Create `frontend/utils/pixi/office/InteractionLayer.ts`, `frontend/utils/pixi/office/approach.mjs`, `frontend/utils/pixi/office/approach.test.mjs`, `frontend/app/play/OfficeHud.tsx`; modify `frontend/utils/pixi/PlayApp.ts`, `frontend/utils/pixi/Player/Player.ts`, `frontend/app/play/PlayClient.tsx`, `frontend/app/play/PixiApp.tsx`.

**Interfaces:** Consumes `Room.interactions` and `findObjectAt`. Produces `PlayApp.requestOfficeObject(id): boolean`, `PlayApp.onLocalPlayerStopped(): void`, signals `officeOpen({objectId})`, `officeFeedback({message})`, and `officeNearby({objectId|null})`.

- [ ] **Step 1: Write an approach test.** A blocked/unreachable `approach` returns false; a valid path returns true; a second move cancels the first pending object.

```js
assert.equal(canApproach({x:25,y:18}, {x:25,y:16}, blocked, () => [[25,17],[25,16]]), true)
assert.equal(canApproach({x:25,y:18}, {x:25,y:21}, blocked, () => null), false)
assert.equal(nextPendingAfterMove('coffee', 'free-tile'), null)
```

- [ ] **Step 2: Run `node --experimental-strip-types --test frontend/utils/pixi/office/approach.test.mjs`; expect FAIL.**
- [ ] **Step 3: Add helpers and wire the player stop callback.** Make `Player.moveToTile(x,y)` return `boolean` (false for no path); call `this.playApp.onLocalPlayerStopped()` from `Player.stop()` only for the local player. `PlayApp.requestOfficeObject` checks the ID and path before storing `pendingOfficeObjectId`; ordinary clicks and direction keys clear it. On stop, open only if the avatar is at the exact approach tile. When a panel is open, existing `disableInput` prevents movement; ignore arrow/WASD/E when focus is on `input`, `textarea`, or `contenteditable`.

```js
export function canApproach(start, end, blocked, findPath) {
  if (blocked.has(`${end.x}, ${end.y}`)) return false
  if (start.x === end.x && start.y === end.y) return true
  return (findPath([start.x,start.y], [end.x,end.y], blocked)?.length ?? 0) > 0
}
export function nextPendingAfterMove(pendingObjectId, source) {
  return source === 'interaction' ? pendingObjectId : null
}
```

```ts
const target = this.realmData.rooms[this.currentRoomIndex].interactions?.find(o => o.id === id)
if (target && this.player.currentTilePosition.x === target.approach.x && this.player.currentTilePosition.y === target.approach.y) {
  signal.emit('officeOpen', { objectId:id })
  return true
}
if (!target || !this.player.moveToTile(target.approach.x, target.approach.y)) {
  signal.emit('officeFeedback', { message: 'Não consigo chegar até esse objeto.' })
  return false
}
this.pendingOfficeObjectId = id
return true
```

- [ ] **Step 4: Draw the interactive layer and React HUD.** Add `InteractionLayer` to the stage above `backgroundLayer` and below `object`; create transparent hit areas from `bounds`, with `eventMode='static'`, pointer cursor, hover contour/name and `pointertap` calling `requestOfficeObject`. Stop event propagation so stage click does not also move. At mobile width show a visible “Interagir” control for the nearest object; on desktop show `E · <label>`. `OfficeHud` listens to signals, sets `role="dialog"`, focus on its heading and returns focus to the canvas when closed. It lists the object-specific actions defined in the spec.

```ts
hitArea.on('pointertap', (event) => { event.stopPropagation(); playApp.requestOfficeObject(object.id) })
hitArea.on('pointerover', () => drawOutline(object.bounds, 0x62e2c7))
hitArea.on('pointerout', () => clearOutline(object.id))
```

- [ ] **Step 5: Run geometry/approach tests and `yarn build` in `frontend`; manually click a desk, click a wall, press `E`, and repeat at 390px width.** Expected: panel opens only after walking to the desk; wall click never opens it; keyboard/touch work. Commit: `git add ... && git commit -m "feat: make office objects discoverable and reachable"`.

## Task 3: Shared occupancy and presence

**Files:** Create `backend/src/office/OfficeState.ts`, `backend/src/office/OfficeState.test.ts`; modify `backend/src/session.ts`, `backend/src/sockets/socket-types.ts`, `backend/src/sockets/sockets.ts`, `frontend/app/play/OfficeHud.tsx`, `frontend/utils/pixi/office/InteractionLayer.ts`.

**Interfaces:** Consumes `officeAction`, `officeStep({x,y})` e map object IDs. Produces `OfficeState.occupy(uid,objectId)`, `.release(uid)`, `.removePlayer(uid)`, `.verifiedPosition(uid)`, `.snapshot()`; emits `officeStateChanged({occupancy})` and `officeSnapshot` after join.

`new OfficeState(room: Room, now: () => number)` receives the room data and an injectable clock. `addPlayer(uid,spawn)` initializes the verified position; `step(uid,next)` validates each tile; `apply(uid,{objectId,action})` routes the actions below. All mutations return `{ok:boolean,error?:string}`.

- [ ] **Step 1: Write failing state tests in `OfficeState.test.ts`.** Use two users; first occupancy succeeds, simultaneous second occupancy fails, `removePlayer` frees the seat; reject unknown object, wrong kind, and player more than two Manhattan tiles from `approach`. Test `officeStep`: one adjacent unblocked tile accepted, a leap of five tiles or a blocked tile rejected.

```ts
let now = 0
const state = new OfficeState(room, () => now)
state.addPlayer('u1',{x:11,y:6})
state.addPlayer('u2',{x:11,y:6})
assert.equal(state.occupy('u1','lounge-sofa').ok, true)
assert.equal(state.occupy('u2','lounge-sofa').ok, false)
state.removePlayer('u1')
assert.equal(state.occupy('u2','lounge-sofa').ok, true)
assert.equal(state.occupy('u2','missing').ok, false)
now = 100
assert.equal(state.step('u2',{x:11,y:7}).ok, true)
assert.equal(state.step('u2',{x:40,y:7}).ok, false)
```

- [ ] **Step 2: Run `yarn build && node --test dist/office/OfficeState.test.js` in `backend`; expect FAIL.**
- [ ] **Step 3: Implement server-authoritative occupancy and a verified office position.** Existing `movePlayer` trusts a client-supplied final target before the avatar walks there, so it cannot authorize an object action. Keep `verifiedPosition` initialized at spawn inside each `Session`; `Player.move` emits `officeStep` after each tile arrival. The backend accepts a step only if it is adjacent to the last verified tile, in bounds, not blocked, and at least 70 ms after the prior step. `officeAction` checks this verified position within 2 tiles of `approach`, never `player.x/y` from `movePlayer`. Keep `Map<objectId,uid>` inside each `Session`; accept `occupy` only for `seat`/`desk`. A player occupies at most one object; auto-release on verified step beyond 2 tiles, room switch or disconnect. After `PlayApp` registers listeners, call `officeGetSnapshot` with an ack so joining cannot miss the initial state; on accepted transitions broadcast `officeStateChanged` to the realm. Use Socket.io ack with `{ok,error}` for rejected actions.

```ts
const OfficeAction = z.object({ objectId:z.string().max(64), action:z.enum(['occupy','release','drink','startGame','joinGame','returnBall','leaveGame']) })
const OfficeStep = z.object({ x:z.number().int(), y:z.number().int() })
socket.on('officeGetSnapshot', (ack) => {
  const state = sessionManager.getPlayerSession(uid)?.officeState
  ack(state ? {ok:true,snapshot:state.snapshot()} : {ok:false,error:'Fora do escritório.'})
})
socket.on('officeStep', (raw, ack) => {
  const parsed = OfficeStep.safeParse(raw)
  const state = sessionManager.getPlayerSession(uid)?.officeState
  ack(parsed.success && state ? state.step(uid, parsed.data) : {ok:false,error:'Posição inválida.'})
})
socket.on('officeAction', (payload, ack) => {
  const result = OfficeAction.safeParse(payload)
  if (!result.success || !sessionManager.getPlayerSession(uid)) return ack({ok:false,error:'Ação inválida.'})
  const change = session.officeState.apply(uid, result.data)
  ack(change)
  if (change.ok) io.to(session.id).emit('officeStateChanged', session.officeState.snapshot())
})
```

- [ ] **Step 4: Reflect occupied/free status visually.** `OfficeHud` shows “Ocupar estação” or “Levantar”; `InteractionLayer` adds a colored badge at the object and name/status on hover; occupied items show the occupant name but cannot be claimed by another. For `seat`/`desk`, use `seatVisual` to offset only the avatar sprite inside `Player.parent` (keep logical tile and parent position unchanged), switch to idle animation and mask its lower body behind a small matching foreground cushion/chair overlay. Apply the same visual to local and remote players from the occupancy snapshot; clear it on release/disconnect. Do not change microphone state automatically.

```tsx
<button disabled={Boolean(occupant && occupant.uid !== uid)} onClick={() => act(object.id, occupant?.uid === uid ? 'release' : 'occupy')}>
  {occupant?.uid === uid ? 'Levantar' : occupant ? `Ocupado por ${occupant.name}` : 'Ocupar estação'}
</button>
```
- [ ] **Step 5: Run state tests, both builds, then open two visitor sessions and race for one desk.** Expected: one winner, same badge in both clients, release when winner exits. Commit: `git add ... && git commit -m "feat: synchronize seats and workstations"`.

## Task 4: Persistent shared boards and guestbook

**Files:** Create a CLI-named migration under `supabase/migrations/`, `backend/src/office/OfficeNotes.ts`, `backend/src/office/OfficeNotes.test.ts`, `frontend/app/play/OfficeBoard.tsx`; modify `backend/src/sockets/socket-types.ts`, `backend/src/sockets/sockets.ts`, `frontend/app/play/OfficeHud.tsx`.

**Interfaces:** Consumes `officeReadNotes` and `officeAddNote`. Produces notes `{id,objectId,author,body,createdAt}`, `officeNoteCreated` to the realm and `OfficeNotes.list/add` backend methods.

`new OfficeNotes(db: SupabaseClient, now: () => number)` exposes `list(realmId:string, objectId:string): Promise<OfficeNote[]>` and `add(input:{realmId:string,objectId:string,uid:string,author:string,kind:'board'|'desk'|'guestbook',body:string}):Promise<{ok:boolean,error?:string,note?:OfficeNote}>`.

- [ ] **Step 1: Verify current Supabase docs/changelog and create the migration with `supabase migration new office_notes` (check `supabase migration new --help` first).** Table: UUID id, `realm_id` FK to realms with cascade, `object_id` text max 64, `author_id` FK to auth.users with cascade, `author_name` text max 64, `body` text 1–500 chars, `created_at`; index `(realm_id,object_id,created_at desc)`; RLS enabled; revoke `anon` and `authenticated`; no direct policies because only the backend reads/writes. Test a service-role insert/select and confirm publishable-key direct access is denied. Current reference: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

```sql
create table public.office_notes (
  id uuid primary key default gen_random_uuid(),
  realm_id uuid not null references public.realms(id) on delete cascade,
  object_id text not null check (length(object_id) between 1 and 64),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null check (length(author_name) between 1 and 64),
  body text not null check (length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index office_notes_lookup_idx on public.office_notes(realm_id, object_id, created_at desc);
alter table public.office_notes enable row level security;
revoke all on public.office_notes from anon, authenticated;
```

- [ ] **Step 2: Write failing backend tests.** Fake the Supabase adapter; assert list filters by realm/object and returns newest 100, a 501-character note fails, a 281-character guestbook message fails, unknown/non-board object fails, and a second post within 3 seconds returns rate-limit error.

```ts
assert.equal((await notes.add({realmId:'r',objectId:'project-table',uid:'u',author:'Ana',kind:'board',body:'Ideia'})).ok, true)
assert.equal((await notes.add({realmId:'r',objectId:'project-table',uid:'u',author:'Ana',kind:'board',body:'x'.repeat(501)})).ok, false)
assert.equal((await notes.add({realmId:'r',objectId:'reception',uid:'u',author:'Ana',kind:'guestbook',body:'x'.repeat(281)})).ok, false)
```

- [ ] **Step 3: Implement `OfficeNotes` and Socket.io handlers.** Check membership in the realm, object ID/kind (`board`, `desk`, `guestbook`) and distance <=2 before querying with service role. Enforce 3-second per-user write interval and 100 returned notes. Broadcast created notes only to this realm. Return a typed failure ack on database errors without echoing internal SQL or credentials.

```ts
const object = session.map_data.rooms[player.room].interactions?.find(item => item.id === payload.objectId)
if (!object || !['board','desk','guestbook'].includes(object.kind) ||
    !session.officeState.isNear(player.uid, object.approach, 2)) {
  return ack({ok:false,error:'Aproxime-se do objeto para usá-lo.'})
}
const result = await notes.add({realmId:session.id,objectId:object.id,uid:player.uid,
  author:player.username,kind:object.kind as 'board'|'desk'|'guestbook',body:payload.body})
ack(result)
if (result.ok) io.to(session.id).emit('officeNoteCreated', result.note)
```
- [ ] **Step 4: Implement `OfficeBoard`.** `OfficeHud` opens it for board/desk/guestbook, shows escaped author/text/time, limits input to 500 or 280 characters, shows saving/error state and disables duplicate submit until ack. Close returns to the office. Existing video stays active while typing.

```tsx
<form onSubmit={submitNote}>
  <textarea value={body} maxLength={object.kind === 'guestbook' ? 280 : 500}
    onChange={event => setBody(event.target.value)} aria-label="Escrever recado" />
  <button type="submit" disabled={saving || !body.trim()}>{saving ? 'Salvando…' : 'Publicar'}</button>
  {error && <p role="alert">{error}</p>}
</form>
```
- [ ] **Step 5: Run backend tests and builds; in two browser sessions add a note, observe it in the other, reload both and read it again.** Commit migration and code: `git add ... && git commit -m "feat: add persistent shared office boards"`.

## Task 5: Visible appliances and two-person ping-pong

**Files:** Create `frontend/app/play/PingPongPanel.tsx`, `backend/src/office/PingPong.test.ts`; modify `backend/src/office/OfficeState.ts`, `frontend/utils/pixi/office/InteractionLayer.ts`, `frontend/app/play/OfficeHud.tsx`, `backend/src/sockets/sockets.ts`.

**Interfaces:** Consumes `officeAction` actions `drink`, `startGame`, `joinGame`, `returnBall`, `leaveGame`. Produces temporary game snapshot `{players:[string,string],turn:string,scores:[number,number],rally:number}` and effects `coffee`, `water`, `snack`.

- [ ] **Step 1: Write failing game tests.** First player starts, second joins, third is rejected; only current player can `returnBall`; valid return increments rally and swaps turn; missing a 3-second window awards the opponent a point; disconnect ends the game; no stale game survives new `Session`.

```ts
assert.equal(state.startGame('u1','pingpong').ok, true)
assert.equal(state.joinGame('u2','pingpong').ok, true)
assert.equal(state.joinGame('u3','pingpong').ok, false)
assert.equal(state.returnBall('u2','pingpong').ok, false)
assert.equal(state.returnBall('u1','pingpong').ok, true)
```

- [ ] **Step 2: Run backend build/test; expect FAIL.**
- [ ] **Step 3: Implement authoritative game transitions and appliance responses.** Backend validates `pingpong` kind, both players near the table and deadline using server time; timer emits score change; reaching 5 points ends the game. `drink`/`snack` require matching kind/effect and proximity; they broadcast a short `{objectId,effect,uid}` event but store no personal data. Invalid/out-of-range action returns `ok:false`.

```ts
returnBall(uid:string, objectId:string) {
  const game = this.games.get(objectId)
  if (!game || game.turn !== uid || !this.isNear(uid, this.object(objectId).approach, 2))
    return {ok:false,error:'Ainda não é sua vez ou você se afastou.'}
  game.rally += 1
  game.turn = game.players.find(player => player !== uid)!
  game.deadline = this.now() + 3000
  return {ok:true}
}
// sockets.ts: a 250 ms interval calls officeState.expire(now()) and broadcasts only changed snapshots.
```
- [ ] **Step 4: Add visible effects and game UI.** `InteractionLayer` shows a cup/droplet/snack sparkle for ~2 seconds over the corresponding machine (GSAP already exists). `PingPongPanel` shows player names, score, turn and a large `Rebater` button with Space shortcut; include a touch button and status for waiting/ended. The ball in the map animates only while a game is active. React listens to `officeStateChanged` and `officeEffect`.

```tsx
<section aria-label="Pingue-pongue">
  <p>{game.players.join(' × ')} · {game.scores.join('–')}</p>
  <p role="status">{game.turn === uid ? 'Sua vez de rebater' : 'Aguardando o outro jogador'}</p>
  <button onClick={() => act('pingpong','returnBall')} disabled={game.turn !== uid}>Rebater</button>
</section>
```
- [ ] **Step 5: Run tests/builds and a two-browser session: collect coffee, play a rally, leave/disconnect, verify visible state resets.** Commit: `git add ... && git commit -m "feat: animate appliances and add shared ping-pong"`.

## Task 6: Publication and acceptance on the current link

**Files:** Modify `README.md` for controls and operations; no new application module.

**Interfaces:** Consumes all prior tasks; produces one updated realm map and verified Vercel/Render deployments.

- [ ] **Step 1: Run full gates before touching production.** `node --experimental-strip-types --test frontend/utils/pixi/office/*.test.mjs scripts/matte-office-map.test.mjs`, `yarn build` in both apps, and `git diff --check`. Confirm `RoomSchema.safeParse(map).success` and 22 reachable hotspots.
- [ ] **Step 2: Deploy in compatibility order.** Push backend-compatible code to Git; wait for Render to report live; push frontend and wait for Vercel Ready; verify `/matte-office-v2.png` HTTP 200. Export the current realm `map_data` to a local backup outside Git, then update only that realm's `map_data` to the new generator output. Restart the Render service once after this update so any active in-memory session reloads the new map; clients already inside refresh their page. Keep the same realm ID/share ID. If the new map fails to load, restore the backup and restart Render immediately.
- [ ] **Step 3: Real-browser acceptance with two independent sessions.** Verify all 22 items receive hover or touch labels; click/E walk and activate; blocked destination gives feedback; two visitors see occupancy and notes; play ping-pong; reload notes; check private meeting audio and proximity video; inspect console/network errors; repeat controls at 390px width.
- [ ] **Step 4: Update README with `E`, mouse/touch and each action category.** Commit: `git add README.md && git commit -m "docs: explain interactive Matte office"`. Share the existing public link and report any remaining limitation accurately.

```md
### Escritório Matte interativo
Clique ou toque em um móvel destacado para caminhar até ele. Perto dele, use E (ou o botão Interagir no celular).
Mesas e sofás podem ser ocupados; quadros e recepção guardam recados; cozinha oferece efeitos; pingue-pongue aceita dois jogadores.
```

## Self-review against the spec

- Discovery, navigation and accessibility: Tasks 1–2.
- Occupancy, real-time consistency and disconnect: Task 3.
- Shared persistent content and backend authorization: Task 4.
- Visually active appliances and multiplayer game: Task 5.
- Existing URL, video regression, desktop/mobile and deployment: Task 6.
- The five Review Focus conditions each have a test in the owning task; the map is audited before deployment.

## Technical references

- [PixiJS v8 interaction and hit areas](https://pixijs.com/8.x/guides/components/events)
- [Socket.io 4 rooms](https://socket.io/docs/v4/rooms/) and [event acknowledgements](https://socket.io/docs/v4/emitting-events/)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
