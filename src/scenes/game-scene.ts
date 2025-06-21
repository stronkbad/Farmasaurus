import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { ASSET_KEYS } from '../common/assets';
import { KeyboardComponent } from '../components/input/keyboard-component';
import { Player } from '../components/game-objects/player/player';
import { Spider } from '../components/game-objects/enemies/spider';
import { Wisp } from '../components/game-objects/enemies/wisp';
import { CharacterGameObject } from '../components/game-objects/common/character-game-object';
import { DIRECTION } from '../common/common';
import { PLAYER_START_MAX_HEALTH } from '../common/config';

export class GameScene extends Phaser.Scene {
  #controls!: KeyboardComponent;
  #player!: Player;
  #enemyGroup!: Phaser.GameObjects.Group;

  constructor() {
    super({
      key: SCENE_KEYS.GAME_SCENE,
    });
  }

  public create(): void {
    if (!this.input.keyboard) {
      console.warn('Keyboard input is not available');
      return;
    }

    this.#controls = new KeyboardComponent(this.input.keyboard);
    this.add.text(this.scale.width / 2, this.scale.height / 2, 'Game Scene 2', { fontFamily: ASSET_KEYS.FONT_PRESS_START_2P }).setOrigin(0.5);

    this.#player = new Player({
      scene: this,
      position: { x: this.scale.width / 2, y: this.scale.height / 2 },
      controls: this.#controls,
      maxLife: PLAYER_START_MAX_HEALTH,
      currentLife: PLAYER_START_MAX_HEALTH,
    });
    // this.#player.setCollideWorldBounds(true);
    
    this.#enemyGroup = this.add.group(
      [
      new Spider({
        scene: this,
        position: { x: this.scale.width / 2, y: this.scale.height / 2 + 50},
      }),
      new Wisp({
        scene: this,
        position: { x: this.scale.width / 2, y: this.scale.height / 2 - 50},
      }),
    ], 
    {
      runChildUpdate: true,
    });

    this.#registerColliders();
  }

  #registerColliders(): void {
    this.#enemyGroup.getChildren().forEach((enemy) => {
      const enemyGameObject = enemy as CharacterGameObject;
      enemyGameObject.setCollideWorldBounds(true);
    })
    this.physics.add.overlap(this.#player, this.#enemyGroup, (player, enemy) => {
      this.#player.hit(DIRECTION.DOWN, 1)
      const enemyGameObject = enemy as CharacterGameObject;
      enemyGameObject.hit(this.#player.direction, 1);
    });
  }

}
