import * as Phaser from 'phaser';
import { AnimationConfig } from '../../game-object/animation-component';
import { Direction, Position } from '../../../common/types';
import { InputComponent } from '../../input/input-component';
import { ASSET_KEYS, SPIDER_ANIMATION_KEYS } from '../../../common/assets';
import {
  ENEMY_SPIDER_CHANGE_DIRECTION_DELAY_MAX,
  ENEMY_SPIDER_CHANGE_DIRECTION_DELAY_MIN,
  ENEMY_SPIDER_CHANGE_DIRECTION_DELAY_WAIT,
  ENEMY_SPIDER_PUSH_BACK_SPEED,
  ENEMY_SPIDER_SPEED,
  ENEMY_SPIDER_START_MAX_HEALTH,
} from '../../../common/config';
import { Idlestate } from '../../state-machine/states/character/idle-state';
import { Movestate } from '../../state-machine/states/character/move-state';
import { CHARACTER_STATES } from '../../state-machine/states/character/character-states';
import { CharacterGameObject } from '../common/character-game-object';
import { DIRECTION } from '../../../common/common';
import { exhaustiveGuard } from '../../../common/utils';
import { Hurtstate } from '../../state-machine/states/character/hurt-state';
import { Deathstate } from '../../state-machine/states/character/death-state';

export type SpiderConfig = {
  scene: Phaser.Scene;
  position: Position;
};

export class Spider extends CharacterGameObject {
  constructor(config: SpiderConfig) {
    // create animation config for component
    const animConfig = { key: SPIDER_ANIMATION_KEYS.WALK, repeat: -1, ignoreIfPlaying: true };
    const hurtAnimConfig = { key: SPIDER_ANIMATION_KEYS.HIT, repeat: 0, ignoreIfPlaying: true };
    const deathAnimConfig = { key: SPIDER_ANIMATION_KEYS.DEATH, repeat: 0, ignoreIfPlaying: true };

    const animationConfig: AnimationConfig = {
      WALK_UP: animConfig,
      WALK_DOWN: animConfig,
      WALK_LEFT: animConfig,
      WALK_RIGHT: animConfig,
      IDLE_UP: animConfig,
      IDLE_DOWN: animConfig,
      IDLE_LEFT: animConfig,
      IDLE_RIGHT: animConfig,
      HURT_UP: hurtAnimConfig,
      HURT_DOWN: hurtAnimConfig,
      HURT_LEFT: hurtAnimConfig,
      HURT_RIGHT: hurtAnimConfig,
      DIE_UP: deathAnimConfig,
      DIE_DOWN: deathAnimConfig,
      DIE_LEFT: deathAnimConfig,
      DIE_RIGHT: deathAnimConfig,
    };

    super({
      scene: config.scene,
      position: config.position,
      assetKey: ASSET_KEYS.SPIDER,
      frame: 0,
      id: `spider-${Phaser.Math.RND.uuid()}`,
      isPlayer: false,
      AnimationConfig: animationConfig,
      speed: ENEMY_SPIDER_SPEED,
      InputComponent: new InputComponent(),
      isInvulnerable: false,
      maxLife: ENEMY_SPIDER_START_MAX_HEALTH,
    });

    this._directionComponent.callback = (direction: Direction) => {
      this.#handleDirectionChange(direction);
    };

    //add state machine
    this._stateMachine.addState(new Idlestate(this));
    this._stateMachine.addState(new Movestate(this));
    this._stateMachine.addState(new Hurtstate(this, ENEMY_SPIDER_PUSH_BACK_SPEED));
    this._stateMachine.addState(new Deathstate(this));
    this._stateMachine.setState(CHARACTER_STATES.IDLE_STATE);

    this.scene.time.addEvent({
      delay: Phaser.Math.Between(ENEMY_SPIDER_CHANGE_DIRECTION_DELAY_MIN, ENEMY_SPIDER_CHANGE_DIRECTION_DELAY_MAX), // Random delay between 0.5 and 1.5 seconds
      callback: this.#changeDirection,
      callbackScope: this,
      loop: false,
    });
  }

  #handleDirectionChange(direction: Direction): void {
    switch (direction) {
      case DIRECTION.DOWN:
        this.setAngle(0);
        break;
      case DIRECTION.UP:
        this.setAngle(180);
        break;
      case DIRECTION.LEFT:
        this.setAngle(90);
        break;
      case DIRECTION.RIGHT:
        this.setAngle(270);
        break;
      default:
        exhaustiveGuard(direction);
    }
  }

  #changeDirection(): void {
    this.controls.reset();
    this.scene.time.delayedCall(ENEMY_SPIDER_CHANGE_DIRECTION_DELAY_WAIT, () => {
      const randomDirection = Phaser.Math.Between(0, 3);
      if (randomDirection === 0) {
        this.controls.isUpDown = true;
      } else if (randomDirection === 1) {
        this.controls.isRightDown = true;
      } else if (randomDirection === 2) {
        this.controls.isDownDown = true;
      } else {
        this.controls.isLeftDown = true;
      }

      this.scene.time.addEvent({
        delay: Phaser.Math.Between(500, 1500), // Random delay between 0.5 and 1.5 seconds
        callback: this.#changeDirection,
        callbackScope: this,
        loop: false,
      });
    });
  }
}
