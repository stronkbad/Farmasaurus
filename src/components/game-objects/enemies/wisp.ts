import * as Phaser from 'phaser';
import { AnimationConfig } from '../../game-object/animation-component';
import { Position } from '../../../common/types';
import { InputComponent } from '../../input/input-component';
import { ASSET_KEYS, SPIDER_ANIMATION_KEYS, WISP_ANIMATION_KEYS } from '../../../common/assets';
import {
  ENEMY_SPIDER_CHANGE_DIRECTION_DELAY_MAX,
  ENEMY_SPIDER_CHANGE_DIRECTION_DELAY_MIN,
  ENEMY_SPIDER_CHANGE_DIRECTION_DELAY_WAIT,
  ENEMY_SPIDER_SPEED,
  ENEMY_WISP_PULSE_ANIMATION_DURATION,
  ENEMY_WISP_PULSE_ANIMATION_SCALE_X,
  ENEMY_WISP_PULSE_ANIMATION_SCALE_Y,
  ENEMY_WISP_SPEED,
  ENEMY_WISP_START_MAX_HEALTH,
} from '../../../common/config';
import { Idlestate } from '../../state-machine/states/character/idle-state';
import { Movestate } from '../../state-machine/states/character/move-state';
import { CHARACTER_STATES } from '../../state-machine/states/character/character-states';
import { CharacterGameObject } from '../common/character-game-object';
import { DIRECTION } from '../../../common/common';
import { exhaustiveGuard } from '../../../common/utils';
import { BounceMoveState } from '../../state-machine/states/character/bounce-move-state';

export type WispConfig = {
  scene: Phaser.Scene;
  position: Position;
};

export class Wisp extends CharacterGameObject {
  constructor(config: WispConfig) {
    // create animation config for component
    const animConfig = { key: WISP_ANIMATION_KEYS.IDLE, repeat: -1, ignoreIfPlaying: true };

    const animationConfig: AnimationConfig = {
      IDLE_UP: animConfig,
      IDLE_DOWN: animConfig,
      IDLE_LEFT: animConfig,
      IDLE_RIGHT: animConfig,
    };

    super({
      scene: config.scene,
      position: config.position,
      assetKey: ASSET_KEYS.WISP,
      frame: 0,
      id: `wisp-${Phaser.Math.RND.uuid()}`,
      isPlayer: false,
      AnimationConfig: animationConfig,
      speed: ENEMY_WISP_SPEED,
      InputComponent: new InputComponent(),
      isInvulnerable: true,
      maxLife: ENEMY_WISP_START_MAX_HEALTH,
    });

    //add state machine
    this._stateMachine.addState(new BounceMoveState(this));
    this._stateMachine.setState(CHARACTER_STATES.BOUNCE_MOVE_STATE);

    this.scene.tweens.add({
      targets: this,
      scaleX: ENEMY_WISP_PULSE_ANIMATION_SCALE_X,
      scaleY: ENEMY_WISP_PULSE_ANIMATION_SCALE_Y,
      yoyo: true,
      repeat: -1,
      duration: ENEMY_WISP_PULSE_ANIMATION_DURATION,
    });
  }
}
