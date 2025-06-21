import { CHARACTER_ANIMATIONS } from '../../../../common/assets';
import { DIRECTION } from '../../../../common/common';
import { HURT_PUSH_BACK_DELAY } from '../../../../common/config';
import { Direction } from '../../../../common/types';
import { isArcadePhysicsBody, exhaustiveGuard } from '../../../../common/utils';
import { CharacterGameObject } from '../../../game-objects/common/character-game-object';
import { BaseCharacterState } from './base-character-state';
import { CHARACTER_STATES } from './character-states';

export class Hurtstate extends BaseCharacterState {
  #hurtPushBackSpeed: number;
  #onHurtCallBack: () => void;
  #nextState: string;

  constructor(
    gameObject: CharacterGameObject,
    hurtPushBackSpeed: number,
    onHurtCallBack: () => void = () => undefined,
    nextState: string = CHARACTER_STATES.IDLE_STATE,
  ) {
    super(CHARACTER_STATES.HURT_STATE, gameObject);
    this.#hurtPushBackSpeed = hurtPushBackSpeed;
    this.#onHurtCallBack = onHurtCallBack;
    this.#nextState = nextState;
  }

  public onEnter(args: unknown[]): void {
    const attackDirection = args[0] as Direction;

    if (isArcadePhysicsBody(this._gameObject.body)) {
      const body = this._gameObject.body;

      body.velocity.x = 0;
      body.velocity.y = 0;

      switch (attackDirection) {
        case DIRECTION.UP:
          body.velocity.y = this.#hurtPushBackSpeed * -1;
          break;
        case DIRECTION.DOWN:
          body.velocity.y = this.#hurtPushBackSpeed;
          break;
        case DIRECTION.LEFT:
          body.velocity.x = -this.#hurtPushBackSpeed * -1;
          break;
        case DIRECTION.RIGHT:
          body.velocity.x = this.#hurtPushBackSpeed;
          break;
        default:
          exhaustiveGuard(attackDirection);
      }
      this._gameObject.scene.time.delayedCall(HURT_PUSH_BACK_DELAY, () => {
        body.velocity.x = 0;
        body.velocity.y = 0;
      });
    }
    this._gameObject.InvulnerableComponent.invulnerable = true;
    this.#onHurtCallBack();

    this._gameObject.animationComponent.playAnimation(CHARACTER_ANIMATIONS.HURT_DOWN, () => {
      this.#transition();
    });
  }

  #transition(): void {
    this._gameObject.scene.time.delayedCall(this._gameObject.InvulnerableComponent.invulnerableAfterHitAnimationDuration, () => {
        this._gameObject.InvulnerableComponent.invulnerable = false;
      });
      this._stateMachine.setState(this.#nextState);
  }
}
