# Farmasaurus (Lootlands Online)

A browser-based isometric MMO RPG inspired by Ultima Online and RuneScape. Players explore a procedurally-generated world, fight enemies, and interact with other players in real time.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Client | PixiJS 8, TypeScript, Vite |
| Server | Node.js, WebSockets (ws), TypeScript, tsx |
| Shared | Common types, constants, terrain generation |

## Project Structure

```
client/           Frontend (PixiJS renderer, input, networking, UI)
  src/
    entities/     Player and enemy rendering/animation
    input/        Keyboard (WASD) and mouse input handlers
    network/      WebSocket client
    rendering/    Camera, isometric transforms, tilemap
    ui/           Chat system
server/           Backend (game loop, player/entity management)
  src/
    game-loop.ts  30 TPS authoritative tick
    player-manager.ts
    entity-manager.ts
shared/           Shared between client and server
  constants.ts    Tile sizes, speeds, enemy stats, ranges
  types.ts        Direction enum, entity data
  messages.ts     WebSocket message protocol
  terrain.ts      Procedural terrain and elevation generation
```

## Features

**Movement** - Tile-based grid (8000x8000 world). WASD keyboard movement or right-click-hold 8-directional movement. Walk and run speed modes with terrain/elevation validation.

**Combat** - Left-click melee attacks with cooldown, miss chance, and damage formula (`base + random - defense`). Floating damage numbers and hit flash effects.

**Procedural World** - Deterministic seeded noise generates tile types (water, sand, grass, dirt, rock, forest) and elevation (0-15). Elevation affects walkability and visual rendering with smooth corner-height blending.

**Enemy AI** - Three enemy types (Spiders, Skeletons, Orcs) with wander, chase, and leash behaviors. Enemies aggro when players enter range and respawn 10 seconds after death.

**Networking** - WebSocket JSON protocol at 30 TPS. Client-side prediction with server reconciliation for responsive local movement. Remote player interpolation for smooth multiplayer.

**Visuals** - Isometric rendering with z-indexed sorting, walk/run/attack animations, pixel art characters and enemies, UO-style HUD with health/mana/stamina bars, and a journal-style chat log.

## Movement System

Movement is tile-based and server-authoritative with client-side prediction for responsiveness.

### Input Methods

**Keyboard (WASD)** - 4 cardinal directions plus diagonals when two keys are held (W+A = UP_LEFT, etc.). Always takes priority over mouse input. Players always walk when using keyboard.

**Right-click hold** - 8-directional movement based on the angle from the character to the cursor in viewport space. The angle is divided into 8 octants (45 degrees each) with 30% hysteresis at boundaries to prevent direction flickering. A 5-pixel dead zone around the character ignores tiny cursor movements. Walk/run is determined by cursor distance: beyond 100 screen pixels from the character triggers running.

**Right-click release (click-to-move)** - A quick right-click sets a destination tile. The client computes one step at a time toward the target using sign-based direction (greedy best-step, not pathfinding). Running kicks in when the target is more than 3 tiles away and stops within 1 tile.

### Tile-Step Model

All movement happens in discrete tile steps. Each step has a fixed duration:
- **Walk**: 500ms per tile (2 tiles/sec)
- **Run**: 250ms per tile (4 tiles/sec)

Direction and speed are **latched** when a step begins and cannot change mid-step. When a step completes, the next input is sampled immediately and a new step chains in with no idle gap, carrying over excess time from the previous step to keep a steady pace.

### Validation

Before any step starts, both client and server check:
1. **Terrain** - Deep water and shallow water tiles block movement.
2. **Elevation** - The Z difference between source and destination must be <= 4 units (out of a 0-15 range). Elevation is derived from the same continuous noise used for biome selection, so there are no abrupt cliffs at biome boundaries.
3. **Occupancy** - Tiles occupied by other players or enemies are blocked.
4. **Diagonal passability** - Diagonal moves require both cardinal neighbors to be passable (can't cut through a wall corner).

If a diagonal move fails validation, the system falls back to the horizontal component, then the vertical component, before giving up.

### Client-Side Prediction

The client predicts movement locally to eliminate input lag:
- When idle and input is detected, a predicted step starts immediately on the render frame (no waiting for the next server tick).
- The predicted position (tile + interpolation progress) drives the camera and player rendering.
- Direction for the server is sent at the fixed 30 TPS tick rate, using the **latched** direction when mid-step.

### Server Reconciliation

The server is authoritative. Each tick, the server processes queued input and advances player move timers. The client reconciles by comparing its predicted position to the server state:
- **Idle + small drift (1-2 tiles)**: Snap to server position at the next step boundary.
- **Large drift (> 2 tiles)**: Emergency teleport to server position (handles lag spikes or rejected moves).
- **Mid-step**: No correction applied to avoid visual jitter.

### Terrain and Elevation

The world uses deterministic FBM noise (seed 42) to generate both tile types and elevation. Elevation ranges from 0 (sea level, water tiles) to 15 (mountain peaks). Corner heights for each tile diamond are averaged from the 4 neighboring tiles to produce smooth elevation transitions in the isometric renderer. Each Z unit offsets sprites upward by 4 screen pixels.

## Running

```bash
npm run install:all    # Install dependencies for client and server
npm run dev            # Start both client (port 3000) and server (port 3001)
```

Open `http://localhost:3000` in a browser, enter a character name, and play.

## Dev Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run client + server concurrently |
| `npm run dev:client` | Vite dev server with HMR (port 3000) |
| `npm run dev:server` | tsx watch mode (port 3001) |
| `npm run build` | Production build (TypeScript check + Vite bundle) |
