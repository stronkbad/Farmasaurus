import * as Phaser from 'phaser';
import {  AnimationConfig } from '../../game-object/animation-component';
import {  GameObject, Position } from '../../../common/types';
import { InputComponent } from '../../input/input-component';
import { ASSET_KEYS, PLAYER_ANIMATION_KEYS } from '../../../common/assets';
import { PLAYER_HURT_PUSH_BACK_SPEED, PLAYER_INVULNERABLE_AFTER_HIT_ANIMATION_DURATION, PLAYER_SPEED } from '../../../common/config';
import { Idlestate } from '../../state-machine/states/character/idle-state';
import { Movestate } from '../../state-machine/states/character/move-state';
import { CHARACTER_STATES } from '../../state-machine/states/character/character-states';
import { CharacterGameObject } from '../common/character-game-object';
import { Hurtstate } from '../../state-machine/states/character/hurt-state';
import { flash } from '../../../common/juice-utils';
import { Deathstate } from '../../state-machine/states/character/death-state';
import { CollidingObjectsComponent } from '../../game-object/colliding-objects-component';

export type PlayerConfig = {
  scene: Phaser.Scene;
  position: Position;
  controls: InputComponent;
  maxLife: number;
  currentLife: number;
};

export class Player extends CharacterGameObject {
  #collidingObjectsComponent: CollidingObjectsComponent;

  constructor(config: PlayerConfig) {
    // create animation config for component
    const animationConfig: AnimationConfig = {
      WALK_UP: { key: PLAYER_ANIMATION_KEYS.WALK_UP, repeat: -1, ignoreIfPlaying: true },
      WALK_DOWN: { key: PLAYER_ANIMATION_KEYS.WALK_DOWN, repeat: -1, ignoreIfPlaying: true },
      WALK_LEFT: { key: PLAYER_ANIMATION_KEYS.WALK_SIDE, repeat: -1, ignoreIfPlaying: true },
      WALK_RIGHT: { key: PLAYER_ANIMATION_KEYS.WALK_SIDE, repeat: -1, ignoreIfPlaying: true },
      IDLE_UP: { key: PLAYER_ANIMATION_KEYS.IDLE_UP, repeat: -1, ignoreIfPlaying: true },
      IDLE_DOWN: { key: PLAYER_ANIMATION_KEYS.IDLE_DOWN, repeat: -1, ignoreIfPlaying: true },
      IDLE_LEFT: { key: PLAYER_ANIMATION_KEYS.IDLE_SIDE, repeat: -1, ignoreIfPlaying: true },
      IDLE_RIGHT: { key: PLAYER_ANIMATION_KEYS.IDLE_SIDE, repeat: -1, ignoreIfPlaying: true },
      HURT_UP: { key: PLAYER_ANIMATION_KEYS.HURT_UP, repeat: 0, ignoreIfPlaying: true },
      HURT_DOWN: { key: PLAYER_ANIMATION_KEYS.HURT_DOWN, repeat: 0, ignoreIfPlaying: true },
      HURT_LEFT: { key: PLAYER_ANIMATION_KEYS.HURT_SIDE, repeat: 0, ignoreIfPlaying: true },
      HURT_RIGHT: { key: PLAYER_ANIMATION_KEYS.HURT_SIDE, repeat: 0, ignoreIfPlaying: true },
      DIE_UP: { key: PLAYER_ANIMATION_KEYS.DIE_UP, repeat: 0, ignoreIfPlaying: true },
      DIE_DOWN: { key: PLAYER_ANIMATION_KEYS.DIE_DOWN, repeat: 0, ignoreIfPlaying: true },
      DIE_LEFT: { key: PLAYER_ANIMATION_KEYS.DIE_SIDE, repeat: 0, ignoreIfPlaying: true },
      DIE_RIGHT: { key: PLAYER_ANIMATION_KEYS.DIE_SIDE, repeat: 0, ignoreIfPlaying: true },
    };

    super({
      scene: config.scene,
      position: config.position,
      assetKey: ASSET_KEYS.PLAYER,
      frame: 0,
      id: 'player',
      isPlayer: true,
      AnimationConfig: animationConfig,
      speed: PLAYER_SPEED,
      InputComponent: config.controls,
      isInvulnerable: false,
      invulnerableAfterHitAnimationDuration: PLAYER_INVULNERABLE_AFTER_HIT_ANIMATION_DURATION,
      maxLife: config.maxLife,
      currentLife: config.currentLife,
    });

    this.#collidingObjectsComponent = new CollidingObjectsComponent(this);

    //add state machine
    this._stateMachine.addState(new Idlestate(this));
    this._stateMachine.addState(new Movestate(this));
    this._stateMachine.addState(new Hurtstate(this, PLAYER_HURT_PUSH_BACK_SPEED, () => {
      flash(this);
    }));
    this._stateMachine.addState( new Deathstate(this));
    this._stateMachine.setState(CHARACTER_STATES.IDLE_STATE);

    config.scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    config.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    config.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    });

    this.physicsBody.setSize(12, 16, true).setOffset(this.width / 2 - 5, this.height / 2);
  }

  get physicsBody(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }

  public collideWithGameObject(gameObject: GameObject): void {
    this.#collidingObjectsComponent.addObject(gameObject);
  }

  public update(): void{
    super.update();
    console.log(this.#collidingObjectsComponent.objects);
    this.#collidingObjectsComponent.reset();
  }

}
