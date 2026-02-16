import { Container, Graphics, Text } from 'pixi.js';
import { worldToScreen } from '../rendering/isometric';
import type { EnemyState } from '@shared/messages';
import { HIT_FLASH_MS } from '@shared/constants';

// Draw at 4x resolution, scale down for crisp detail
const S = 4;
const INV_S = 1 / S;

export class EnemyEntity {
  container: Container;
  #bodyContainer: Container;
  #body: Graphics;
  #shadow: Graphics;
  #nameTag: Text;
  #healthBar: Graphics;

  // Tile-based position
  #fromX = 0; #fromY = 0;
  #toX = 0; #toY = 0;
  #moveProgress = 1;
  #lastFrame = -1;

  // Hit flash
  #hitFlashTimer = 0;
  #recoilTimer = 0;
  #recoilDirX = 0;
  #recoilDirY = 0;

  worldX = 0;
  worldY = 0;
  id: string;
  enemyType: string;
  health = 20;
  maxHealth = 20;
  direction = 'DOWN';
  isMoving = false;

  constructor(id: string, enemyType: string) {
    this.id = id;
    this.enemyType = enemyType;
    this.container = new Container();

    this.#bodyContainer = new Container();

    const shadowRx = enemyType === 'SPIDER' ? 16 : enemyType === 'ORC' ? 14 : 12;
    const shadowRy = enemyType === 'SPIDER' ? 7 : 6;
    this.#shadow = new Graphics();
    this.#shadow.ellipse(0, 2, shadowRx, shadowRy);
    this.#shadow.fill({ color: 0x000000, alpha: 0.3 });
    this.#bodyContainer.addChild(this.#shadow);

    this.#body = new Graphics();
    this.#body.scale.set(INV_S);
    this.#drawBody(0);
    this.#bodyContainer.addChild(this.#body);

    this.container.addChild(this.#bodyContainer);

    const nameY = enemyType === 'ORC' ? -54 : enemyType === 'SKELETON' ? -44 : -28;
    this.#nameTag = new Text({
      text: this.#getDisplayName(),
      style: {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: 6,
        fill: 0xcc4444,
        align: 'center',
        stroke: { color: 0x000000, width: 2 },
      },
    });
    this.#nameTag.anchor.set(0.5, 1);
    this.#nameTag.y = nameY;
    this.container.addChild(this.#nameTag);

    this.#healthBar = new Graphics();
    this.#drawHealthBar();
    this.container.addChild(this.#healthBar);
  }

  #getDisplayName(): string {
    switch (this.enemyType) {
      case 'SPIDER': return 'a giant spider';
      case 'SKELETON': return 'a skeleton';
      case 'ORC': return 'an orc';
      default: return 'a creature';
    }
  }

  #drawBody(frame: number): void {
    if (frame === this.#lastFrame) return;
    this.#lastFrame = frame;
    this.#body.clear();
    if (this.enemyType === 'SPIDER') this.#drawSpider(frame);
    else if (this.enemyType === 'SKELETON') this.#drawSkeleton(frame);
    else if (this.enemyType === 'ORC') this.#drawOrc(frame);
  }

  #drawSpider(frame: number): void {
    const legAnim = (frame === 1 ? 3 : frame === 2 ? -3 : 0) * S;

    // ===== LEGS (8 legs, 4 per side) =====
    // Draw legs first (behind body)
    const legPairs = [
      { bx: 9, by: -12, mx: 18, my: -18, ex: 22, ey: -2 },
      { bx: 10, by: -8, mx: 21, my: -12, ex: 24, ey: 1 },
      { bx: 10, by: -4, mx: 20, my: -6, ex: 23, ey: 4 },
      { bx: 8, by: -1, mx: 16, my: -2, ex: 20, ey: 6 },
    ];
    for (let i = 0; i < legPairs.length; i++) {
      const leg = legPairs[i];
      const animOff = (i % 2 === 0 ? legAnim : -legAnim);
      // Right legs
      this.#body.moveTo(leg.bx * S, leg.by * S);
      this.#body.quadraticCurveTo(leg.mx * S, (leg.my) * S + animOff, leg.ex * S, leg.ey * S + animOff);
      // Left legs
      this.#body.moveTo(-leg.bx * S, leg.by * S);
      this.#body.quadraticCurveTo(-leg.mx * S, (leg.my) * S - animOff, -leg.ex * S, leg.ey * S - animOff);
    }
    this.#body.stroke({ color: 0x1a0a00, width: 3 });

    // Leg joints (small circles at knees)
    for (let i = 0; i < legPairs.length; i++) {
      const leg = legPairs[i];
      const animOff = (i % 2 === 0 ? legAnim : -legAnim);
      this.#body.circle(leg.mx * S, leg.my * S + animOff, 1.5 * S);
      this.#body.circle(-leg.mx * S, leg.my * S - animOff, 1.5 * S);
    }
    this.#body.fill({ color: 0x2a1a0a });

    // Leg tips (tarsal claws)
    for (let i = 0; i < legPairs.length; i++) {
      const leg = legPairs[i];
      const animOff = (i % 2 === 0 ? legAnim : -legAnim);
      this.#body.circle(leg.ex * S, leg.ey * S + animOff, 1 * S);
      this.#body.circle(-leg.ex * S, leg.ey * S - animOff, 1 * S);
    }
    this.#body.fill({ color: 0x1a0a00 });

    // ===== ABDOMEN (back section) =====
    this.#body.ellipse(0, -5 * S, 12 * S, 9 * S);
    this.#body.fill({ color: 0x3a2a1a });
    this.#body.stroke({ color: 0x1a0a00, width: 2.5 });

    // Abdomen pattern (hourglass/markings)
    this.#body.ellipse(0, -5 * S, 8 * S, 6 * S);
    this.#body.fill({ color: 0x4a3a2a, alpha: 0.5 });
    // Stripe marks
    this.#body.moveTo(-6 * S, -7 * S);
    this.#body.quadraticCurveTo(0, -3 * S, 6 * S, -7 * S);
    this.#body.stroke({ color: 0x5a4a3a, width: 2 });
    this.#body.moveTo(-5 * S, -3 * S);
    this.#body.quadraticCurveTo(0, 0, 5 * S, -3 * S);
    this.#body.stroke({ color: 0x5a4a3a, width: 2 });

    // Hair tufts on abdomen
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const hx = Math.cos(angle) * 10 * S;
      const hy = -5 * S + Math.sin(angle) * 7 * S;
      this.#body.moveTo(hx, hy);
      this.#body.lineTo(hx + Math.cos(angle) * 2.5 * S, hy + Math.sin(angle) * 2 * S);
    }
    this.#body.stroke({ color: 0x2a1a0a, width: 1.5 });

    // Spinnerets (back)
    this.#body.ellipse(0, 3 * S, 3 * S, 2 * S);
    this.#body.fill({ color: 0x2a1a0a });

    // ===== CEPHALOTHORAX (front section) =====
    this.#body.ellipse(0, -16 * S, 7 * S, 6 * S);
    this.#body.fill({ color: 0x2a1a0a });
    this.#body.stroke({ color: 0x1a0a00, width: 2 });

    // Cephalothorax texture
    this.#body.ellipse(0, -16 * S, 5 * S, 4 * S);
    this.#body.fill({ color: 0x3a2a1a, alpha: 0.4 });

    // ===== EYES (8 eyes arranged in 2 rows) =====
    // Front row (4 larger eyes)
    this.#body.circle(-3 * S, -18 * S, 2 * S);
    this.#body.circle(3 * S, -18 * S, 2 * S);
    this.#body.fill({ color: 0x000000 });
    this.#body.circle(-3 * S, -18 * S, 1.5 * S);
    this.#body.circle(3 * S, -18 * S, 1.5 * S);
    this.#body.fill({ color: 0xcc2222 });
    // Eye shine
    this.#body.circle(-2.5 * S, -18.5 * S, 0.5 * S);
    this.#body.circle(3.5 * S, -18.5 * S, 0.5 * S);
    this.#body.fill({ color: 0xff6666 });

    // Smaller side eyes
    this.#body.circle(-5.5 * S, -17 * S, 1.3 * S);
    this.#body.circle(5.5 * S, -17 * S, 1.3 * S);
    this.#body.fill({ color: 0xaa1111 });
    // Top row (2 small eyes)
    this.#body.circle(-1.5 * S, -19.5 * S, 1 * S);
    this.#body.circle(1.5 * S, -19.5 * S, 1 * S);
    this.#body.fill({ color: 0xaa1111 });

    // ===== CHELICERAE (fangs) =====
    this.#body.moveTo(-2 * S, -13 * S);
    this.#body.quadraticCurveTo(-3 * S, -10 * S, -2.5 * S, -9 * S);
    this.#body.moveTo(2 * S, -13 * S);
    this.#body.quadraticCurveTo(3 * S, -10 * S, 2.5 * S, -9 * S);
    this.#body.stroke({ color: 0xccccaa, width: 2.5 });
    // Fang tips
    this.#body.circle(-2.5 * S, -9 * S, 0.8 * S);
    this.#body.circle(2.5 * S, -9 * S, 0.8 * S);
    this.#body.fill({ color: 0xddddbb });

    // Pedipalps
    this.#body.moveTo(-1 * S, -14 * S);
    this.#body.quadraticCurveTo(-2 * S, -12 * S, -1.5 * S, -10 * S);
    this.#body.moveTo(1 * S, -14 * S);
    this.#body.quadraticCurveTo(2 * S, -12 * S, 1.5 * S, -10 * S);
    this.#body.stroke({ color: 0x3a2a1a, width: 2 });
  }

  #drawSkeleton(frame: number): void {
    const legOffset = (frame === 1 ? 3 : frame === 2 ? -3 : 0) * S;
    const armSwing = (frame === 1 ? -2 : frame === 2 ? 2 : 0) * S;

    // ===== FEET (bone) =====
    this.#body.roundRect(-5 * S + legOffset, -2 * S, 4 * S, 3 * S, 1);
    this.#body.roundRect(1 * S - legOffset, -2 * S, 4 * S, 3 * S, 1);
    this.#body.fill({ color: 0xccccaa });
    this.#body.stroke({ color: 0x999977, width: 1.5 });
    // Toe bones
    this.#body.moveTo(-5 * S + legOffset, -1 * S);
    this.#body.lineTo(-6 * S + legOffset, 0);
    this.#body.moveTo(-3 * S + legOffset, -1 * S);
    this.#body.lineTo(-3 * S + legOffset, 0.5 * S);
    this.#body.moveTo(1 * S - legOffset, -1 * S);
    this.#body.lineTo(1 * S - legOffset, 0.5 * S);
    this.#body.moveTo(3 * S - legOffset, -1 * S);
    this.#body.lineTo(4 * S - legOffset, 0);
    this.#body.stroke({ color: 0xbbbb99, width: 1 });

    // ===== LEG BONES (tibia + femur) =====
    // Left tibia
    this.#body.poly([
      { x: -4 * S + legOffset, y: -7 * S },
      { x: -2 * S + legOffset, y: -7 * S },
      { x: -1 * S + legOffset, y: -2 * S },
      { x: -5 * S + legOffset, y: -2 * S },
    ]);
    this.#body.fill({ color: 0xddddbb });
    this.#body.stroke({ color: 0x999977, width: 1.5 });
    // Left femur
    this.#body.poly([
      { x: -4 * S + legOffset, y: -13 * S },
      { x: -2 * S + legOffset, y: -13 * S },
      { x: -1 * S + legOffset, y: -7 * S },
      { x: -5 * S + legOffset, y: -7 * S },
    ]);
    this.#body.fill({ color: 0xddddbb });
    this.#body.stroke({ color: 0x999977, width: 1.5 });
    // Kneecap
    this.#body.circle(-3 * S + legOffset, -7 * S, 1.5 * S);
    this.#body.fill({ color: 0xccccaa });
    this.#body.stroke({ color: 0x999977, width: 1 });

    // Right tibia
    this.#body.poly([
      { x: 2 * S - legOffset, y: -7 * S },
      { x: 4 * S - legOffset, y: -7 * S },
      { x: 5 * S - legOffset, y: -2 * S },
      { x: 1 * S - legOffset, y: -2 * S },
    ]);
    this.#body.fill({ color: 0xddddbb });
    this.#body.stroke({ color: 0x999977, width: 1.5 });
    // Right femur
    this.#body.poly([
      { x: 2 * S - legOffset, y: -13 * S },
      { x: 4 * S - legOffset, y: -13 * S },
      { x: 5 * S - legOffset, y: -7 * S },
      { x: 1 * S - legOffset, y: -7 * S },
    ]);
    this.#body.fill({ color: 0xddddbb });
    this.#body.stroke({ color: 0x999977, width: 1.5 });
    this.#body.circle(3 * S - legOffset, -7 * S, 1.5 * S);
    this.#body.fill({ color: 0xccccaa });
    this.#body.stroke({ color: 0x999977, width: 1 });

    // ===== PELVIS =====
    this.#body.roundRect(-5 * S, -15 * S, 10 * S, 4 * S, 1);
    this.#body.fill({ color: 0xccccaa });
    this.#body.stroke({ color: 0x999977, width: 1.5 });
    // Hip joints
    this.#body.circle(-3 * S, -13 * S, 1 * S);
    this.#body.circle(3 * S, -13 * S, 1 * S);
    this.#body.fill({ color: 0xbbbb99 });

    // ===== RIBCAGE =====
    this.#body.roundRect(-6 * S, -26 * S, 12 * S, 12 * S, 1);
    this.#body.fill({ color: 0xddddbb });
    this.#body.stroke({ color: 0x999977, width: 2 });

    // Spine (center line)
    this.#body.moveTo(0, -26 * S);
    this.#body.lineTo(0, -14 * S);
    this.#body.stroke({ color: 0xbbbb99, width: 2 });

    // Ribs (curved lines from spine outward)
    for (let i = 0; i < 4; i++) {
      const ry = -24 * S + i * 3 * S;
      // Left ribs
      this.#body.moveTo(0, ry);
      this.#body.quadraticCurveTo(-4 * S, ry - 1 * S, -5 * S, ry + 1 * S);
      // Right ribs
      this.#body.moveTo(0, ry);
      this.#body.quadraticCurveTo(4 * S, ry - 1 * S, 5 * S, ry + 1 * S);
    }
    this.#body.stroke({ color: 0xbbbb99, width: 1.5 });

    // Tattered cloth remnants
    this.#body.poly([
      { x: -6 * S, y: -20 * S },
      { x: -7 * S, y: -16 * S },
      { x: -5 * S, y: -12 * S },
      { x: -4 * S, y: -16 * S },
    ]);
    this.#body.fill({ color: 0x3a3a5a, alpha: 0.5 });
    this.#body.poly([
      { x: 4 * S, y: -22 * S },
      { x: 6 * S, y: -18 * S },
      { x: 7 * S, y: -14 * S },
      { x: 5 * S, y: -17 * S },
    ]);
    this.#body.fill({ color: 0x3a3a5a, alpha: 0.4 });

    // ===== ARMS (humerus + radius/ulna + hand bones) =====
    // Left arm
    this.#body.poly([
      { x: -8 * S, y: -25 * S + armSwing },
      { x: -6 * S, y: -25 * S + armSwing },
      { x: -6 * S, y: -18 * S + armSwing },
      { x: -8 * S, y: -18 * S + armSwing },
    ]);
    this.#body.fill({ color: 0xddddbb });
    this.#body.stroke({ color: 0x999977, width: 1.5 });
    // Elbow joint
    this.#body.circle(-7 * S, -18 * S + armSwing, 1.2 * S);
    this.#body.fill({ color: 0xccccaa });
    // Forearm
    this.#body.poly([
      { x: -8 * S, y: -18 * S + armSwing },
      { x: -6 * S, y: -18 * S + armSwing },
      { x: -6 * S, y: -12 * S + armSwing },
      { x: -8 * S, y: -12 * S + armSwing },
    ]);
    this.#body.fill({ color: 0xddddbb });
    this.#body.stroke({ color: 0x999977, width: 1.5 });
    // Hand (bony fingers)
    this.#body.moveTo(-8 * S, -12 * S + armSwing);
    this.#body.lineTo(-9 * S, -10 * S + armSwing);
    this.#body.moveTo(-7 * S, -12 * S + armSwing);
    this.#body.lineTo(-7.5 * S, -10 * S + armSwing);
    this.#body.moveTo(-6 * S, -12 * S + armSwing);
    this.#body.lineTo(-5.5 * S, -10 * S + armSwing);
    this.#body.stroke({ color: 0xccccaa, width: 1.5 });

    // Right arm
    this.#body.poly([
      { x: 6 * S, y: -25 * S - armSwing },
      { x: 8 * S, y: -25 * S - armSwing },
      { x: 8 * S, y: -18 * S - armSwing },
      { x: 6 * S, y: -18 * S - armSwing },
    ]);
    this.#body.fill({ color: 0xddddbb });
    this.#body.stroke({ color: 0x999977, width: 1.5 });
    this.#body.circle(7 * S, -18 * S - armSwing, 1.2 * S);
    this.#body.fill({ color: 0xccccaa });
    this.#body.poly([
      { x: 6 * S, y: -18 * S - armSwing },
      { x: 8 * S, y: -18 * S - armSwing },
      { x: 8 * S, y: -12 * S - armSwing },
      { x: 6 * S, y: -12 * S - armSwing },
    ]);
    this.#body.fill({ color: 0xddddbb });
    this.#body.stroke({ color: 0x999977, width: 1.5 });

    // ===== RUSTY SWORD (right hand) =====
    const swordBaseY = -14 * S - armSwing;
    // Blade (with pitting/rust)
    this.#body.poly([
      { x: 7.5 * S, y: swordBaseY - 14 * S },
      { x: 9 * S, y: swordBaseY - 14 * S },
      { x: 9.5 * S, y: swordBaseY },
      { x: 8.5 * S, y: swordBaseY + 2 * S },
      { x: 7 * S, y: swordBaseY },
    ]);
    this.#body.fill({ color: 0x777766 });
    this.#body.stroke({ color: 0x444433, width: 1.5 });
    // Rust spots
    this.#body.circle(8 * S, swordBaseY - 8 * S, 0.8 * S);
    this.#body.circle(8.5 * S, swordBaseY - 4 * S, 0.6 * S);
    this.#body.fill({ color: 0x884422, alpha: 0.5 });
    // Nicked edge
    this.#body.moveTo(7.2 * S, swordBaseY - 10 * S);
    this.#body.lineTo(7.5 * S, swordBaseY - 9 * S);
    this.#body.moveTo(7.3 * S, swordBaseY - 6 * S);
    this.#body.lineTo(7.6 * S, swordBaseY - 5 * S);
    this.#body.stroke({ color: 0x555544, width: 1 });
    // Cross-guard
    this.#body.rect(5.5 * S, swordBaseY, 5 * S, 2 * S);
    this.#body.fill({ color: 0x555544 });
    this.#body.stroke({ color: 0x333322, width: 1 });
    // Grip
    this.#body.rect(7.5 * S, swordBaseY + 2 * S, 2 * S, 3 * S);
    this.#body.fill({ color: 0x3a2a1a });

    // ===== SKULL =====
    // Skull shape
    this.#body.roundRect(-5 * S, -37 * S, 10 * S, 12 * S, 4 * S);
    this.#body.fill({ color: 0xddddbb });
    this.#body.stroke({ color: 0x999977, width: 2 });

    // Jaw (separate from cranium)
    this.#body.roundRect(-4 * S, -27 * S, 8 * S, 3 * S, 1);
    this.#body.fill({ color: 0xccccaa });
    this.#body.stroke({ color: 0x999977, width: 1.5 });
    // Teeth
    for (let i = 0; i < 5; i++) {
      const tx = (-3 + i * 1.5) * S;
      this.#body.rect(tx, -28 * S, 1 * S, 1.5 * S);
    }
    this.#body.fill({ color: 0xeeeecc });

    // Eye sockets (dark hollows)
    this.#body.ellipse(-2 * S, -32 * S, 2 * S, 2.5 * S);
    this.#body.ellipse(2 * S, -32 * S, 2 * S, 2.5 * S);
    this.#body.fill({ color: 0x1a0a00 });
    // Glowing eyes
    this.#body.circle(-2 * S, -32 * S, 1.2 * S);
    this.#body.circle(2 * S, -32 * S, 1.2 * S);
    this.#body.fill({ color: 0xff3333 });
    // Eye glow highlights
    this.#body.circle(-1.6 * S, -32.4 * S, 0.4 * S);
    this.#body.circle(2.4 * S, -32.4 * S, 0.4 * S);
    this.#body.fill({ color: 0xff8888 });

    // Nasal cavity
    this.#body.poly([
      { x: 0, y: -30 * S },
      { x: -1 * S, y: -28.5 * S },
      { x: 1 * S, y: -28.5 * S },
    ]);
    this.#body.fill({ color: 0x1a0a00 });

    // Cranium suture lines
    this.#body.moveTo(-3 * S, -37 * S);
    this.#body.quadraticCurveTo(0, -35 * S, 3 * S, -37 * S);
    this.#body.moveTo(0, -37 * S);
    this.#body.lineTo(0, -34 * S);
    this.#body.stroke({ color: 0xbbbb99, width: 1 });

    // Crack in skull
    this.#body.moveTo(3 * S, -35 * S);
    this.#body.lineTo(4 * S, -33 * S);
    this.#body.lineTo(3.5 * S, -31 * S);
    this.#body.stroke({ color: 0x888866, width: 1 });
  }

  #drawOrc(frame: number): void {
    const legOffset = (frame === 1 ? 3 : frame === 2 ? -3 : 0) * S;
    const armSwing = (frame === 1 ? -2 : frame === 2 ? 2 : 0) * S;

    // ===== BOOTS (heavy leather) =====
    this.#body.roundRect(-7 * S + legOffset, -3 * S, 6 * S, 6 * S, 2);
    this.#body.roundRect(1 * S - legOffset, -3 * S, 6 * S, 6 * S, 2);
    this.#body.fill({ color: 0x3a2818 });
    this.#body.stroke({ color: 0x1a0a00, width: 2 });
    // Boot fur trim
    this.#body.rect(-7 * S + legOffset, -3 * S, 6 * S, 2 * S);
    this.#body.rect(1 * S - legOffset, -3 * S, 6 * S, 2 * S);
    this.#body.fill({ color: 0x6a5a4a });
    // Fur texture lines
    this.#body.moveTo(-6 * S + legOffset, -3 * S);
    this.#body.lineTo(-5.5 * S + legOffset, -1.5 * S);
    this.#body.moveTo(-4 * S + legOffset, -3 * S);
    this.#body.lineTo(-3.5 * S + legOffset, -1.5 * S);
    this.#body.moveTo(2 * S - legOffset, -3 * S);
    this.#body.lineTo(2.5 * S - legOffset, -1.5 * S);
    this.#body.moveTo(4 * S - legOffset, -3 * S);
    this.#body.lineTo(4.5 * S - legOffset, -1.5 * S);
    this.#body.stroke({ color: 0x8a7a6a, width: 1 });

    // ===== LEGS (muscular green) =====
    this.#body.rect(-6 * S + legOffset, -16 * S, 5 * S, 14 * S);
    this.#body.rect(1 * S - legOffset, -16 * S, 5 * S, 14 * S);
    this.#body.fill({ color: 0x3a5a2a });
    this.#body.stroke({ color: 0x2a3a1a, width: 2 });
    // Muscle definition
    this.#body.ellipse(-3.5 * S + legOffset, -10 * S, 2 * S, 4 * S);
    this.#body.ellipse(3.5 * S - legOffset, -10 * S, 2 * S, 4 * S);
    this.#body.fill({ color: 0x4a6a3a, alpha: 0.4 });
    // Leather straps on legs
    this.#body.rect(-6 * S + legOffset, -8 * S, 5 * S, 1.5 * S);
    this.#body.rect(1 * S - legOffset, -8 * S, 5 * S, 1.5 * S);
    this.#body.fill({ color: 0x5a3a1a });

    // ===== BELT (wide war belt) =====
    this.#body.rect(-8 * S, -18 * S, 16 * S, 4 * S);
    this.#body.fill({ color: 0x5a3a1a });
    this.#body.stroke({ color: 0x3a2010, width: 1.5 });
    // Belt buckle (skull motif)
    this.#body.roundRect(-2 * S, -17.5 * S, 4 * S, 3 * S, 1);
    this.#body.fill({ color: 0x888888 });
    this.#body.stroke({ color: 0x555555, width: 1 });
    // Skull detail on buckle
    this.#body.circle(0, -16.5 * S, 0.8 * S);
    this.#body.fill({ color: 0x666666 });

    // ===== TORSO (leather/hide armor) =====
    this.#body.roundRect(-9 * S, -32 * S, 18 * S, 16 * S, 2);
    this.#body.fill({ color: 0x4a6a2a });
    this.#body.stroke({ color: 0x2a3a1a, width: 2.5 });

    // Chest armor plate (hide vest)
    this.#body.roundRect(-7 * S, -31 * S, 14 * S, 12 * S, 2);
    this.#body.fill({ color: 0x5a3a1a });
    this.#body.stroke({ color: 0x3a2010, width: 2 });

    // Armor cross straps
    this.#body.moveTo(-7 * S, -31 * S);
    this.#body.lineTo(7 * S, -20 * S);
    this.#body.moveTo(7 * S, -31 * S);
    this.#body.lineTo(-7 * S, -20 * S);
    this.#body.stroke({ color: 0x6a4a2a, width: 2.5 });

    // Strap rivets
    this.#body.circle(-2 * S, -27 * S, 0.8 * S);
    this.#body.circle(2 * S, -24 * S, 0.8 * S);
    this.#body.circle(0, -25.5 * S, 0.8 * S);
    this.#body.fill({ color: 0x888888 });

    // Battle scars on chest
    this.#body.moveTo(-5 * S, -29 * S);
    this.#body.lineTo(-3 * S, -26 * S);
    this.#body.moveTo(3 * S, -30 * S);
    this.#body.lineTo(5 * S, -27 * S);
    this.#body.stroke({ color: 0x3a2a1a, width: 1.5 });

    // ===== ARMS (thick, muscular) =====
    // Left arm
    this.#body.rect(-13 * S, -31 * S + armSwing, 5 * S, 10 * S);
    this.#body.fill({ color: 0x4a6a2a });
    this.#body.stroke({ color: 0x2a3a1a, width: 2 });
    // Left shoulder guard (spiked)
    this.#body.roundRect(-13 * S, -32 * S + armSwing, 5 * S, 4 * S, 1);
    this.#body.fill({ color: 0x5a3a1a });
    this.#body.stroke({ color: 0x3a2010, width: 1.5 });
    // Shoulder spike
    this.#body.poly([
      { x: -11 * S, y: -32 * S + armSwing },
      { x: -10 * S, y: -35 * S + armSwing },
      { x: -9 * S, y: -32 * S + armSwing },
    ]);
    this.#body.fill({ color: 0x666666 });
    this.#body.stroke({ color: 0x444444, width: 1 });
    // Muscle bulge
    this.#body.ellipse(-10.5 * S, -26 * S + armSwing, 2.5 * S, 4 * S);
    this.#body.fill({ color: 0x5a7a3a, alpha: 0.4 });
    // Left forearm wrap
    this.#body.rect(-13 * S, -22 * S + armSwing, 5 * S, 3 * S);
    this.#body.fill({ color: 0x5a3a1a });
    // Left fist (big green)
    this.#body.roundRect(-13 * S, -19 * S + armSwing, 5 * S, 5 * S, 2);
    this.#body.fill({ color: 0x3a5a2a });
    this.#body.stroke({ color: 0x2a3a1a, width: 1.5 });
    // Knuckle detail
    this.#body.circle(-12 * S, -17.5 * S + armSwing, 0.6 * S);
    this.#body.circle(-10.5 * S, -17.5 * S + armSwing, 0.6 * S);
    this.#body.circle(-9 * S, -17.5 * S + armSwing, 0.6 * S);
    this.#body.fill({ color: 0x4a6a3a });

    // Right arm
    this.#body.rect(8 * S, -31 * S - armSwing, 5 * S, 10 * S);
    this.#body.fill({ color: 0x4a6a2a });
    this.#body.stroke({ color: 0x2a3a1a, width: 2 });
    this.#body.roundRect(8 * S, -32 * S - armSwing, 5 * S, 4 * S, 1);
    this.#body.fill({ color: 0x5a3a1a });
    this.#body.stroke({ color: 0x3a2010, width: 1.5 });
    this.#body.poly([
      { x: 9 * S, y: -32 * S - armSwing },
      { x: 10 * S, y: -35 * S - armSwing },
      { x: 11 * S, y: -32 * S - armSwing },
    ]);
    this.#body.fill({ color: 0x666666 });
    this.#body.stroke({ color: 0x444444, width: 1 });
    this.#body.ellipse(10.5 * S, -26 * S - armSwing, 2.5 * S, 4 * S);
    this.#body.fill({ color: 0x5a7a3a, alpha: 0.4 });
    this.#body.rect(8 * S, -22 * S - armSwing, 5 * S, 3 * S);
    this.#body.fill({ color: 0x5a3a1a });
    // Right fist
    this.#body.roundRect(8 * S, -19 * S - armSwing, 5 * S, 5 * S, 2);
    this.#body.fill({ color: 0x3a5a2a });
    this.#body.stroke({ color: 0x2a3a1a, width: 1.5 });

    // ===== BATTLE AXE (right hand) =====
    const axeBaseY = -20 * S - armSwing;
    // Shaft
    this.#body.rect(10 * S, axeBaseY - 16 * S, 2 * S, 22 * S);
    this.#body.fill({ color: 0x5a3a1a });
    this.#body.stroke({ color: 0x3a2010, width: 1 });
    // Shaft wrap
    this.#body.rect(10 * S, axeBaseY - 2 * S, 2 * S, 4 * S);
    this.#body.fill({ color: 0x4a2a1a });
    // Axe head (double-sided)
    this.#body.poly([
      { x: 11 * S, y: axeBaseY - 16 * S },
      { x: 18 * S, y: axeBaseY - 14 * S },
      { x: 18 * S, y: axeBaseY - 10 * S },
      { x: 11 * S, y: axeBaseY - 8 * S },
    ]);
    this.#body.fill({ color: 0x777777 });
    this.#body.stroke({ color: 0x444444, width: 2 });
    // Edge highlight
    this.#body.moveTo(17 * S, axeBaseY - 14 * S);
    this.#body.lineTo(18.5 * S, axeBaseY - 12 * S);
    this.#body.lineTo(17 * S, axeBaseY - 10 * S);
    this.#body.stroke({ color: 0xaaaaaa, width: 1.5 });
    // Back edge
    this.#body.poly([
      { x: 11 * S, y: axeBaseY - 15 * S },
      { x: 6 * S, y: axeBaseY - 13 * S },
      { x: 6 * S, y: axeBaseY - 11 * S },
      { x: 11 * S, y: axeBaseY - 9 * S },
    ]);
    this.#body.fill({ color: 0x666666 });
    this.#body.stroke({ color: 0x444444, width: 1.5 });

    // ===== HEAD (brutal orc face) =====
    // Neck (thick)
    this.#body.rect(-3 * S, -35 * S, 6 * S, 4 * S);
    this.#body.fill({ color: 0x3a5a2a });

    // Head shape
    this.#body.roundRect(-7 * S, -44 * S, 14 * S, 12 * S, 3 * S);
    this.#body.fill({ color: 0x4a6a2a });
    this.#body.stroke({ color: 0x2a3a1a, width: 2.5 });

    // Heavy brow ridge
    this.#body.rect(-6 * S, -43 * S, 12 * S, 3 * S);
    this.#body.fill({ color: 0x3a5a1a });
    this.#body.stroke({ color: 0x2a3a1a, width: 1 });

    // Eyes (small, angry)
    this.#body.ellipse(-3 * S, -40 * S, 2 * S, 1.5 * S);
    this.#body.ellipse(3 * S, -40 * S, 2 * S, 1.5 * S);
    this.#body.fill({ color: 0xccaa22 });
    this.#body.circle(-3 * S, -40 * S, 1 * S);
    this.#body.circle(3 * S, -40 * S, 1 * S);
    this.#body.fill({ color: 0x220000 });
    // Eye shine
    this.#body.circle(-2.5 * S, -40.3 * S, 0.3 * S);
    this.#body.circle(3.5 * S, -40.3 * S, 0.3 * S);
    this.#body.fill({ color: 0xeecc44 });

    // Snout/nose
    this.#body.roundRect(-2 * S, -39 * S, 4 * S, 3 * S, 1);
    this.#body.fill({ color: 0x3a5a2a });
    this.#body.stroke({ color: 0x2a3a1a, width: 1 });
    // Nostrils
    this.#body.circle(-1 * S, -37.5 * S, 0.6 * S);
    this.#body.circle(1 * S, -37.5 * S, 0.6 * S);
    this.#body.fill({ color: 0x1a2a0a });

    // Mouth/jaw
    this.#body.roundRect(-5 * S, -36 * S, 10 * S, 3 * S, 1);
    this.#body.fill({ color: 0x2a3a1a });
    // Tusks (protruding from lower jaw)
    this.#body.poly([
      { x: -4 * S, y: -36 * S },
      { x: -3.5 * S, y: -39 * S },
      { x: -3 * S, y: -36 * S },
    ]);
    this.#body.poly([
      { x: 3 * S, y: -36 * S },
      { x: 3.5 * S, y: -39 * S },
      { x: 4 * S, y: -36 * S },
    ]);
    this.#body.fill({ color: 0xddddaa });
    this.#body.stroke({ color: 0xaaaa88, width: 1 });

    // Pointed ears
    this.#body.poly([
      { x: -7 * S, y: -40 * S },
      { x: -10 * S, y: -43 * S },
      { x: -7 * S, y: -37 * S },
    ]);
    this.#body.poly([
      { x: 7 * S, y: -40 * S },
      { x: 10 * S, y: -43 * S },
      { x: 7 * S, y: -37 * S },
    ]);
    this.#body.fill({ color: 0x4a6a2a });
    this.#body.stroke({ color: 0x2a3a1a, width: 1.5 });

    // War paint (red stripes)
    this.#body.moveTo(-5 * S, -42 * S);
    this.#body.lineTo(-5 * S, -38 * S);
    this.#body.moveTo(5 * S, -42 * S);
    this.#body.lineTo(5 * S, -38 * S);
    this.#body.stroke({ color: 0xaa2222, width: 2 });

    // Topknot/mohawk hair
    this.#body.poly([
      { x: -2 * S, y: -44 * S },
      { x: 0, y: -50 * S },
      { x: 2 * S, y: -44 * S },
    ]);
    this.#body.fill({ color: 0x1a1a0a });
    this.#body.stroke({ color: 0x0a0a00, width: 1 });
    // Hair texture
    this.#body.moveTo(-1 * S, -44 * S);
    this.#body.lineTo(0, -48 * S);
    this.#body.moveTo(1 * S, -44 * S);
    this.#body.lineTo(0.5 * S, -47 * S);
    this.#body.stroke({ color: 0x2a2a1a, width: 1 });
  }

  #drawHealthBar(): void {
    this.#healthBar.clear();
    const w = 28;
    const h = 3;
    const y = this.enemyType === 'ORC' ? -52 : this.enemyType === 'SKELETON' ? -42 : -24;
    this.#healthBar.rect(-w / 2 - 1, y - 1, w + 2, h + 2);
    this.#healthBar.fill({ color: 0x000000 });
    const pct = this.health / this.maxHealth;
    if (pct > 0) {
      this.#healthBar.rect(-w / 2, y, w * pct, h);
      this.#healthBar.fill({ color: pct > 0.5 ? 0xcc2222 : pct > 0.25 ? 0xcc6622 : 0xcc2222 });
    }
  }

  triggerHitFlash(fromWorldX: number, fromWorldY: number): void {
    this.#hitFlashTimer = HIT_FLASH_MS;
    const dx = this.worldX - fromWorldX;
    const dy = this.worldY - fromWorldY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    this.#recoilDirX = dx / len;
    this.#recoilDirY = dy / len;
    this.#recoilTimer = HIT_FLASH_MS;
  }

  applyState(state: EnemyState): void {
    this.health = state.health;
    this.maxHealth = state.maxHealth;
    this.direction = state.direction;
    this.isMoving = state.isMoving;
    this.#drawHealthBar();

    this.#fromX = state.fromX;
    this.#fromY = state.fromY;
    this.#toX = state.x;
    this.#toY = state.y;
    this.#moveProgress = state.moveProgress;
    this.#updateVisualPosition();
  }

  #updateVisualPosition(): void {
    const t = this.#moveProgress;
    const p = t * t * (3 - 2 * t);
    this.worldX = this.#fromX + (this.#toX - this.#fromX) * p;
    this.worldY = this.#fromY + (this.#toY - this.#fromY) * p;

    const screen = worldToScreen(this.worldX, this.worldY);
    this.container.x = screen.screenX;
    this.container.y = screen.screenY;
  }

  update(_dt: number): void {
    // Walk animation
    if (this.isMoving && this.#moveProgress < 1) {
      const stepCycle = Math.sin(this.#moveProgress * Math.PI * 4);
      this.#bodyContainer.y = -Math.abs(stepCycle) * 2;
      const frame = stepCycle > 0.2 ? 1 : stepCycle < -0.2 ? 2 : 0;
      this.#drawBody(frame);
    } else {
      this.#bodyContainer.y = 0;
      this.#drawBody(0);
    }

    // Recoil animation
    if (this.#recoilTimer > 0) {
      this.#recoilTimer -= _dt;
      const recoilPct = Math.max(0, this.#recoilTimer / HIT_FLASH_MS);
      const recoilAmount = recoilPct * 3;
      this.#bodyContainer.x = this.#recoilDirX * recoilAmount;
      this.#bodyContainer.y += -this.#recoilDirY * recoilAmount;
    } else {
      this.#bodyContainer.x = 0;
    }

    // Hit flash
    if (this.#hitFlashTimer > 0) {
      this.#hitFlashTimer -= _dt;
      const flashIntensity = this.#hitFlashTimer / HIT_FLASH_MS;
      this.#body.tint = flashIntensity > 0.5 ? 0xff4444 : 0xffffff;
      if (this.#hitFlashTimer <= 0) this.#body.tint = 0xffffff;
    }

    this.#updateVisualPosition();
  }
}
