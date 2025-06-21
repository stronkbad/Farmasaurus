import { isArcadePhysicsBody } from '../../../../common/utils';
import { CharacterGameObject } from '../../../game-objects/common/character-game-object';
import { BaseCharacterState } from './base-character-state';
import { CHARACTER_STATES } from './character-states';
import { CHARACTER_ANIMATIONS } from '../../../../common/assets';

export class Deathstate extends BaseCharacterState {
  #onDieCallBack: () => void;

  constructor(gameObject: CharacterGameObject, onDieCallBack: () => void = () => undefined) {
    super(CHARACTER_STATES.DEATH_STATE, gameObject);
    this.#onDieCallBack = onDieCallBack;
  }

  public onEnter(): void {
    //reset game object velocity
    if (isArcadePhysicsBody(this._gameObject.body)) {
      this._gameObject.body.velocity.x = 0;
      this._gameObject.body.velocity.y = 0;
      //make character invulnerable after taking hit
      this._gameObject.InvulnerableComponent.invulnerable = true;
      this._gameObject.body.enable = false;
    }

    //disable physics body to stop triggering collisions
    // (this._gameObject.body as Phaser.Physics.Arcade.Body).enable = false;

    //play death animation
    this._gameObject.animationComponent.playAnimation(CHARACTER_ANIMATIONS.DIE_DOWN, () => {
      this.#triggeredDefeatedEvent();
    });
  }

  #triggeredDefeatedEvent(): void {
    this._gameObject.disableObject();
    this.#onDieCallBack();
  }
}
