import { Container, Graphics, Text } from 'pixi.js';
import { worldToScreen } from '../rendering/isometric';
import type { PlayerState } from '@shared/messages';
import { HIT_FLASH_MS } from '@shared/constants';
import { getTileElevation, Z_PIXEL_HEIGHT } from '@shared/terrain';

// Draw at 4x resolution, scale down for crisp detail
const S = 4;
const INV_S = 1 / S;

export class PlayerEntity {
  container: Container;
  #bodyContainer: Container;
  #body: Graphics;
  #shadow: Graphics;
  #nameTag: Text;
  #healthBar: Graphics;
  #isLocal: boolean;

  // Tile-based position
  #fromX = 0; #fromY = 0;
  #toX = 0; #toY = 0;
  #moveProgress = 1;

  // Walk animation
  #isMoving = false;
  #isRunning = false;
  #lastFrame = -1;

  // Attack animation
  #attackTimer = 0;
  #attackDuration = 300;
  #attackDirX = 0;
  #attackDirY = 0;

  // Hit flash
  #hitFlashTimer = 0;

  worldX = 0;
  worldY = 0;
  get tileX(): number { return Math.round(this.#toX); }
  get tileY(): number { return Math.round(this.#toY); }
  id: string;
  name: string;
  set isRunning(val: boolean) { this.#isRunning = val; }
  health = 50;
  maxHealth = 50;
  direction = 'DOWN';

  constructor(id: string, name: string, isLocal: boolean) {
    this.id = id;
    this.name = name;
    this.#isLocal = isLocal;
    this.container = new Container();

    this.#bodyContainer = new Container();

    this.#shadow = new Graphics();
    this.#shadow.ellipse(0, 2, 14, 6);
    this.#shadow.fill({ color: 0x000000, alpha: 0.3 });
    this.#bodyContainer.addChild(this.#shadow);

    this.#body = new Graphics();
    this.#body.scale.set(INV_S);
    this.#drawBody(0, false);
    this.#bodyContainer.addChild(this.#body);

    this.container.addChild(this.#bodyContainer);

    this.#nameTag = new Text({
      text: name,
      style: {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: 7,
        fill: isLocal ? 0x33dd33 : 0x8888ff,
        align: 'center',
        stroke: { color: 0x000000, width: 2 },
      },
    });
    this.#nameTag.anchor.set(0.5, 1);
    this.#nameTag.y = -44;
    this.container.addChild(this.#nameTag);

    this.#healthBar = new Graphics();
    this.#drawHealthBar();
    this.container.addChild(this.#healthBar);
  }

  #drawBody(frame: number, isAttacking: boolean): void {
    const key = isAttacking ? 100 + frame : frame;
    if (key === this.#lastFrame) return;
    this.#lastFrame = key;
    this.#body.clear();

    const isLocal = this.#isLocal;
    const legOffset = (frame === 1 ? 3 : frame === 2 ? -3 : 0) * S;
    const armSwing = (frame === 1 ? -2 : frame === 2 ? 2 : 0) * S;
    const atkArmR = isAttacking ? -8 * S : 0;
    const atkArmL = isAttacking ? 2 * S : 0;

    // ===== BOOTS =====
    // Left boot
    this.#body.roundRect(-6 * S + legOffset, -2 * S, 5 * S, 5 * S, 2);
    this.#body.fill({ color: 0x3a2818 });
    this.#body.stroke({ color: 0x1a0a00, width: 2 });
    // Boot sole
    this.#body.rect(-6 * S + legOffset, 2 * S, 5 * S, 1 * S);
    this.#body.fill({ color: 0x221408 });
    // Boot lace marks
    this.#body.moveTo(-5 * S + legOffset, -1 * S);
    this.#body.lineTo(-3 * S + legOffset, 0);
    this.#body.moveTo(-5 * S + legOffset, 0);
    this.#body.lineTo(-3 * S + legOffset, 1 * S);
    this.#body.stroke({ color: 0x5a4830, width: 1 });

    // Right boot
    this.#body.roundRect(1 * S - legOffset, -2 * S, 5 * S, 5 * S, 2);
    this.#body.fill({ color: 0x3a2818 });
    this.#body.stroke({ color: 0x1a0a00, width: 2 });
    this.#body.rect(1 * S - legOffset, 2 * S, 5 * S, 1 * S);
    this.#body.fill({ color: 0x221408 });
    this.#body.moveTo(2 * S - legOffset, -1 * S);
    this.#body.lineTo(4 * S - legOffset, 0);
    this.#body.moveTo(2 * S - legOffset, 0);
    this.#body.lineTo(4 * S - legOffset, 1 * S);
    this.#body.stroke({ color: 0x5a4830, width: 1 });

    // ===== LEGS (pants/leggings) =====
    // Left leg
    this.#body.rect(-5 * S + legOffset, -12 * S, 4 * S, 11 * S);
    this.#body.fill({ color: 0x3a4a6a });
    this.#body.stroke({ color: 0x1a2a3a, width: 2 });
    // Knee detail
    this.#body.ellipse(-3 * S + legOffset, -6 * S, 1.5 * S, 1 * S);
    this.#body.fill({ color: 0x324060, alpha: 0.5 });
    // Pant crease
    this.#body.moveTo(-5 * S + legOffset, -9 * S);
    this.#body.lineTo(-4 * S + legOffset, -7 * S);
    this.#body.stroke({ color: 0x2a3a5a, width: 1 });

    // Right leg
    this.#body.rect(1 * S - legOffset, -12 * S, 4 * S, 11 * S);
    this.#body.fill({ color: 0x3a4a6a });
    this.#body.stroke({ color: 0x1a2a3a, width: 2 });
    this.#body.ellipse(3 * S - legOffset, -6 * S, 1.5 * S, 1 * S);
    this.#body.fill({ color: 0x324060, alpha: 0.5 });
    this.#body.moveTo(1 * S - legOffset, -9 * S);
    this.#body.lineTo(2 * S - legOffset, -7 * S);
    this.#body.stroke({ color: 0x2a3a5a, width: 1 });

    // ===== TORSO (tunic + armor) =====
    const tunicBase = isLocal ? 0x2a6a2a : 0x4a4a8a;
    const tunicDark = isLocal ? 0x1e4e1e : 0x3a3a6a;
    const tunicLight = isLocal ? 0x3a8a3a : 0x5a5a9a;

    // Main torso
    this.#body.roundRect(-7 * S, -26 * S, 14 * S, 16 * S, 2);
    this.#body.fill({ color: tunicBase });
    this.#body.stroke({ color: tunicDark, width: 2 });

    // Collar / neckline (V shape)
    this.#body.moveTo(-2 * S, -26 * S);
    this.#body.lineTo(0, -23 * S);
    this.#body.lineTo(2 * S, -26 * S);
    this.#body.stroke({ color: tunicDark, width: 2 });
    // Collar fill (skin showing at neck)
    this.#body.poly([
      { x: -2 * S, y: -26 * S },
      { x: 0, y: -23 * S },
      { x: 2 * S, y: -26 * S },
    ]);
    this.#body.fill({ color: 0xd4a574 });

    // Tunic center seam
    this.#body.moveTo(0, -23 * S);
    this.#body.lineTo(0, -12 * S);
    this.#body.stroke({ color: tunicDark, width: 1.5 });

    // Chest highlight (leather piece)
    this.#body.roundRect(-5 * S, -25 * S, 4 * S, 8 * S, 1);
    this.#body.fill({ color: tunicLight, alpha: 0.3 });
    this.#body.roundRect(1 * S, -25 * S, 4 * S, 8 * S, 1);
    this.#body.fill({ color: tunicLight, alpha: 0.3 });

    // ===== BELT =====
    this.#body.rect(-7 * S, -13 * S, 14 * S, 3 * S);
    this.#body.fill({ color: 0x5a3a1a });
    this.#body.stroke({ color: 0x3a2010, width: 1 });
    // Belt buckle
    this.#body.roundRect(-1 * S, -13 * S, 2 * S, 3 * S, 1);
    this.#body.fill({ color: 0xccaa44 });
    this.#body.stroke({ color: 0x887722, width: 1 });
    // Buckle dot
    this.#body.circle(0, -11.5 * S, 0.5 * S);
    this.#body.fill({ color: 0xeedd66 });

    // ===== PAULDRONS (shoulder armor) =====
    // Left shoulder
    this.#body.roundRect(-9 * S, -26 * S, 3 * S, 5 * S, 2);
    this.#body.fill({ color: 0x666666 });
    this.#body.stroke({ color: 0x333333, width: 1.5 });
    // Rivet
    this.#body.circle(-7.5 * S, -24 * S, 0.6 * S);
    this.#body.fill({ color: 0x888888 });

    // Right shoulder
    this.#body.roundRect(6 * S, -26 * S, 3 * S, 5 * S, 2);
    this.#body.fill({ color: 0x666666 });
    this.#body.stroke({ color: 0x333333, width: 1.5 });
    this.#body.circle(7.5 * S, -24 * S, 0.6 * S);
    this.#body.fill({ color: 0x888888 });

    // ===== ARMS =====
    // Left arm (sleeve + bracer + hand)
    this.#body.rect(-10 * S, -24 * S + armSwing + atkArmL, 4 * S, 8 * S);
    this.#body.fill({ color: tunicBase });
    this.#body.stroke({ color: tunicDark, width: 1.5 });
    // Left bracer
    this.#body.rect(-10 * S, -17 * S + armSwing + atkArmL, 4 * S, 3 * S);
    this.#body.fill({ color: 0x5a3a1a });
    this.#body.stroke({ color: 0x3a2010, width: 1 });
    // Bracer strap
    this.#body.moveTo(-10 * S, -15.5 * S + armSwing + atkArmL);
    this.#body.lineTo(-6 * S, -15.5 * S + armSwing + atkArmL);
    this.#body.stroke({ color: 0x7a5a3a, width: 1 });
    // Left hand
    this.#body.roundRect(-10 * S, -14 * S + armSwing + atkArmL, 4 * S, 4 * S, 2);
    this.#body.fill({ color: 0xd4a574 });
    this.#body.stroke({ color: 0xb08050, width: 1 });

    // Right arm
    this.#body.rect(6 * S, -24 * S - armSwing + atkArmR, 4 * S, 8 * S);
    this.#body.fill({ color: tunicBase });
    this.#body.stroke({ color: tunicDark, width: 1.5 });
    // Right bracer
    this.#body.rect(6 * S, -17 * S - armSwing + atkArmR, 4 * S, 3 * S);
    this.#body.fill({ color: 0x5a3a1a });
    this.#body.stroke({ color: 0x3a2010, width: 1 });
    this.#body.moveTo(6 * S, -15.5 * S - armSwing + atkArmR);
    this.#body.lineTo(10 * S, -15.5 * S - armSwing + atkArmR);
    this.#body.stroke({ color: 0x7a5a3a, width: 1 });
    // Right hand (gripping sword)
    this.#body.roundRect(6 * S, -14 * S - armSwing + atkArmR, 4 * S, 4 * S, 2);
    this.#body.fill({ color: 0xd4a574 });
    this.#body.stroke({ color: 0xb08050, width: 1 });

    // ===== SWORD =====
    if (isAttacking) {
      // Sword swinging outward
      const swordY = -32 * S + atkArmR;
      // Blade
      this.#body.poly([
        { x: 7.5 * S, y: swordY },
        { x: 9 * S, y: swordY },
        { x: 9.5 * S, y: swordY + 14 * S },
        { x: 8 * S, y: swordY + 16 * S },
        { x: 7 * S, y: swordY + 14 * S },
      ]);
      this.#body.fill({ color: 0xbbbbcc });
      this.#body.stroke({ color: 0x666677, width: 1.5 });
      // Blade edge highlight
      this.#body.moveTo(8 * S, swordY + 1 * S);
      this.#body.lineTo(8.5 * S, swordY + 13 * S);
      this.#body.stroke({ color: 0xddddee, width: 1 });
      // Cross-guard
      this.#body.rect(5 * S, swordY + 14 * S, 7 * S, 2 * S);
      this.#body.fill({ color: 0x886622 });
      this.#body.stroke({ color: 0x553311, width: 1 });
      // Grip wrap
      this.#body.rect(7 * S, swordY + 16 * S, 2.5 * S, 4 * S);
      this.#body.fill({ color: 0x4a2a1a });
      // Grip wrap lines
      for (let i = 0; i < 3; i++) {
        this.#body.moveTo(7 * S, swordY + (16.5 + i * 1.2) * S);
        this.#body.lineTo(9.5 * S, swordY + (16.5 + i * 1.2) * S);
      }
      this.#body.stroke({ color: 0x6a4a3a, width: 0.8 });
      // Pommel
      this.#body.circle(8.25 * S, swordY + 21 * S, 1.2 * S);
      this.#body.fill({ color: 0xccaa44 });
      this.#body.stroke({ color: 0x887722, width: 1 });
    } else {
      // Sword at rest (on right side, pointing down)
      const swordY = -24 * S;
      // Blade
      this.#body.poly([
        { x: 8 * S, y: swordY },
        { x: 9.5 * S, y: swordY },
        { x: 10 * S, y: swordY + 12 * S },
        { x: 9 * S, y: swordY + 13 * S },
        { x: 7.5 * S, y: swordY + 12 * S },
      ]);
      this.#body.fill({ color: 0xaaaabb });
      this.#body.stroke({ color: 0x666677, width: 1 });
      // Edge
      this.#body.moveTo(8.5 * S, swordY + 1 * S);
      this.#body.lineTo(9 * S, swordY + 11 * S);
      this.#body.stroke({ color: 0xccccdd, width: 0.8 });
      // Cross-guard
      this.#body.rect(6 * S, swordY + 12 * S, 6 * S, 1.5 * S);
      this.#body.fill({ color: 0x775522 });
      this.#body.stroke({ color: 0x443311, width: 0.8 });
      // Grip
      this.#body.rect(7.5 * S, swordY + 13.5 * S, 2.5 * S, 3 * S);
      this.#body.fill({ color: 0x4a2a1a });
      // Pommel
      this.#body.circle(8.75 * S, swordY + 17 * S, 1 * S);
      this.#body.fill({ color: 0xbbaa44 });
    }

    // ===== HEAD =====
    // Neck
    this.#body.rect(-1.5 * S, -28 * S, 3 * S, 3 * S);
    this.#body.fill({ color: 0xd4a574 });

    // Head shape
    this.#body.roundRect(-5 * S, -38 * S, 10 * S, 12 * S, 3 * S);
    this.#body.fill({ color: 0xd4a574 });
    this.#body.stroke({ color: 0xb08050, width: 2 });

    // Ears
    this.#body.ellipse(-5 * S, -33 * S, 1.5 * S, 2 * S);
    this.#body.fill({ color: 0xc8976a });
    this.#body.stroke({ color: 0xb08050, width: 1 });
    this.#body.ellipse(5 * S, -33 * S, 1.5 * S, 2 * S);
    this.#body.fill({ color: 0xc8976a });
    this.#body.stroke({ color: 0xb08050, width: 1 });

    // Eyes - white
    this.#body.ellipse(-2 * S, -33 * S, 1.5 * S, 1.2 * S);
    this.#body.fill({ color: 0xffffff });
    this.#body.ellipse(2 * S, -33 * S, 1.5 * S, 1.2 * S);
    this.#body.fill({ color: 0xffffff });
    // Pupils
    this.#body.circle(-2 * S, -33 * S, 0.8 * S);
    this.#body.fill({ color: 0x2a4a22 });
    this.#body.circle(2 * S, -33 * S, 0.8 * S);
    this.#body.fill({ color: 0x2a4a22 });
    // Pupil highlights
    this.#body.circle(-1.6 * S, -33.4 * S, 0.3 * S);
    this.#body.fill({ color: 0xffffff });
    this.#body.circle(2.4 * S, -33.4 * S, 0.3 * S);
    this.#body.fill({ color: 0xffffff });

    // Eyebrows
    this.#body.moveTo(-3.5 * S, -35 * S);
    this.#body.lineTo(-0.5 * S, -34.5 * S);
    this.#body.moveTo(0.5 * S, -34.5 * S);
    this.#body.lineTo(3.5 * S, -35 * S);
    this.#body.stroke({ color: isLocal ? 0x3a1a08 : 0x1a0a00, width: 2 });

    // Nose
    this.#body.moveTo(0, -32 * S);
    this.#body.lineTo(0.5 * S, -30 * S);
    this.#body.lineTo(-0.5 * S, -30 * S);
    this.#body.stroke({ color: 0xc0956a, width: 1.5 });

    // Mouth
    this.#body.moveTo(-1.5 * S, -28.5 * S);
    this.#body.quadraticCurveTo(0, -28 * S, 1.5 * S, -28.5 * S);
    this.#body.stroke({ color: 0xa07050, width: 1.5 });

    // ===== HAIR =====
    const hairColor = isLocal ? 0x5a3010 : 0x221008;
    const hairDark = isLocal ? 0x3a1a08 : 0x110804;
    // Hair volume
    this.#body.roundRect(-6 * S, -41 * S, 12 * S, 8 * S, 3 * S);
    this.#body.fill({ color: hairColor });
    this.#body.stroke({ color: hairDark, width: 2 });
    // Hair strands
    this.#body.moveTo(-4 * S, -41 * S);
    this.#body.quadraticCurveTo(-3 * S, -39 * S, -5 * S, -36 * S);
    this.#body.moveTo(-1 * S, -41 * S);
    this.#body.quadraticCurveTo(0, -39 * S, -2 * S, -37 * S);
    this.#body.moveTo(2 * S, -41 * S);
    this.#body.quadraticCurveTo(3 * S, -39 * S, 1 * S, -37 * S);
    this.#body.moveTo(5 * S, -41 * S);
    this.#body.quadraticCurveTo(4 * S, -39 * S, 5.5 * S, -36 * S);
    this.#body.stroke({ color: hairDark, width: 1 });
  }

  #drawHealthBar(): void {
    this.#healthBar.clear();
    const w = 30;
    const h = 3;
    const y = -48;

    this.#healthBar.rect(-w / 2 - 1, y - 1, w + 2, h + 2);
    this.#healthBar.fill({ color: 0x000000 });

    const pct = this.health / this.maxHealth;
    if (pct > 0) {
      this.#healthBar.rect(-w / 2, y, w * pct, h);
      this.#healthBar.fill({ color: pct > 0.5 ? 0x22aa22 : pct > 0.25 ? 0xaaaa22 : 0xaa2222 });
    }
  }

  triggerAttack(targetWorldX: number, targetWorldY: number): void {
    this.#attackTimer = this.#attackDuration;
    const dx = targetWorldX - this.worldX;
    const dy = targetWorldY - this.worldY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    this.#attackDirX = dx / len;
    this.#attackDirY = dy / len;
  }

  triggerHitFlash(): void {
    this.#hitFlashTimer = HIT_FLASH_MS;
  }

  applyState(state: PlayerState): void {
    this.name = state.name;
    this.health = state.health;
    this.maxHealth = state.maxHealth;
    this.direction = state.direction;
    this.#nameTag.text = state.name;
    this.#drawHealthBar();

    this.#fromX = state.fromX;
    this.#fromY = state.fromY;
    this.#toX = state.x;
    this.#toY = state.y;
    this.#moveProgress = state.moveProgress;
    this.#isMoving = state.moveProgress < 1;
    this.#isRunning = state.isRunning ?? false;

    this.#updateVisualPosition();
  }

  #updateVisualPosition(): void {
    const t = this.#moveProgress;
    // Linear interpolation — constant speed during tile transitions.
    // Walk bob animation is handled separately in update().
    this.worldX = this.#fromX + (this.#toX - this.#fromX) * t;
    this.worldY = this.#fromY + (this.#toY - this.#fromY) * t;

    // Interpolate elevation between from-tile and to-tile
    const fromZ = getTileElevation(Math.round(this.#fromX), Math.round(this.#fromY));
    const toZ = getTileElevation(Math.round(this.#toX), Math.round(this.#toY));
    const z = fromZ + (toZ - fromZ) * t;

    const screen = worldToScreen(this.worldX, this.worldY);
    this.container.x = screen.screenX;
    this.container.y = screen.screenY - z * Z_PIXEL_HEIGHT;

    // Isometric depth for correct sort order (unaffected by elevation)
    this.container.zIndex = Math.floor((this.worldX + this.worldY) * 100);
  }

  update(dt: number): void {
    const isAttacking = this.#attackTimer > 0;

    if (isAttacking) {
      this.#attackTimer -= dt;
      const atkProgress = 1 - (this.#attackTimer / this.#attackDuration);
      const lunge = atkProgress < 0.4
        ? atkProgress / 0.4
        : 1 - (atkProgress - 0.4) / 0.6;
      const lungeAmount = 4;
      this.#bodyContainer.x = this.#attackDirX * lunge * lungeAmount;
      this.#bodyContainer.y = -this.#attackDirY * lunge * lungeAmount - Math.sin(atkProgress * Math.PI) * 2;
    } else if (this.#isMoving) {
      const bobFreq = this.#isRunning ? 2 : 1;
      const bobAmp = this.#isRunning ? 2 : 1.5;
      const stepCycle = Math.sin(this.#moveProgress * Math.PI * bobFreq);
      this.#bodyContainer.y = -Math.abs(stepCycle) * bobAmp;
      this.#bodyContainer.x = 0;
    } else {
      this.#bodyContainer.y = 0;
      this.#bodyContainer.x = 0;
    }

    if (isAttacking) {
      this.#drawBody(0, true);
    } else if (this.#isMoving) {
      const bobFreq = this.#isRunning ? 2 : 1;
      const stepCycle = Math.sin(this.#moveProgress * Math.PI * bobFreq);
      const frame = stepCycle > 0.2 ? 1 : stepCycle < -0.2 ? 2 : 0;
      this.#drawBody(frame, false);
    } else {
      this.#drawBody(0, false);
    }

    if (this.#hitFlashTimer > 0) {
      this.#hitFlashTimer -= dt;
      const flashIntensity = this.#hitFlashTimer / HIT_FLASH_MS;
      this.#body.tint = flashIntensity > 0.5 ? 0xff4444 : 0xffffff;
      if (this.#hitFlashTimer <= 0) this.#body.tint = 0xffffff;
    }

    this.#updateVisualPosition();
  }

  setPosition(x: number, y: number): void {
    this.worldX = x;
    this.worldY = y;
    this.#fromX = x;
    this.#fromY = y;
    this.#toX = x;
    this.#toY = y;
    this.#moveProgress = 1;
    this.#isMoving = false;

    const z = getTileElevation(Math.round(x), Math.round(y));
    const screen = worldToScreen(this.worldX, this.worldY);
    this.container.x = screen.screenX;
    this.container.y = screen.screenY - z * Z_PIXEL_HEIGHT;
    this.container.zIndex = Math.floor((this.worldX + this.worldY) * 100);
  }

  setTileMove(fromX: number, fromY: number, toX: number, toY: number, progress: number): void {
    this.#fromX = fromX;
    this.#fromY = fromY;
    this.#toX = toX;
    this.#toY = toY;
    this.#moveProgress = progress;
    this.#isMoving = progress < 1;
    this.#updateVisualPosition();
  }
}
