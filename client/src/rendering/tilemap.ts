import { Container, Graphics } from 'pixi.js';
import { TILE_WIDTH, TILE_HEIGHT, WORLD_TILES_X, WORLD_TILES_Y } from '@shared/constants';
import { TileType, getTileType, seededRandom } from '@shared/terrain';
import { worldToScreen } from './isometric';

// Base color per tile type
const TILE_BASE_COLOR: Record<TileType, number> = {
  [TileType.DEEP_WATER]:    0x142e4c,
  [TileType.SHALLOW_WATER]: 0x2a5a8c,
  [TileType.SAND]:          0xc2a960,
  [TileType.GRASS_LIGHT]:   0x5a8a42,
  [TileType.GRASS]:         0x4a7a32,
  [TileType.GRASS_DARK]:    0x3a6a22,
  [TileType.DIRT]:          0x8b6f47,
  [TileType.ROCK]:          0x6a6a6a,
  [TileType.FOREST]:        0x2a5a1a,
};

// Multiple color variants per tile type for natural variation
const TILE_VARIANTS: Record<TileType, number[]> = {
  [TileType.DEEP_WATER]:    [0x142e4c, 0x173152, 0x112b48, 0x152f50],
  [TileType.SHALLOW_WATER]: [0x2a5a8c, 0x2d5d8f, 0x275589, 0x305f90],
  [TileType.SAND]:          [0xc2a960, 0xb8a05a, 0xccb368, 0xbda85e, 0xd0b870],
  [TileType.GRASS_LIGHT]:   [0x5a8a42, 0x5e8e46, 0x56863e, 0x62924a, 0x528240],
  [TileType.GRASS]:         [0x4a7a32, 0x4e7e36, 0x46762e, 0x527e38, 0x44742c],
  [TileType.GRASS_DARK]:    [0x3a6a22, 0x3e6e26, 0x36661e, 0x42722a, 0x346420],
  [TileType.DIRT]:          [0x8b6f47, 0x87694a, 0x8f7544, 0x836540, 0x93794c],
  [TileType.ROCK]:          [0x6a6a6a, 0x666666, 0x6e6e6e, 0x626262, 0x727272],
  [TileType.FOREST]:        [0x2a5a1a, 0x2e5e1e, 0x265616, 0x32621e, 0x245214],
};

const VIEW_RADIUS = 60;

function getTileColor(x: number, y: number): number {
  const type = getTileType(x, y);
  const variants = TILE_VARIANTS[type];
  const rng = seededRandom(x * 73856093 + y * 19349663);
  return variants[Math.floor(rng() * variants.length)];
}

function blendColor(a: number, b: number, ratio: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * ratio);
  const g = Math.round(ag + (bg - ag) * ratio);
  const bl = Math.round(ab + (bb - ab) * ratio);
  return (r << 16) | (g << 8) | bl;
}

function darkenColor(c: number, amount: number): number {
  const r = Math.max(0, ((c >> 16) & 0xff) - amount);
  const g = Math.max(0, ((c >> 8) & 0xff) - amount);
  const b = Math.max(0, (c & 0xff) - amount);
  return (r << 16) | (g << 8) | b;
}

function lightenColor(c: number, amount: number): number {
  const r = Math.min(255, ((c >> 16) & 0xff) + amount);
  const g = Math.min(255, ((c >> 8) & 0xff) + amount);
  const b = Math.min(255, (c & 0xff) + amount);
  return (r << 16) | (g << 8) | b;
}

export class TileMap {
  container: Container;
  #tileGraphics: Graphics;
  #detailGraphics: Graphics;
  #decorGraphics: Graphics;
  #lastCenterX = -999;
  #lastCenterY = -999;

  constructor() {
    this.container = new Container();
    this.#tileGraphics = new Graphics();
    this.#detailGraphics = new Graphics();
    this.#decorGraphics = new Graphics();
    this.container.addChild(this.#tileGraphics);
    this.container.addChild(this.#detailGraphics);
    this.container.addChild(this.#decorGraphics);
  }

  updateView(centerTileX: number, centerTileY: number): void {
    const cx = Math.floor(centerTileX);
    const cy = Math.floor(centerTileY);

    if (Math.abs(cx - this.#lastCenterX) < 2 && Math.abs(cy - this.#lastCenterY) < 2) return;
    this.#lastCenterX = cx;
    this.#lastCenterY = cy;

    this.#tileGraphics.clear();
    this.#detailGraphics.clear();
    this.#decorGraphics.clear();

    const hw = TILE_WIDTH / 2 + 1;
    const hh = TILE_HEIGHT / 2 + 1;

    for (let dy = -VIEW_RADIUS; dy <= VIEW_RADIUS; dy++) {
      for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx < 0 || ty < 0 || tx >= WORLD_TILES_X || ty >= WORLD_TILES_Y) continue;

        const color = getTileColor(tx, ty);
        const tileType = getTileType(tx, ty);
        const screen = worldToScreen(tx, ty);
        const sx = screen.screenX;
        const sy = screen.screenY;

        // Base diamond
        this.#tileGraphics.poly([
          { x: sx, y: sy - hh },
          { x: sx + hw, y: sy },
          { x: sx, y: sy + hh },
          { x: sx - hw, y: sy },
        ]);
        this.#tileGraphics.fill({ color });

        const rng = seededRandom(tx * 12345 + ty * 67890);

        // Per-tile-type detail rendering
        this.#drawTileDetails(tileType, sx, sy, color, rng);

        // Edge blending
        this.#drawEdgeBlend(tx, ty, tileType, sx, sy);

        // Decorations (trees, rocks, flowers etc)
        this.#drawDecorations(tileType, tx, ty, sx, sy, rng);
      }
    }
  }

  #drawTileDetails(type: TileType, sx: number, sy: number, baseColor: number, rng: () => number): void {
    const g = this.#detailGraphics;

    switch (type) {
      case TileType.GRASS:
      case TileType.GRASS_LIGHT:
      case TileType.GRASS_DARK: {
        // Multiple grass blades per tile
        const bladeCount = 2 + Math.floor(rng() * 3);
        for (let i = 0; i < bladeCount; i++) {
          const bx = sx + (rng() - 0.5) * 14;
          const by = sy + (rng() - 0.5) * 6;
          const height = 2 + rng() * 3;
          const lean = (rng() - 0.5) * 2;
          const gc = type === TileType.GRASS_DARK
            ? (rng() > 0.5 ? 0x2a5a18 : 0x1e4e12)
            : type === TileType.GRASS_LIGHT
              ? (rng() > 0.5 ? 0x6a9a52 : 0x5e8e46)
              : (rng() > 0.5 ? 0x3a6a28 : 0x2e5e1c);
          g.moveTo(bx, by);
          g.lineTo(bx + lean, by - height);
          g.stroke({ color: gc, alpha: 0.6, width: 0.7 });
        }
        // Occasional small dirt patch
        if (rng() < 0.12) {
          const px = sx + (rng() - 0.5) * 8;
          const py = sy + (rng() - 0.5) * 3;
          g.ellipse(px, py, 1.5 + rng(), 0.8 + rng() * 0.5);
          g.fill({ color: 0x7a6a42, alpha: 0.35 });
        }
        // Tiny wildflower
        if (rng() < 0.06) {
          const fx = sx + (rng() - 0.5) * 10;
          const fy = sy + (rng() - 0.5) * 4;
          const flowerColor = [0xee4444, 0xeeee44, 0xbb44ee, 0xffaa22, 0x44aaee][Math.floor(rng() * 5)];
          g.circle(fx, fy - 1.5, 0.8);
          g.fill({ color: flowerColor, alpha: 0.8 });
          // Stem
          g.moveTo(fx, fy - 0.7);
          g.lineTo(fx, fy + 0.5);
          g.stroke({ color: 0x3a6a28, alpha: 0.5, width: 0.5 });
        }
        break;
      }

      case TileType.SAND: {
        // Sand ripple lines
        if (rng() < 0.5) {
          const rx = sx + (rng() - 0.5) * 10;
          const ry = sy + (rng() - 0.5) * 4;
          g.moveTo(rx - 4, ry);
          g.quadraticCurveTo(rx, ry - 0.8, rx + 4, ry);
          g.stroke({ color: lightenColor(baseColor, 15), alpha: 0.35, width: 0.5 });
        }
        // Sand grain dots
        const dotCount = 1 + Math.floor(rng() * 3);
        for (let i = 0; i < dotCount; i++) {
          const dotX = sx + (rng() - 0.5) * 13;
          const dotY = sy + (rng() - 0.5) * 5.5;
          g.circle(dotX, dotY, 0.3 + rng() * 0.3);
          g.fill({ color: lightenColor(baseColor, 20), alpha: 0.3 });
        }
        // Occasional shell
        if (rng() < 0.04) {
          const shx = sx + (rng() - 0.5) * 10;
          const shy = sy + (rng() - 0.5) * 3;
          g.ellipse(shx, shy, 1, 0.7);
          g.fill({ color: 0xeeddcc, alpha: 0.6 });
          g.stroke({ color: 0xccbbaa, alpha: 0.3, width: 0.4 });
        }
        break;
      }

      case TileType.DIRT: {
        // Pebbles (multiple)
        const pebbleCount = Math.floor(rng() * 3);
        for (let i = 0; i < pebbleCount; i++) {
          const px = sx + (rng() - 0.5) * 12;
          const py = sy + (rng() - 0.5) * 5;
          const pr = 0.4 + rng() * 0.6;
          g.circle(px, py, pr);
          g.fill({ color: darkenColor(baseColor, 15 + Math.floor(rng() * 20)), alpha: 0.5 });
        }
        // Dirt texture lines (small cracks)
        if (rng() < 0.3) {
          const cx = sx + (rng() - 0.5) * 10;
          const cy = sy + (rng() - 0.5) * 4;
          g.moveTo(cx, cy);
          g.lineTo(cx + (rng() - 0.5) * 4, cy + (rng() - 0.5) * 2);
          g.stroke({ color: darkenColor(baseColor, 20), alpha: 0.3, width: 0.4 });
        }
        // Occasional weed/dead grass
        if (rng() < 0.1) {
          const wx = sx + (rng() - 0.5) * 8;
          const wy = sy + (rng() - 0.5) * 3;
          g.moveTo(wx, wy);
          g.lineTo(wx + (rng() - 0.5) * 2, wy - 2);
          g.moveTo(wx + 1, wy);
          g.lineTo(wx + 1 + (rng() - 0.5), wy - 1.5);
          g.stroke({ color: 0x8a7a42, alpha: 0.4, width: 0.5 });
        }
        break;
      }

      case TileType.DEEP_WATER: {
        // Depth gradient (darker at center)
        g.ellipse(sx, sy, 6, 3);
        g.fill({ color: darkenColor(baseColor, 12), alpha: 0.25 });
        // Subtle ripple
        if (rng() < 0.3) {
          const wx = sx + (rng() - 0.5) * 8;
          const wy = sy + (rng() - 0.5) * 3;
          g.moveTo(wx - 3, wy);
          g.quadraticCurveTo(wx, wy - 0.5, wx + 3, wy);
          g.stroke({ color: 0xffffff, alpha: 0.06, width: 0.4 });
        }
        break;
      }

      case TileType.SHALLOW_WATER: {
        // Water shimmer/ripples
        const rippleCount = 1 + Math.floor(rng() * 2);
        for (let i = 0; i < rippleCount; i++) {
          const wx = sx + (rng() - 0.5) * 10;
          const wy = sy + (rng() - 0.5) * 4;
          const wlen = 2 + rng() * 3;
          g.moveTo(wx - wlen, wy);
          g.quadraticCurveTo(wx, wy - 0.6, wx + wlen, wy);
          g.stroke({ color: 0xffffff, alpha: 0.1, width: 0.5 });
        }
        // Light reflection spot
        if (rng() < 0.15) {
          const lx = sx + (rng() - 0.5) * 8;
          const ly = sy + (rng() - 0.5) * 3;
          g.circle(lx, ly, 0.6);
          g.fill({ color: 0xffffff, alpha: 0.1 });
        }
        break;
      }

      case TileType.ROCK: {
        // Rock cracks (more detailed)
        if (rng() < 0.4) {
          const cx = sx + (rng() - 0.5) * 10;
          const cy = sy + (rng() - 0.5) * 4;
          const dx1 = (rng() - 0.5) * 5;
          const dy1 = (rng() - 0.5) * 2.5;
          g.moveTo(cx, cy);
          g.lineTo(cx + dx1, cy + dy1);
          // Branch crack
          if (rng() < 0.5) {
            g.moveTo(cx + dx1 * 0.6, cy + dy1 * 0.6);
            g.lineTo(cx + dx1 * 0.6 + (rng() - 0.5) * 3, cy + dy1 * 0.6 + (rng() - 0.5) * 2);
          }
          g.stroke({ color: darkenColor(baseColor, 25), alpha: 0.4, width: 0.5 });
        }
        // Lichen/moss patches
        if (rng() < 0.15) {
          const mx = sx + (rng() - 0.5) * 8;
          const my = sy + (rng() - 0.5) * 3;
          g.ellipse(mx, my, 1.5 + rng(), 0.8 + rng() * 0.5);
          g.fill({ color: 0x5a7a3a, alpha: 0.3 });
        }
        // Stone texture dots
        const stoneCount = Math.floor(rng() * 3);
        for (let i = 0; i < stoneCount; i++) {
          const dotX = sx + (rng() - 0.5) * 12;
          const dotY = sy + (rng() - 0.5) * 5;
          g.circle(dotX, dotY, 0.3);
          g.fill({ color: lightenColor(baseColor, 10 + Math.floor(rng() * 15)), alpha: 0.25 });
        }
        break;
      }

      case TileType.FOREST: {
        // Forest floor — fallen leaves, twigs, undergrowth
        // Leaf scatter
        const leafCount = 2 + Math.floor(rng() * 3);
        for (let i = 0; i < leafCount; i++) {
          const lx = sx + (rng() - 0.5) * 12;
          const ly = sy + (rng() - 0.5) * 5;
          const leafColor = [0x7a5a1a, 0x8a6a2a, 0x5a4a12, 0x6a5a18][Math.floor(rng() * 4)];
          g.ellipse(lx, ly, 0.8 + rng() * 0.5, 0.4 + rng() * 0.3);
          g.fill({ color: leafColor, alpha: 0.4 });
        }
        // Small twig
        if (rng() < 0.2) {
          const twx = sx + (rng() - 0.5) * 10;
          const twy = sy + (rng() - 0.5) * 4;
          g.moveTo(twx, twy);
          g.lineTo(twx + (rng() - 0.5) * 5, twy + (rng() - 0.5) * 2);
          g.stroke({ color: 0x5a3a1a, alpha: 0.3, width: 0.5 });
        }
        // Mushroom
        if (rng() < 0.04) {
          const mx = sx + (rng() - 0.5) * 8;
          const my = sy + (rng() - 0.5) * 3;
          // Stem
          g.rect(mx - 0.3, my - 1, 0.6, 1.5);
          g.fill({ color: 0xddddbb, alpha: 0.6 });
          // Cap
          g.ellipse(mx, my - 1.3, 1.2, 0.7);
          g.fill({ color: 0xcc4422, alpha: 0.6 });
        }
        break;
      }
    }
  }

  #drawEdgeBlend(tx: number, ty: number, tileType: TileType, sx: number, sy: number): void {
    const qw = TILE_WIDTH / 4;
    const qh = TILE_HEIGHT / 4;
    const myColor = TILE_BASE_COLOR[tileType];

    const neighbors = [
      { nx: tx, ny: ty - 1, dir: 'N' },
      { nx: tx + 1, ny: ty, dir: 'E' },
      { nx: tx, ny: ty + 1, dir: 'S' },
      { nx: tx - 1, ny: ty, dir: 'W' },
    ];

    for (const n of neighbors) {
      if (n.nx < 0 || n.ny < 0 || n.nx >= WORLD_TILES_X || n.ny >= WORLD_TILES_Y) continue;
      const neighborType = getTileType(n.nx, n.ny);
      if (neighborType === tileType) continue;

      const neighborColor = TILE_BASE_COLOR[neighborType];
      const blended = blendColor(myColor, neighborColor, 0.4);

      if (n.dir === 'N') {
        this.#tileGraphics.poly([
          { x: sx, y: sy - TILE_HEIGHT / 2 },
          { x: sx + qw, y: sy - qh },
          { x: sx - qw, y: sy - qh },
        ]);
      } else if (n.dir === 'E') {
        this.#tileGraphics.poly([
          { x: sx + TILE_WIDTH / 2, y: sy },
          { x: sx + qw, y: sy - qh },
          { x: sx + qw, y: sy + qh },
        ]);
      } else if (n.dir === 'S') {
        this.#tileGraphics.poly([
          { x: sx, y: sy + TILE_HEIGHT / 2 },
          { x: sx + qw, y: sy + qh },
          { x: sx - qw, y: sy + qh },
        ]);
      } else {
        this.#tileGraphics.poly([
          { x: sx - TILE_WIDTH / 2, y: sy },
          { x: sx - qw, y: sy - qh },
          { x: sx - qw, y: sy + qh },
        ]);
      }
      this.#tileGraphics.fill({ color: blended, alpha: 0.6 });
    }
  }

  #drawDecorations(type: TileType, tx: number, ty: number, sx: number, sy: number, rng: () => number): void {
    // Trees in forest
    if (type === TileType.FOREST && rng() < 0.5) {
      this.#drawTree(sx + (rng() - 0.5) * 6, sy - 4, rng);
    }
    // Occasional tree in dark grass
    if (type === TileType.GRASS_DARK && rng() < 0.04) {
      this.#drawTree(sx, sy - 4, rng);
    }
    // Rocks on rock terrain
    if (type === TileType.ROCK && rng() < 0.2) {
      this.#drawRock(sx + (rng() - 0.5) * 8, sy - 1, rng);
    }
    // Boulder on dirt
    if (type === TileType.DIRT && rng() < 0.03) {
      this.#drawRock(sx + (rng() - 0.5) * 6, sy, rng);
    }
    // Reeds near water
    if (type === TileType.SAND) {
      // Check if adjacent to water
      const hasWaterNeighbor = (
        getTileType(tx, ty - 1) === TileType.SHALLOW_WATER ||
        getTileType(tx, ty + 1) === TileType.SHALLOW_WATER ||
        getTileType(tx - 1, ty) === TileType.SHALLOW_WATER ||
        getTileType(tx + 1, ty) === TileType.SHALLOW_WATER
      );
      if (hasWaterNeighbor && rng() < 0.15) {
        this.#drawReeds(sx + (rng() - 0.5) * 8, sy - 1, rng);
      }
    }
    // Lily pads in shallow water
    if (type === TileType.SHALLOW_WATER && rng() < 0.04) {
      this.#drawLilyPad(sx + (rng() - 0.5) * 8, sy + (rng() - 0.5) * 3, rng);
    }

    // World objects — sparse, deterministic based on tile hash
    // Use a separate RNG so object placement doesn't shift when detail randomness changes
    const objRng = seededRandom(tx * 982451653 + ty * 795028841 + 7);
    const objRoll = objRng();

    // Campfires on grass/dirt (very rare ~1 in 2000 tiles)
    if ((type === TileType.GRASS || type === TileType.GRASS_LIGHT || type === TileType.DIRT) && objRoll < 0.0005) {
      this.#drawCampfire(sx, sy - 2, objRng);
    }
    // Ruins on grass/dirt/rock (very rare)
    if ((type === TileType.GRASS || type === TileType.DIRT || type === TileType.ROCK) && objRoll >= 0.0005 && objRoll < 0.001) {
      this.#drawRuins(sx, sy - 2, objRng);
    }
    // Wells on grass (very rare)
    if ((type === TileType.GRASS || type === TileType.GRASS_LIGHT) && objRoll >= 0.001 && objRoll < 0.0013) {
      this.#drawWell(sx, sy - 3, objRng);
    }
    // Signposts on dirt/grass near paths (rare)
    if ((type === TileType.DIRT || type === TileType.GRASS) && objRoll >= 0.0013 && objRoll < 0.002) {
      this.#drawSignpost(sx, sy - 2, objRng);
    }
    // Gravestones on dark grass (rare)
    if (type === TileType.GRASS_DARK && objRoll < 0.001) {
      this.#drawGravestone(sx, sy - 2, objRng);
    }
  }

  #drawTree(x: number, y: number, rng: () => number): void {
    const d = this.#decorGraphics;
    const size = 4 + rng() * 3;
    const treeType = rng();

    // Shadow on ground
    d.ellipse(x, y + 2, size * 0.6, size * 0.25);
    d.fill({ color: 0x000000, alpha: 0.15 });

    if (treeType < 0.5) {
      // Deciduous tree
      // Trunk with bark texture
      d.rect(x - 1.5, y - 3, 3, 7);
      d.fill({ color: 0x5a3a1a });
      d.stroke({ color: 0x3a2010, width: 0.8 });
      // Bark lines
      d.moveTo(x - 0.5, y - 2);
      d.lineTo(x - 0.5, y + 2);
      d.moveTo(x + 0.5, y - 1);
      d.lineTo(x + 0.5, y + 3);
      d.stroke({ color: 0x4a2a10, alpha: 0.4, width: 0.4 });

      // Branch and canopy
      const green = [0x2a5a1a, 0x1e4e0e, 0x366a26, 0x2e6220][Math.floor(rng() * 4)];
      const greenDark = darkenColor(green, 20);

      // Main canopy (overlapping ellipses for volume)
      d.ellipse(x - 1, y - 6, size * 0.7, size * 0.5);
      d.fill({ color: green });
      d.ellipse(x + 1.5, y - 7, size * 0.6, size * 0.45);
      d.fill({ color: lightenColor(green, 8) });
      d.ellipse(x, y - 8, size * 0.8, size * 0.6);
      d.fill({ color: green });

      // Canopy outline
      d.ellipse(x, y - 7, size, size * 0.65);
      d.stroke({ color: greenDark, alpha: 0.4, width: 0.6 });

      // Leaf texture (small dots in canopy)
      for (let i = 0; i < 4; i++) {
        const lx = x + (rng() - 0.5) * size * 1.4;
        const ly = y - 7 + (rng() - 0.5) * size * 0.8;
        d.circle(lx, ly, 0.5);
        d.fill({ color: lightenColor(green, 15), alpha: 0.4 });
      }
    } else {
      // Conifer / pine tree
      // Trunk
      d.rect(x - 1, y - 2, 2, 6);
      d.fill({ color: 0x5a3a1a });
      d.stroke({ color: 0x3a2010, width: 0.6 });

      // Layered triangle canopy
      const green = [0x1a4a0e, 0x224e14, 0x1e5210][Math.floor(rng() * 3)];
      for (let layer = 0; layer < 3; layer++) {
        const layerY = y - 4 - layer * 3;
        const layerW = size * (0.9 - layer * 0.2);
        const layerH = 3.5;
        d.poly([
          { x: x, y: layerY - layerH },
          { x: x + layerW, y: layerY },
          { x: x - layerW, y: layerY },
        ]);
        d.fill({ color: layer === 0 ? darkenColor(green, 8) : layer === 1 ? green : lightenColor(green, 5) });
        d.stroke({ color: darkenColor(green, 15), alpha: 0.3, width: 0.4 });
      }
    }
  }

  #drawRock(x: number, y: number, rng: () => number): void {
    const d = this.#decorGraphics;
    const w = 3 + rng() * 4;
    const h = 2 + rng() * 2.5;

    // Shadow
    d.ellipse(x + 0.5, y + 1, w * 0.8, h * 0.5);
    d.fill({ color: 0x000000, alpha: 0.15 });

    // Rock body
    d.ellipse(x, y - h * 0.3, w, h);
    d.fill({ color: 0x808080 });
    d.stroke({ color: 0x555555, width: 0.6 });

    // Highlight on top
    d.ellipse(x - w * 0.15, y - h * 0.6, w * 0.5, h * 0.35);
    d.fill({ color: 0x999999, alpha: 0.4 });

    // Crack
    if (rng() < 0.5) {
      d.moveTo(x - w * 0.3, y - h * 0.2);
      d.lineTo(x + w * 0.2, y + h * 0.3);
      d.stroke({ color: 0x444444, alpha: 0.4, width: 0.4 });
    }

    // Moss on north side
    if (rng() < 0.3) {
      d.ellipse(x - w * 0.2, y - h * 0.5, w * 0.3, h * 0.25);
      d.fill({ color: 0x5a7a3a, alpha: 0.4 });
    }
  }

  #drawReeds(x: number, y: number, rng: () => number): void {
    const d = this.#decorGraphics;
    const count = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < count; i++) {
      const rx = x + (rng() - 0.5) * 4;
      const ry = y;
      const height = 3 + rng() * 3;
      const lean = (rng() - 0.5) * 1.5;
      d.moveTo(rx, ry);
      d.quadraticCurveTo(rx + lean * 0.5, ry - height * 0.6, rx + lean, ry - height);
      d.stroke({ color: 0x6a8a3a, alpha: 0.6, width: 0.6 });
      // Reed tip
      if (rng() < 0.5) {
        d.ellipse(rx + lean, ry - height - 0.5, 0.6, 1);
        d.fill({ color: 0x8a7a4a, alpha: 0.5 });
      }
    }
  }

  #drawLilyPad(x: number, y: number, rng: () => number): void {
    const d = this.#decorGraphics;
    const size = 1.5 + rng() * 1.5;
    d.ellipse(x, y, size, size * 0.5);
    d.fill({ color: 0x3a7a2a, alpha: 0.6 });
    d.moveTo(x, y);
    d.lineTo(x + size * 0.5, y - size * 0.2);
    d.stroke({ color: 0x2a5a1a, alpha: 0.3, width: 0.4 });
    if (rng() < 0.3) {
      d.circle(x + size * 0.3, y - size * 0.15, 0.6);
      d.fill({ color: 0xffaacc, alpha: 0.5 });
    }
  }

  #drawCampfire(x: number, y: number, rng: () => number): void {
    const d = this.#decorGraphics;

    // Ground circle (ash ring)
    d.ellipse(x, y + 1, 6, 3);
    d.fill({ color: 0x333333, alpha: 0.3 });
    d.ellipse(x, y + 1, 4, 2);
    d.fill({ color: 0x2a2a2a, alpha: 0.3 });

    // Ring of stones
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + rng() * 0.3;
      const rx = x + Math.cos(angle) * 5;
      const ry = y + 1 + Math.sin(angle) * 2.2;
      d.ellipse(rx, ry, 1.2 + rng() * 0.5, 0.8 + rng() * 0.3);
      d.fill({ color: rng() > 0.5 ? 0x666666 : 0x777777 });
      d.stroke({ color: 0x444444, width: 0.3 });
    }

    // Logs (crossed)
    d.rect(x - 4, y - 0.5, 8, 1.5);
    d.fill({ color: 0x4a2a10 });
    d.stroke({ color: 0x2a1a08, width: 0.3 });
    // Second log crossing
    d.poly([
      { x: x - 1, y: y - 2 },
      { x: x + 1, y: y - 2 },
      { x: x + 3, y: y + 1.5 },
      { x: x + 1, y: y + 1.5 },
    ]);
    d.fill({ color: 0x3a2010 });
    d.stroke({ color: 0x2a1a08, width: 0.3 });

    // Embers / charred wood
    d.ellipse(x, y - 0.5, 2, 1);
    d.fill({ color: 0x331100, alpha: 0.4 });

    // Fire flames
    // Outer glow
    d.ellipse(x, y - 4, 3.5, 4);
    d.fill({ color: 0xff6600, alpha: 0.15 });

    // Main flames
    d.poly([
      { x: x - 2, y: y },
      { x: x - 1.5, y: y - 4 },
      { x: x - 0.5, y: y - 2 },
      { x: x, y: y - 6 },
      { x: x + 0.5, y: y - 3 },
      { x: x + 1.5, y: y - 5 },
      { x: x + 2, y: y },
    ]);
    d.fill({ color: 0xee6600, alpha: 0.7 });

    // Inner flame (yellow core)
    d.poly([
      { x: x - 1, y: y - 0.5 },
      { x: x - 0.5, y: y - 3 },
      { x: x, y: y - 4.5 },
      { x: x + 0.5, y: y - 3 },
      { x: x + 1, y: y - 0.5 },
    ]);
    d.fill({ color: 0xffcc22, alpha: 0.8 });

    // Spark dots
    d.circle(x - 1.5, y - 6.5, 0.3);
    d.circle(x + 1, y - 7, 0.25);
    d.fill({ color: 0xffaa00, alpha: 0.6 });
  }

  #drawRuins(x: number, y: number, rng: () => number): void {
    const d = this.#decorGraphics;
    const variant = rng();

    // Ground rubble
    d.ellipse(x, y + 2, 8, 3);
    d.fill({ color: 0x555555, alpha: 0.15 });

    if (variant < 0.5) {
      // Broken wall / pillar remains
      // Base stones
      d.rect(x - 5, y - 1, 4, 3);
      d.fill({ color: 0x888877 });
      d.stroke({ color: 0x555544, width: 0.5 });

      d.rect(x + 1, y - 2, 3, 4);
      d.fill({ color: 0x7a7a6a });
      d.stroke({ color: 0x555544, width: 0.5 });

      // Tall remaining pillar
      d.rect(x - 3, y - 10, 3, 11);
      d.fill({ color: 0x8a8a7a });
      d.stroke({ color: 0x555544, width: 0.6 });
      // Pillar damage (jagged top)
      d.poly([
        { x: x - 3, y: y - 10 },
        { x: x - 2, y: y - 12 },
        { x: x - 1, y: y - 10.5 },
        { x: x, y: y - 11.5 },
        { x: x, y: y - 10 },
      ]);
      d.fill({ color: 0x8a8a7a });
      // Cracks in pillar
      d.moveTo(x - 2, y - 9);
      d.lineTo(x - 1.5, y - 6);
      d.lineTo(x - 2.5, y - 3);
      d.stroke({ color: 0x5a5a4a, width: 0.4 });

      // Moss growing on stone
      d.ellipse(x - 2, y - 2, 1.5, 0.8);
      d.fill({ color: 0x4a7a2a, alpha: 0.4 });

      // Scattered rubble
      d.circle(x + 4, y + 1, 0.8);
      d.circle(x + 5, y, 0.6);
      d.fill({ color: 0x777766 });
    } else {
      // Archway fragment
      // Left column base
      d.rect(x - 6, y - 6, 3, 8);
      d.fill({ color: 0x8a8a7a });
      d.stroke({ color: 0x555544, width: 0.5 });
      // Right column (shorter, broken)
      d.rect(x + 3, y - 3, 3, 5);
      d.fill({ color: 0x7a7a6a });
      d.stroke({ color: 0x555544, width: 0.5 });
      // Arch remnant (partial curve on left)
      d.moveTo(x - 3, y - 6);
      d.quadraticCurveTo(x, y - 9, x + 2, y - 7);
      d.stroke({ color: 0x8a8a7a, width: 2 });
      // Broken end
      d.moveTo(x + 2, y - 7);
      d.lineTo(x + 2.5, y - 6.5);
      d.stroke({ color: 0x7a7a6a, width: 1 });

      // Vine growing on ruins
      d.moveTo(x - 5, y - 6);
      d.quadraticCurveTo(x - 4, y - 8, x - 3, y - 7);
      d.stroke({ color: 0x3a6a2a, alpha: 0.5, width: 0.6 });
      // Leaves on vine
      d.circle(x - 4, y - 7.5, 0.5);
      d.fill({ color: 0x4a8a3a, alpha: 0.4 });

      // Rubble pile
      d.ellipse(x + 5, y, 2, 1);
      d.fill({ color: 0x666655 });
      d.circle(x + 4.5, y - 0.5, 0.7);
      d.fill({ color: 0x777766 });
    }
  }

  #drawWell(x: number, y: number, rng: () => number): void {
    const d = this.#decorGraphics;

    // Shadow
    d.ellipse(x, y + 3, 5, 2);
    d.fill({ color: 0x000000, alpha: 0.15 });

    // Stone base (circular wall)
    d.ellipse(x, y, 5, 2.5);
    d.fill({ color: 0x888877 });
    d.stroke({ color: 0x555544, width: 0.6 });

    // Inner well (dark)
    d.ellipse(x, y - 0.5, 3.5, 1.8);
    d.fill({ color: 0x111122 });

    // Water shimmer inside
    d.ellipse(x, y - 0.3, 2.5, 1.2);
    d.fill({ color: 0x1a3a5c, alpha: 0.6 });
    // Water highlight
    d.ellipse(x - 0.5, y - 0.6, 1, 0.4);
    d.fill({ color: 0x3a6a9c, alpha: 0.3 });

    // Stone rim (top edge)
    d.ellipse(x, y - 1, 5, 2.5);
    d.stroke({ color: 0x666655, width: 1 });

    // Wooden frame (A-frame with cross beam)
    // Left post
    d.rect(x - 4, y - 8, 1.2, 8);
    d.fill({ color: 0x5a3a1a });
    d.stroke({ color: 0x3a2010, width: 0.4 });
    // Right post
    d.rect(x + 3, y - 8, 1.2, 8);
    d.fill({ color: 0x5a3a1a });
    d.stroke({ color: 0x3a2010, width: 0.4 });
    // Cross beam
    d.rect(x - 4.5, y - 8.5, 10, 1);
    d.fill({ color: 0x5a3a1a });
    d.stroke({ color: 0x3a2010, width: 0.4 });

    // Rope
    d.moveTo(x, y - 8);
    d.quadraticCurveTo(x + 1, y - 5, x + 0.5, y - 2);
    d.stroke({ color: 0x8a7a5a, width: 0.6 });

    // Bucket
    d.roundRect(x - 0.5, y - 2.5, 2, 1.5, 0.3);
    d.fill({ color: 0x5a4a3a });
    d.stroke({ color: 0x3a2a1a, width: 0.3 });

    // Stone detail (individual stones visible)
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI + rng() * 0.3;
      const sx2 = x + Math.cos(angle) * 4;
      const sy2 = y + Math.sin(angle) * 2;
      d.moveTo(sx2 - 1, sy2);
      d.lineTo(sx2 + 1, sy2);
      d.stroke({ color: 0x666655, alpha: 0.4, width: 0.3 });
    }
  }

  #drawSignpost(x: number, y: number, rng: () => number): void {
    const d = this.#decorGraphics;

    // Shadow
    d.ellipse(x, y + 2, 3, 1);
    d.fill({ color: 0x000000, alpha: 0.12 });

    // Wooden post
    d.rect(x - 0.8, y - 8, 1.6, 10);
    d.fill({ color: 0x6a4a2a });
    d.stroke({ color: 0x3a2010, width: 0.5 });
    // Post grain
    d.moveTo(x - 0.2, y - 7);
    d.lineTo(x - 0.2, y + 1);
    d.moveTo(x + 0.3, y - 6);
    d.lineTo(x + 0.3, y);
    d.stroke({ color: 0x5a3a1a, alpha: 0.3, width: 0.3 });

    // Sign board (angled, like pointing a direction)
    const signDir = rng() > 0.5 ? 1 : -1;
    d.poly([
      { x: x - 1, y: y - 8 },
      { x: x + signDir * 8, y: y - 8 },
      { x: x + signDir * 9, y: y - 7 },
      { x: x + signDir * 8, y: y - 6 },
      { x: x - 1, y: y - 6 },
    ]);
    d.fill({ color: 0x7a5a3a });
    d.stroke({ color: 0x4a3020, width: 0.5 });

    // Text lines on sign (too small to read, just decorative)
    d.moveTo(x + signDir * 1, y - 7.5);
    d.lineTo(x + signDir * 6, y - 7.5);
    d.moveTo(x + signDir * 1, y - 6.8);
    d.lineTo(x + signDir * 5, y - 6.8);
    d.stroke({ color: 0x3a2010, alpha: 0.4, width: 0.4 });

    // Nail/bolt holding sign
    d.circle(x, y - 7, 0.4);
    d.fill({ color: 0x888888 });

    // Second sign board (optional, different direction)
    if (rng() < 0.5) {
      const sd2 = -signDir;
      d.poly([
        { x: x - 1, y: y - 5.5 },
        { x: x + sd2 * 7, y: y - 5.5 },
        { x: x + sd2 * 8, y: y - 4.75 },
        { x: x + sd2 * 7, y: y - 4 },
        { x: x - 1, y: y - 4 },
      ]);
      d.fill({ color: 0x6a5030 });
      d.stroke({ color: 0x4a3020, width: 0.4 });
      d.moveTo(x + sd2 * 1, y - 5);
      d.lineTo(x + sd2 * 5, y - 5);
      d.stroke({ color: 0x3a2010, alpha: 0.3, width: 0.3 });
    }
  }

  #drawGravestone(x: number, y: number, rng: () => number): void {
    const d = this.#decorGraphics;

    // Shadow
    d.ellipse(x, y + 1, 3, 1);
    d.fill({ color: 0x000000, alpha: 0.15 });

    // Ground mound
    d.ellipse(x, y + 0.5, 4, 1.5);
    d.fill({ color: darkenColor(0x3a6a22, 15), alpha: 0.3 });

    // Stone
    const variant = rng();
    if (variant < 0.5) {
      // Simple rounded headstone
      d.roundRect(x - 2, y - 6, 4, 7, 2);
      d.fill({ color: 0x777766 });
      d.stroke({ color: 0x555544, width: 0.5 });
      // Cross etching
      d.moveTo(x, y - 5);
      d.lineTo(x, y - 2);
      d.moveTo(x - 1, y - 4);
      d.lineTo(x + 1, y - 4);
      d.stroke({ color: 0x555544, alpha: 0.5, width: 0.4 });
    } else {
      // Gothic pointed top
      d.poly([
        { x: x - 2, y: y + 1 },
        { x: x - 2, y: y - 4 },
        { x: x, y: y - 7 },
        { x: x + 2, y: y - 4 },
        { x: x + 2, y: y + 1 },
      ]);
      d.fill({ color: 0x666655 });
      d.stroke({ color: 0x444433, width: 0.5 });
      // Text lines
      d.moveTo(x - 1, y - 3);
      d.lineTo(x + 1, y - 3);
      d.moveTo(x - 0.8, y - 2);
      d.lineTo(x + 0.8, y - 2);
      d.stroke({ color: 0x444433, alpha: 0.4, width: 0.3 });
    }

    // Moss on stone
    if (rng() < 0.4) {
      d.ellipse(x - 1, y - 1, 1, 0.6);
      d.fill({ color: 0x4a7a2a, alpha: 0.35 });
    }

    // Dead flowers
    if (rng() < 0.3) {
      d.circle(x + 2.5, y, 0.5);
      d.circle(x + 3, y + 0.3, 0.4);
      d.fill({ color: 0x8a6a5a, alpha: 0.4 });
    }
  }
}
