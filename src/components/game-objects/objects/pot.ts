import * as Phaser from 'phaser';
import { Position } from '../../../common/types';
import { ASSET_KEYS } from '../../../common/assets';
import { InteractiveObjectComponent } from '../../game-object/interactive-object-component';
import { INTERACT_OBJECT_TYPE } from '../../../common/common';

type PotConfig = {
  scene: Phaser.Scene;
  position: Position;
};

export class Pot extends Phaser.Physics.Arcade.Sprite {
  #position: Position;

  constructor(config: PotConfig) {
    const { scene, position } = config;
    super(scene, position.x, position.y, ASSET_KEYS.POT, 0);

    // Initialize the sprite
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0, 1).setImmovable(true);

    // Set the position
    this.#position = { x: position.x, y: position.y };

    new InteractiveObjectComponent(this, INTERACT_OBJECT_TYPE.PICKUP);
  }
}
