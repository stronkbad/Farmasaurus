# Phase 1: UO-Style Right-Click Movement + Running + Tile Size

## Changes Overview

### 1. shared/constants.ts
- Change TILE_WIDTH from 32 → 44, TILE_HEIGHT from 16 → 22
- Add PLAYER_RUN_MS = 200
- Add RUN_DISTANCE_THRESHOLD = 100 (pixels from character to cursor)

### 2. shared/types.ts
- Add DIRECTION_BY_OCTANT array mapping angle octants to Direction values

### 3. shared/messages.ts
- Add `running: boolean` to ClientInputMessage
- Add `isRunning: boolean` to PlayerState

### 4. server/src/player-manager.ts
- Add isRunning/queuedRunning to ServerPlayer
- handleInput stores running flag
- updateAll uses PLAYER_RUN_MS vs PLAYER_WALK_MS based on running
- Add diagonal movement validation (both cardinal dirs must be passable)
- getPlayerState includes isRunning

### 5. server/src/entity-manager.ts
- Add diagonal validation to #tryMove

### 6. client/src/input/mouse-movement.ts (NEW FILE)
- MouseMovementInput class
- Tracks right-button hold state + cursor position
- Computes angle from character to cursor → 8-direction
- Distance determines walk vs run

### 7. client/src/input/mouse.ts
- Filter #onClick to left-click only (button === 0)

### 8. client/src/main.ts
- Import and initialize MouseMovementInput
- Unified getMovementInput() that checks mouse first, then keyboard
- Add predicted running state + move duration
- Update input sending to include running flag
- Update visual interpolation to use predictedMoveDuration
- Feed character screen position to MouseMovementInput each frame

### 9. client/src/entities/player.ts
- Add isRunning property
- Faster/higher bob animation when running
- Apply isRunning from PlayerState for remote players

### 10. client/src/rendering/tilemap.ts
- Scale hardcoded detail pixel offsets for new 44x22 tile size

## Implementation Order
1. shared/constants.ts
2. shared/types.ts
3. shared/messages.ts
4. server/src/player-manager.ts
5. server/src/entity-manager.ts
6. client/src/input/mouse-movement.ts (new)
7. client/src/input/mouse.ts
8. client/src/main.ts
9. client/src/entities/player.ts
10. client/src/rendering/tilemap.ts
