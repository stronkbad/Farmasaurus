# Ultima Online — Mapping, Movement & Terrain Systems
## Complete Technical Reference

---

## Table of Contents
1. [Map File Format & Binary Structures](#1-map-file-format--binary-structures)
2. [Tile System Architecture](#2-tile-system-architecture)
3. [Isometric Projection & Coordinate Math](#3-isometric-projection--coordinate-math)
4. [Elevation / Z-Axis System](#4-elevation--z-axis-system)
5. [Terrain Rendering & Stretching](#5-terrain-rendering--stretching)
6. [Terrain Transitions & Embankments](#6-terrain-transitions--embankments)
7. [Art Asset Formats](#7-art-asset-formats)
8. [Tile Data Properties](#8-tile-data-properties)
9. [Draw Order & Rendering Pipeline](#9-draw-order--rendering-pipeline)
10. [Right-Click Movement System](#10-right-click-movement-system)
11. [Pathfinding](#11-pathfinding)
12. [Movement Packets & Client-Server Sync](#12-movement-packets--client-server-sync)
13. [Movement Speed](#13-movement-speed)
14. [Smooth Animation & Interpolation](#14-smooth-animation--interpolation)
15. [Direction System](#15-direction-system)
16. [Z-Axis Movement & Collision](#16-z-axis-movement--collision)
17. [World Scale & Map Dimensions](#17-world-scale--map-dimensions)
18. [Key Constants Summary](#18-key-constants-summary)
19. [Sources](#19-sources)

---

## 1. Map File Format & Binary Structures

### Overview of Files Per Facet

Each facet (game world) in Ultima Online requires a numbered set of files. For facet 0 (Felucca):

| File | Purpose |
|------|---------|
| `map0.mul` | Base terrain tile data (ground heightmap + tile IDs) |
| `staidx0.mul` | Index into statics0.mul for each 8x8 block |
| `statics0.mul` | Static object data (walls, roofs, trees, etc.) |
| `mapdifl0.mul` | Map diff list (patched terrain blocks) |
| `mapdif0.mul` | Map diff data |
| `stadifi0.mul` | Static diff index |
| `stadifl0.mul` | Static diff list |
| `stadif0.mul` | Static diff data |

Additional global files shared across all facets:

| File | Purpose |
|------|---------|
| `tiledata.mul` | Properties/flags for all land and static tile types |
| `art.mul` / `artidx.mul` | Sprite graphics for land tiles and static items |
| `texmaps.mul` / `texidx.mul` | Terrain texture maps (for 3D terrain rendering) |
| `radarcol.mul` | Radar/minimap color for each tile ID |
| `multi.mul` / `multi.idx` | Multi-object definitions (buildings, ships, etc.) |
| `hues.mul` | Color palette/hue definitions |

Newer clients (post-7.0.23.1) pack these into UOP container files (e.g., `map0LegacyMUL.uop`), but the internal data format remains identical — UOP is just a container wrapping the MUL data.

### MAP0.MUL — Terrain Data

**Total file size** (for Felucca 7168x4096): 37,748,736 bytes

The file is a flat sequence of **blocks**. Each block is exactly **196 bytes**.

```
Block (196 bytes):
  Bytes 0-3:   DWORD  Header (4 bytes, purpose unknown/unused)
  Bytes 4-195: Cell[64] — 64 cells of 3 bytes each
```

Each block represents an **8x8 tile area** of the world. The 64 cells are stored in row-major order within the block (Y increments first, then X).

**Cell structure (3 bytes)**:
```
Cell (3 bytes):
  Bytes 0-1:  USHORT (uint16)  TileID   — Land tile graphic ID (0-16383)
  Byte  2:    SBYTE  (int8)    Altitude  — Height value (-128 to +127)
```

**Block addressing formula**:
```
XBlock = floor(WorldX / 8)
YBlock = floor(WorldY / 8)
BlockNumber = (XBlock * MapHeight/8) + YBlock
FileOffset = BlockNumber * 196
```

For Felucca/Trammel (7168 x 4096 tiles):
- X blocks: 7168 / 8 = 896
- Y blocks: 4096 / 8 = 512
- Total blocks: 896 * 512 = **458,752 blocks**

Within a block, to find a specific cell:
```
CellIndex = (IntraBlockX * 8) + IntraBlockY
CellOffset = 4 + (CellIndex * 3)   // skip 4-byte header
```

### STAIDX0.MUL — Static Object Index

One index record per map block, in the same block ordering as map0.mul.

**Index Record (12 bytes)**:
```
Bytes 0-3:   DWORD  Start    — Byte offset into statics0.mul (0xFFFFFFFF = no statics)
Bytes 4-7:   DWORD  Length   — Total byte length of static data for this block
Bytes 8-11:  DWORD  Unknown  — (unused/padding)
```

To read statics for a block: look up BlockNumber in staidx0.mul, then read `Length` bytes from `Start` offset in statics0.mul. Divide by 7 to get the number of static items.

### STATICS0.MUL — Static Object Data

Contains variable-length sequences of static item records for each block.

**Static Record (7 bytes)**:
```
Bytes 0-1:  USHORT  TileID    — Static item graphic ID (add 0x4000 for RADARCOL lookup)
Byte  2:    UBYTE   XOffset   — X position within block (0-7)
Byte  3:    UBYTE   YOffset   — Y position within block (0-7)
Byte  4:    SBYTE   Altitude  — Z height (-128 to +127)
Bytes 5-6:  USHORT  Hue       — Color hue value (0 = default)
```

Multiple statics can occupy the same tile position at different Z levels, enabling stacked objects (e.g., a floor with furniture on it). Max statics per block: **1024**.

### TILEDATA.MUL — Tile Property Database

Two sections: **Land Tile Data** and **Static Tile Data**.

**Land Tile Section** (512 groups of 32 entries each = 16,384 total):

```
LandTileData (26 bytes, old format):
  Bytes 0-3:   DWORD    Flags      — TileFlag bitfield
  Bytes 4-5:   USHORT   TextureID  — Index into texmaps.mul (0 = no texture)
  Bytes 6-25:  CHAR[20] Name       — Null-terminated ASCII name
```

**Static Tile Section**:

```
StaticTileData (37 bytes, old format):
  Bytes 0-3:   DWORD    Flags       — TileFlag bitfield
  Byte  4:     BYTE     Weight      — Item weight (255 = immovable)
  Byte  5:     BYTE     Layer       — Equipment slot if wearable
  Bytes 6-9:   INT      Count       — Weapon class if weapon
  Bytes 10-11: USHORT   AnimID      — Animation body ID
  Bytes 12-13: USHORT   Hue         — Default hue
  Bytes 14-15: USHORT   LightIndex  — Light source index
  Byte  16:    BYTE     Height      — Physical height in Z units
  Bytes 17-36: CHAR[20] Name        — Null-terminated ASCII name
```

Note: Client version 7.0.9.0+ uses 64-bit flags instead of 32-bit, altering the group sizes.

### MULTI.MUL / MULTI.IDX — Building/Structure Definitions

Multi-objects define composite structures (buildings, ships, etc.) as collections of static items at relative offsets.

```
MultiComponent (12 bytes, old format):
  Bytes 0-1:   USHORT  ItemID    — Static tile graphic ID
  Bytes 2-3:   SHORT   X         — X offset from multi origin
  Bytes 4-5:   SHORT   Y         — Y offset from multi origin
  Bytes 6-7:   SHORT   Z         — Z offset from multi origin
  Bytes 8-11:  DWORD   Flags     — Visibility/component flags
```

---

## 2. Tile System Architecture

### The Three-Layer Model

UO's world is composed of three distinct tile layers:

**Layer 1: Map Tiles (Land/Terrain)**
- Stored in map0.mul
- Exactly ONE per world coordinate (X, Y)
- Has a TileID (0-16383) and an altitude (Z: -128 to +127)
- Represents the ground surface — grass, dirt, rock, water, lava, sand, etc.

**Layer 2: Static Tiles (Statics)**
- Stored in statics0.mul, indexed by staidx0.mul
- ZERO OR MORE per world coordinate — multiple statics can stack at different Z levels
- Includes walls, roofs, cave floors, trees, rocks, doors, signs, furniture, etc.
- Part of the map data files; changes require client file updates

**Layer 3: Dynamic Items**
- NOT in the map files — managed by the server at runtime
- Includes player-placed items, loot, NPCs, mobiles, player houses, etc.
- Transmitted to clients via network packets

### Tile ID System

| Range | Decimal | Type | Count |
|-------|---------|------|-------|
| 0x0000 - 0x3FFF | 0 - 16,383 | Land/Terrain Tiles | 16,384 |
| 0x4000 - 0xFFFF | 16,384 - 65,535 | Static/Item Tiles | 49,152 |

For art.mul and radarcol.mul lookups, static items add 0x4000 to get the correct index:
```
ArtIndex = StaticTileID + 0x4000
RadarColorIndex = StaticTileID + 0x4000
```

### Block and Cell Organization

The world is divided into **8x8 tile blocks** — the fundamental unit of map data:

```
Each block = 8 tiles wide x 8 tiles tall = 64 cells
Block address: (BlockX, BlockY) where BlockX = floor(X/8), BlockY = floor(Y/8)
Cell within block: IntraX = X mod 8, IntraY = Y mod 8
```

This 8x8 chunking serves multiple purposes:
- **File I/O**: Load/unload in 196-byte blocks
- **Network efficiency**: Only relevant blocks sent to clients
- **Resource system**: Each 8x8 chunk "seeded by a central egg" for natural resource distribution
- **Statics indexing**: One staidx entry per block keeps the index manageable

---

## 3. Isometric Projection & Coordinate Math

UO uses a **2:1 dimetric projection** (often called "military oblique"), NOT true isometric. The camera angle is effectively ~26.57 degrees (arctan(1/2)), rendered in a 2:1 pixel ratio.

### Tile Dimensions
- Each tile is a **44x44 pixel diamond** (rhombus)
- Half-tile dimensions: **22x22 pixels** — this is the fundamental unit
- Effective screen footprint: **44 pixels wide x 22 pixels tall** (the diamond shape)

### World-to-Screen Coordinate Conversion

From ClassicUO `GameObject.cs`:
```csharp
screenX = (tileX - tileY) * 22
screenY = (tileX + tileY) * 22 - (Z * 4)
```

Breaking this down:
- **Screen X** = difference of tile coords × half-tile-width
- **Screen Y** = sum of tile coords × half-tile-height, minus Z offset (4 pixels per Z unit)

### Screen-to-World Reverse Conversion

```
worldX = (screenX / 22 + screenY / 22) / 2
worldY = (screenY / 22 - screenX / 22) / 2
```

### Depth Calculation

```csharp
depth = (X + Y) + (127 + Z) * 0.01f;
```

Depth = `(X + Y)` as the primary sort key, with Z contributing a fractional amount so objects at the same tile position sort by height.

### Coordinate System

- Origin (0, 0) is the **northwest corner** of the map
- X increases going **east** (right in isometric view)
- Y increases going **south** (down-right in isometric view)
- Z increases going **up** (higher altitude)

---

## 4. Elevation / Z-Axis System

### Z Range
- Z is stored as a **signed byte (sbyte)**: range **-128 to +127**
- Invalid/out-of-bounds tiles return **-125**

### Z to Pixel Conversion
**1 Z unit = 4 pixels on screen** (vertically):

```csharp
screenY = (tileX + tileY) * 22 - (Z << 2)  // Z << 2 = Z * 4
```

A tile at Z=10 is drawn **40 pixels higher** on screen than a tile at Z=0.

### Terrain Corner Heights

Each terrain tile has **4 corner heights** derived from adjacent tile Z values:

```
      Top (north)
      z = tile(X, Y)
       /\
      /  \
Left /    \ Right
z=tile    z=tile
(X,Y+1)  (X+1,Y)
      \  /
       \/
      Bottom (south)
      z = tile(X+1, Y+1)
```

```csharp
sbyte zTop    = z;                           // This tile's own Z
sbyte zRight  = map.GetTileZ(x + 1, y);     // Tile to the east
sbyte zLeft   = map.GetTileZ(x, y + 1);     // Tile to the south
sbyte zBottom = map.GetTileZ(x + 1, y + 1); // Tile to the southeast
```

When all 4 corners match → **flat tile** (simple diamond sprite).
When corners differ → **stretched tile** (texture-mapped deformed quad).

### AverageZ Calculation

```csharp
if (Math.Abs(zTop - zBottom) <= Math.Abs(zLeft - zRight))
    AverageZ = (sbyte)((zTop + zBottom) >> 1);
else
    AverageZ = (sbyte)((zLeft + zRight) >> 1);

MinZ = Math.Min(zTop, Math.Min(zRight, Math.Min(zLeft, zBottom)));
```

Chooses the diagonal with the smallest difference for a more stable center height.

### Roof Popping / MaxZ System

When the player walks under a floor or roof, rendering stops above their head:

```csharp
int pz14 = playerZ + 14;
int pz16 = playerZ + 16;

// For land tiles:
if (pz16 <= tileZ) {
    maxGroundZ = (sbyte)pz16;
    // Stop rendering above this Z
}

// For statics:
if (tileZ > pz14 && _maxZ > tileZ) {
    // It's a roof — set _maxZ and _noDrawRoofs = true
}
```

Player height is defined as `DEFAULT_CHARACTER_HEIGHT = 16` Z units.

---

## 5. Terrain Rendering & Stretching

### History (from Raph Koster)

1. **Early approach**: Flat diamond tiles with lighter/darker shading to create the optical illusion of height
2. **Final approach**: Rick Delashmit wrote a software texture-mapping routine that treats each terrain tile as a **deformable quad** with potentially different altitudes at each corner

### The Stretched Land Quad

From ClassicUO `Batcher2D.DrawStretchedLand()`:

```csharp
// Top vertex (north point of diamond)
vertex.Position0.X = position.X + 22;
vertex.Position0.Y = position.Y - yOffsets.Top;        // Top Z * 4

// Right vertex (east point of diamond)
vertex.Position1.X = position.X + 44;
vertex.Position1.Y = position.Y + (22 - yOffsets.Right); // Right Z * 4

// Left vertex (west point of diamond)
vertex.Position2.X = position.X;
vertex.Position2.Y = position.Y + (22 - yOffsets.Left);  // Left Z * 4

// Bottom vertex (south point of diamond)
vertex.Position3.X = position.X + 22;
vertex.Position3.Y = position.Y + (44 - yOffsets.Bottom); // Bottom Z * 4
```

Base diamond shape (all Z=0) has vertices at:
- Top: (22, 0)
- Right: (44, 22)
- Left: (0, 22)
- Bottom: (22, 44)

Each corner's Y is shifted by `-(Z * 4)` pixels upward for positive Z. The quad is split into **two triangles** using a left/right diagonal split.

### Terrain Lighting / Normals

Stretched terrain tiles receive per-vertex lighting. The normal calculation samples a **4x4 neighborhood** of tile heights, computing cross products of surrounding vectors:

```csharp
u.X = -22;  u.Y = -22;  u.Z = (left - tile) * 4;
v.X = -22;  v.Y = 22;   v.Z = (bottom - tile) * 4;
Vector3.Cross(ref v, ref u, out ret);
// 4 cross products averaged and normalized per vertex
```

The shader uses directional lighting:
```hlsl
float3 LIGHT_DIRECTION = float3(0.0, 1.0, 1.0);
float base = (max(dot(normal, light), 0.0) / 2.0) + 0.5;
```

---

## 6. Terrain Transitions & Embankments

UO does **NOT** use dynamic alpha blending between terrain types. Instead:

### Hand-Made Transition Tiles
Every pair of adjacent terrain types requires hand-authored or tool-generated transition tiles (e.g., half-grass/half-dirt tiles). From Raph Koster:

> "Every two different tiles needed a hand placed transition tile between them."

### Automated Tooling
For The Second Age expansion, the map was built in stages:
1. Painted flat with placeholder tiles
2. Raised terrain tiers
3. Randomized tile variety
4. Added smoothing and slopes
5. Processed tile transitions between types
6. Only tight passages and ramps required hand-editing

### Embankment Tiles
Special texture sets were created for steep slopes and shorelines — combining dirt and grass textures in Photoshop, drawing "runnels" with a burn tool to signal impassable ravines.

### When Textures vs. Flat Art Are Used

```csharp
// If all 4 corners have the same Z AND the tile has a texture (TexID != 0):
//   → Use flat 44x44 diamond art tile from art.mul
// If any corners differ in Z:
//   → Use texture-mapped stretched quad from texmaps.mul
```

---

## 7. Art Asset Formats

### art.mul — Land Tiles (IDs 0x0000 to 0x3FFF)

- Fixed **44x44 pixels**, stored as a diamond-shaped pixel pattern
- Each pixel is a **16-bit color value** (1-5-5-5 RGB)
- Diamond pattern per row: 2, 4, 6, 8, ... 42, 44, 44, 42, ... 8, 6, 4, 2
- Total: **1936 pixels** = **3872 bytes** per land tile

**Pixel format**: 16-bit, 5-5-5 RGB:
```
Bit 15:     Unused (0)
Bits 14-10: Red   (5 bits, 0-31)
Bits 9-5:   Green (5 bits, 0-31)
Bits 4-0:   Blue  (5 bits, 0-31)
```
Pixel value `0x0000` = fully transparent.

### art.mul — Static Tiles (IDs 0x4000+)

- **Variable dimensions** (width and height stored in the file)
- **Run-length encoded**: each row has (xOffset, runLength) pairs
- Preceded by a 4-byte flags DWORD, then 2-byte width and 2-byte height
- Row lookup table: array of USHORT offsets (one per row)

Static art positioning uses an anchor at center-bottom of the 44-wide diamond:
```csharp
index.Width = (short)((artInfo.UV.Width >> 1) - 22);  // X offset from center
index.Height = (short)(artInfo.UV.Height - 44);         // Y offset from base
```

### texmaps.mul — Terrain Textures

Square textures used for stretched terrain:
- **64x64 pixels** if entry length = 0x2000 (8,192 bytes)
- **128x128 pixels** if entry length = 0x8000 (32,768 bytes)
- Raw 16-bit color pixels, stored as a **square** (not diamond)
- Up to 16,384 possible texture entries

These square textures are mapped onto the deformed diamond quad when terrain is stretched.

### Texture UV Mapping for Stretched Land

```csharp
// Vertex 0 (Top/North):    UV (0, 0)  — top-left of texture
// Vertex 1 (Right/East):   UV (1, 0)  — top-right of texture
// Vertex 2 (Left/West):    UV (0, 1)  — bottom-left of texture
// Vertex 3 (Bottom/South): UV (1, 1)  — bottom-right of texture
```

### radarcol.mul — Radar Colors

65,536 entries × 2 bytes = 131,072 bytes. Entries 0-16383 = land tiles, 16384-65535 = static items.

---

## 8. Tile Data Properties

### Complete TileFlag Enumeration

| Flag | Hex Value | Meaning |
|------|-----------|---------|
| Background | 0x00000001 | Background terrain filler |
| Weapon | 0x00000002 | Is a weapon |
| Transparent | 0x00000004 | Transparent rendering |
| Translucent | 0x00000008 | Rendered semi-transparent (e.g., water) |
| Wall | 0x00000010 | Is a wall segment |
| Damaging | 0x00000020 | Causes damage on contact |
| Impassable | 0x00000040 | Cannot walk through |
| Wet | 0x00000080 | Water tile |
| Surface | 0x00000200 | Walkable surface (can stand ON top) |
| Bridge | 0x00000400 | Bridge/stair surface (effective height = Height/2) |
| Generic | 0x00000800 | Stackable |
| Window | 0x00001000 | Is a window |
| NoShoot | 0x00002000 | Blocks line of sight for projectiles |
| ArticleA | 0x00004000 | Prefix "a" in name |
| ArticleAn | 0x00008000 | Prefix "an" in name |
| Internal | 0x00010000 | Internal/debug item — not rendered |
| Foliage | 0x00020000 | Tree canopy — becomes translucent when player walks underneath |
| PartialHue | 0x00040000 | Only gray pixels are hued |
| NoHouse | 0x00080000 | Cannot place house here |
| Map | 0x00100000 | Map item |
| Container | 0x00200000 | Is a container |
| Wearable | 0x00400000 | Can be equipped |
| LightSource | 0x00800000 | Emits light |
| Animation | 0x01000000 | Has animation frames |
| NoDiagonal | 0x02000000 | Blocks diagonal movement |
| Armor | 0x08000000 | Is armor |
| Roof | 0x10000000 | Roof tile — hidden when player is below |
| Door | 0x20000000 | Is a door — can be opened/closed |
| StairBack | 0x40000000 | Stair going back |
| StairRight | 0x80000000 | Stair going right |

**Extended 64-bit flags (newer clients)**:

| Flag | Hex Value | Meaning |
|------|-----------|---------|
| AlphaBlend | 0x0100000000 | Alpha blending |
| UseNewArt | 0x0200000000 | Uses new art system |
| ArtUsed | 0x0400000000 | Art in use |
| NoShadow | 0x1000000000 | No shadow rendered |
| PixelBleed | 0x2000000000 | Pixel bleed correction |
| PlayAnimOnce | 0x4000000000 | Play animation once |
| MultiMovable | 0x10000000000 | Multi can be moved |

### Key Gameplay Behaviors
- **Surface + Bridge**: Creates walkable ramps/stairs
- **Wet**: Water tiles. When TexID=0 AND IsWet → uses flat diamond art instead of stretched texture
- **Impassable**: Pathfinding blocks movement
- **Foliage**: Becomes translucent (alpha=76/255) when player walks behind it
- **Roof**: Triggers roof popping — stops rendering objects above the player's head Z

---

## 9. Draw Order & Rendering Pipeline

### Tile Sorting (Z-ordering in linked list)

Each 8x8 chunk cell maintains a **linked list** of GameObjects sorted by `PriorityZ`:

```
Land (flat):        Z - 2
Land (stretched):   AverageZ - 2
Static/Multi:       Z (+ adjustments for Background, Height flags)
Mobile:             Z + 1
GameEffect:         Z + 2
```

When priorities are equal:
- Land tiles (state=0) are always drawn first
- Multi tiles (state=1) come after land but before other types

### Render List Categories (drawn in order)

```
1. _tiles              — Flat land tiles (non-stretched)
2. _stretchedTiles     — Stretched/textured land tiles
3. _statics            — Static objects, multi objects, items
4. _animations         — Mobiles, corpses
5. _effects            — Spell effects, particles
6. _transparentObjects — Objects with alpha < 255
7. _gumpSprites        — UI elements
8. _gumpTexts          — UI text
```

### Main Rendering Loop

Iterates all chunks in view range:
```csharp
for (chunkX = minChunkX; chunkX <= maxChunkX; chunkX++) {
    for (chunkY = minChunkY; chunkY <= maxChunkY; chunkY++) {
        chunk = map.GetChunk2(chunkX, chunkY);
        for (x = 0; x < 8; x++) {
            for (y = 0; y < 8; y++) {
                firstObj = chunk.GetHeadObject(x, y);
                AddTileToRenderList(firstObj, ...);
            }
        }
    }
}
```

View range: `size = (int)(Math.Max(winGameWidth / 44f + 1, winGameHeight / 44f + 1) * zoom)`

---

## 10. Right-Click Movement System

### How It Works

The player holds the right mouse button. The client continuously:
1. Computes the angle from the character's screen position to the mouse cursor
2. Maps that angle to one of 8 directions
3. Sends movement request packets (0x02) to the server at the appropriate speed interval

### Direction Determination

The screen is divided into 8 octants (45-degree arcs) centered on the player character:

```
dx = cursor_screen_x - character_screen_x
dy = cursor_screen_y - character_screen_y
angle = atan2(dy, dx)
// Angle divided into 8 sectors of 45 degrees each
// 22.5-degree offset centers each octant on its cardinal/diagonal direction
direction_index = floor((angle + 22.5) / 45) % 8
```

### Distance-Based Speed

The distance between cursor and character determines walk vs. run:
- **Close to character** → walks
- **Far from character** → runs
- Running flag is OR'd into the direction byte: `direction | 0x80`

### Tile-by-Tile Movement

Movement is fundamentally **tile-by-tile**. Each movement step changes coordinates by exactly 1 unit in the appropriate direction. There is no sub-tile positioning in the game logic. The character occupies a discrete tile coordinate (X, Y, Z) at all times.

### Hold Right-Click vs. Double Right-Click

| Behavior | Hold Right-Click | Double Right-Click |
|---|---|---|
| Movement type | Continuous directional | Pathfinding to target |
| Obstacle handling | Player must steer around | Client auto-navigates |
| Direction | Follows cursor angle | Pre-computed path |
| Network | 0x02 packets on timer | 0x02 packets from path + 0x38 hint |

---

## 11. Pathfinding

### Client-Side Pathfinding (Double Right-Click)

When a player double-right-clicks a location, the client calculates a path using its own pathfinding algorithm, then walks the character along that path by issuing sequential movement request packets. The client also sends a pathfinding hint packet (0x38, 7 bytes).

### Server-Side Pathfinding (NPC/Mobile AI)

ServUO implements two A* algorithm variants:

**FastAStarAlgorithm.cs:**
- Operates on a fixed **38x38 tile grid** centered around the starting position
- Uses **13 vertical planes** at 20-unit Z intervals to handle elevation
- Heuristic: Squared scaled Manhattan distance with Z consideration:
  ```csharp
  x -= (m_Goal.X - m_xOffset);
  y -= (m_Goal.Y - m_yOffset);
  z -= m_Goal.Z;
  x *= 11; y *= 11;
  return (x * x) + (y * y) + (z * z);
  ```
- Evaluates 8 neighbors per node using `CheckMovement()` for validation
- Uses linked-list open/closed sets with `BitArray` for O(1) membership checks

**SlowAStarAlgorithm.cs:**
- More thorough variant for comprehensive pathfinding when FastAStar fails

**MovementPath.cs** converts A* result into a `Direction[]` array.

**PathFollower.cs** executes the path:
- Re-paths every 2 seconds
- Advances through `Direction[]` one step at a time
- When blocked, invalidates and recomputes
- Checks completion with Z validation: `if (range <= 1 && Math.Abs(loc.Z - goal.Z) >= 16) return false`

---

## 12. Movement Packets & Client-Server Sync

### Packet 0x02 — Move Request (Client → Server, 7 bytes)

| Offset | Type | Field | Description |
|--------|------|-------|-------------|
| 0 | BYTE | cmd | 0x02 |
| 1 | BYTE | direction | Direction + optional running flag |
| 2 | BYTE | sequence | Sequence number (0-255, wraps to 1 not 0) |
| 3 | UINT | key | Fastwalk prevention key (4 bytes) |

**Direction values:**
```
0x00 = North      0x04 = South
0x01 = Northeast  0x05 = Southwest
0x02 = East       0x06 = West
0x03 = Southeast  0x07 = Northwest

Running: direction | 0x80  (e.g., 0x80 = running North)
```

### Packet 0x22 — Move Acknowledge (Server → Client, 3 bytes)

| Offset | Type | Field | Description |
|--------|------|-------|-------------|
| 0 | BYTE | cmd | 0x22 |
| 1 | BYTE | sequence | Acknowledges this sequence number |
| 2 | BYTE | notoriety | Character's notoriety flag |

### Packet 0x21 — Move Rejection (Server → Client, 8 bytes)

| Offset | Type | Field | Description |
|--------|------|-------|-------------|
| 0 | BYTE | cmd | 0x21 |
| 1 | BYTE | sequence | Rejected sequence number |
| 2 | WORD | x | Corrected X coordinate |
| 4 | WORD | y | Corrected Y coordinate |
| 6 | BYTE | direction | Corrected direction |
| 7 | BYTE | z | Corrected Z coordinate |

When rejected, the client snaps the character to the server's authoritative position (rubber-banding).

### Packet 0x38 — Pathfinding Request (Client, 7 bytes)

Signals pathfinding to destination (X, Y, Z). Sent when double-right-clicking.

### Client-Server Synchronization Flow

```
Client                          Server
  |                               |
  |--- 0x02 (Move Req, seq=N) -->|
  |    [Client predicts move]     |    [Server validates]
  |                               |
  |<-- 0x22 (Move ACK, seq=N) ---|  (move accepted)
  |    OR                         |
  |<-- 0x21 (Move REJ, seq=N) ---|  (move rejected — here's your real position)
  |    [Client snaps back]        |
```

The client uses **client-side prediction**: it immediately moves the character visually upon sending a move request without waiting for server confirmation. If rejected, the client snaps back. This causes "rubber-banding" on high-latency connections.

### Fastwalk Prevention System

**Init (Packet 0xBF Sub 0x01):** Server sends 6 UINT keys (24 bytes) forming a stack.

**Push (Packet 0xBF Sub 0x02):** Server adds a new key with each move ack (0x22).

**Mechanism:** Each move request (0x02) pops the top key from the stack and includes it. If the stack is empty (client sending moves faster than server can ack), the key is 0 = potential speed hack.

---

## 13. Movement Speed

### Core Speed Constants (from RunUO/ServUO)

| Movement Type | Delay | Tiles/Second |
|---|---|---|
| Walk on foot | 400ms | 2.5 |
| Run on foot | 200ms | 5.0 |
| Walk mounted | 200ms | 5.0 |
| Run mounted | 100ms | 10.0 |

These are the **minimum delay between movement steps**. The server will not accept movement packets faster than these intervals.

### NPC/Creature Speeds

- **Active speed** (chasing/combat): e.g., 0.2 seconds
- **Passive speed** (wandering): e.g., 0.4 seconds
- Fast pursuit creatures can use speeds as low as 0.05 seconds

### Speed Change Packet (0xBF Subcommand 0x26)

| Value | Effect |
|-------|--------|
| 0x00 | Normal |
| 0x01 | Fast (mount speed while on foot — speed boots) |
| 0x02 | Slow |
| > 0x02 | Hybrid |

---

## 14. Smooth Animation & Interpolation

### Classic Client (Original EA Client)

Runs at **~10 FPS**. Movement animation is fundamentally **tile-snapping**: each frame, the character sprite is drawn at its current tile position. When running on a horse at 100ms per tile and rendering at 100ms per frame, the character appears to teleport tile-to-tile.

Walk animations typically have **~10 frames** per direction. One full walk cycle occurs over the duration of one tile transition.

### ClassicUO (Open-Source Reimplementation)

ClassicUO solves the smoothness problem by:

1. **Running at higher frame rates** (60+ FPS)
2. **Interpolating pixel offsets** between tiles during animation
3. Maintaining a step queue (`m_Steps`) with Direction, X, Y, Z data
4. Computing per-frame pixel offsets between old and new tile positions
5. Drawing the character at `(tileScreenPos + pixelOffset)` where pixelOffset gradually transitions over the movement duration

**Key insight:** The game logic remains tile-based, but the **rendering** interpolates pixel positions between tiles. The character has:
- A **logical tile position** (used for game logic, collision, packets)
- A **visual screen position** (interpolated for display)

### Isometric Interpolation

When interpolating between tile (X1,Y1) and (X2,Y2):
```
screen_x = (tile_x - tile_y) * 22
screen_y = (tile_x + tile_y) * 22 - tile_z * 4
```
The pixel offset is computed as a fraction of the 22-pixel half-tile width/height over the movement duration.

---

## 15. Direction System

### 8-Direction Enumeration

```
        North (0x00)
    NW (0x07)    NE (0x01)
West (0x06)        East (0x02)
    SW (0x05)    SE (0x03)
        South (0x04)
```

```csharp
public enum Direction : byte
{
    North = 0x0,
    Right = 0x1,     // Northeast (screen: right)
    East = 0x2,
    Down = 0x3,      // Southeast (screen: down)
    South = 0x4,
    Left = 0x5,      // Southwest (screen: left)
    West = 0x6,
    Up = 0x7,        // Northwest (screen: up)

    Mask = 0x7,      // Strips running flag
    Running = 0x80,  // OR'd with direction for running
    ValueMask = 0x87 // Full direction + running
}
```

### Direction Offset Table

| Direction | dX | dY |
|-----------|----|----|
| North | 0 | -1 |
| Northeast | +1 | -1 |
| East | +1 | 0 |
| Southeast | +1 | +1 |
| South | 0 | +1 |
| Southwest | -1 | +1 |
| West | -1 | 0 |
| Northwest | -1 | -1 |

### Facing vs. Movement

A character can face a direction without moving (turning in place). The direction byte in movement packets indicates both the direction of movement and the resulting facing direction.

---

## 16. Z-Axis Movement & Collision

### Core Constants (from ServUO Movement.cs)

```csharp
private const int PersonHeight = 16;  // Vertical space occupied by a character
private const int StepHeight = 2;     // Maximum elevation change per step
```

### CheckMovement Validation Process

Each movement attempt is validated through `CheckMovement()`:

1. **GetStartZ()** — Determines starting elevation:
   - Examines land tiles and statics at current position
   - Checks `TileFlag.Impassable` and `TileFlag.Wet`
   - Establishes valid Z range (zLow, zTop)

2. **Check()** — Validates target position:
   - Retrieves all tiles (land, static, items) at destination
   - For each tile: Is it a surface? Is it impassable? Is it wet?
   - Calculates if character fits vertically (PersonHeight clearance)
   - Verifies elevation change is within StepHeight
   - Target Z must be: `targetSurfaceZ <= currentZ + StepHeight`

3. **Diagonal validation**: For non-GM players, diagonal movement requires **both perpendicular cardinal directions** to also be passable. Moving Northeast requires both North AND East to be individually passable.

### How Stairs and Ramps Work

1. Each stair piece has a defined Z height in tile data
2. When stepping onto a stair, `Check()` finds the surface Z of the stair tile
3. If elevation difference between current Z and stair surface Z is within StepHeight (2 units), movement is allowed
4. Character's new Z is set to the stair surface Z

**Known limitation:** Some stair configurations are traversable in one direction but not the other.

### Elevation Ranges
- Z: **-128 to +127** (signed byte)
- Building floor height: typically **17-18 Z units**
- Mountains reach Z values around **80-100**

---

## 17. World Scale & Map Dimensions

### Facet Dimensions

| Facet | Width | Height | Total Tiles | Blocks (8x8) |
|-------|-------|--------|-------------|---------------|
| Felucca | 7168 | 4096 | 29,360,128 | 458,752 |
| Trammel | 7168 | 4096 | 29,360,128 | 458,752 |
| Ilshenar | 2304 | 1600 | 3,686,400 | 57,600 |
| Malas | 2560 | 2048 | 5,242,880 | 81,920 |
| Tokuno | 1448 | 1448 | 2,096,704 | ~32,761 |
| Ter Mur | 1280 | 4096 | 5,242,880 | 81,920 |

The original Felucca map was 6144x4096, extended to 7168x4096 in later expansions. Trammel is a mirror copy of Felucca's map data (same terrain, different ruleset).

### Real-World Scale Estimate
- Community consensus: **1 tile ≈ 1 meter**
- Britannia mainland spans ~3500 × 3500 tiles → **~3.5 km × 3.5 km** (~2.2 mi × 2.2 mi)
- Full map including ocean: **~7.2 km × 4.1 km**

### Height Scale
- Z range of -128 to +127 = 255 Z-unit total range
- At 4 pixels per Z unit vs 22 pixels per half-tile: **1 Z unit ≈ 0.18 meters** (vertical scale is compressed for visual clarity)
- Mountains (Z ~80-100) represent roughly **15-18 meters** of game-height

### Map Diff/Patch System

To differentiate Trammel from Felucca (which share map0.mul as base):
- `mapdifl0.mul` / `mapdif0.mul`: Changed terrain blocks and replacement data
- `stadifl0.mul` / `stadifi0.mul` / `stadif0.mul`: Changed static blocks and replacement data

This allows sharing the base map while having per-facet modifications.

---

## 18. Key Constants Summary

| Property | Value |
|---|---|
| Tile diamond dimensions | 44 × 44 pixels |
| Half-tile | 22 × 22 pixels |
| Z unit to pixels | 1 Z = 4 pixels vertical |
| Z range | -128 to +127 (signed byte) |
| Screen X formula | `(tileX - tileY) * 22` |
| Screen Y formula | `(tileX + tileY) * 22 - Z * 4` |
| Land tile pixel format | 16-bit color (1-5-5-5 RGB), 44×44 diamond |
| Land tile size | 3,872 bytes (1,936 pixels × 2 bytes) |
| Terrain texture sizes | 64×64 or 128×128 (square, raw 16-bit) |
| Map block size | 8×8 tiles per block (196 bytes) |
| Map cell size | 3 bytes (ushort TileID + sbyte Z) |
| Static record size | 7 bytes |
| Max statics per block | 1,024 |
| Felucca map | 7168 × 4096 tiles |
| Character height | 16 Z units |
| Step height limit | 2 Z units |
| Walk speed (foot) | 400ms/tile = 2.5 tiles/sec |
| Run speed (foot) | 200ms/tile = 5.0 tiles/sec |
| Walk speed (mounted) | 200ms/tile = 5.0 tiles/sec |
| Run speed (mounted) | 100ms/tile = 10.0 tiles/sec |
| Direction count | 8 (encoded in 3 bits + running flag) |
| Move request packet | 0x02 (7 bytes) |
| Move ack packet | 0x22 (3 bytes) |
| Move reject packet | 0x21 (8 bytes) |

---

## 19. Sources

### Primary Documentation
- [UO Stratics — Heptazane File Formats](https://uo.stratics.com/heptazane/fileformats.shtml) — Canonical reverse-engineered binary format documentation
- [Raph Koster — Ultima Online Terrain](https://www.raphkoster.com/games/snippets/ultima-online-terrain/) — First-person account from UO's lead designer
- [PenUltima Online Packet Documentation](https://docs.polserver.com/packets/index.php)

### Open Source Implementations
- [ClassicUO GitHub](https://github.com/ClassicUO/ClassicUO) — Open-source UO client in C#
- [ServUO GitHub](https://github.com/ServUO/ServUO) — UO server emulator (Movement.cs, FastAStarAlgorithm.cs, etc.)
- [RunUO GitHub](https://github.com/runuo/runuo) — Original open-source server emulator
- [OrionUO GitHub](https://github.com/Hotride/OrionUO) — Alternative open-source client

### Tools & Utilities
- [UOFiddler](https://uofiddler.polserver.com/) — Ultima SDK-based client file editor
- [CentrED#](https://github.com/kaczy93/centredsharp) — Open-source map editor
- [ReMapRenderer](https://github.com/cbnolok/ReMapRenderer) — Open source UO map renderer (C/SDL2)

### Community Resources
- [ServUO Forums — Movement/Pathing Threads](https://www.servuo.dev/)
- [UO Official Wiki — Movement and Travel](https://uo.com/wiki/ultima-online-wiki/beginning-the-adventure/movement-and-travel/)
- [Gabriel Gambetta — Client-Side Prediction](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html)
- [Clint Bellanger — Isometric Tiles Math](https://clintbellanger.net/articles/isometric_math/)
- [MuadDib's UO Packet Reference](https://mirror.ashkantra.de/joinuo/Documents/Packet%20Guides/2006-06-20%20PacketGuide_MuadDib.html)