
import { DIRECTION } from '../../../../common/common';
import { Direction } from '../../../../common/types';
import { isArcadePhysicsBody } from '../../../../common/utils';
import { CharacterGameObject } from '../../../game-objects/common/character-game-object';
import { BaseCharacterState } from './base-character-state';
import { CHARACTER_STATES } from './character-states';

export class Movestate extends BaseCharacterState {
  constructor(gameObject: CharacterGameObject) {
    super(CHARACTER_STATES.MOVE_STATE, gameObject);
  }

  public onUpdate(): void {
    const controls = this._gameObject.controls;

    // If no movement keys are pressed, play idle animation
    if (!controls.isUpDown && !controls.isDownDown && !controls.isLeftDown && !controls.isRightDown) {
        this._stateMachine.setState(CHARACTER_STATES.IDLE_STATE);
    }

    if (controls.isUpDown) {
      this.#updateVelocity(false, -1);
      this.#updateDirection(DIRECTION.UP);

    } else if (controls.isDownDown) {
      this.#updateVelocity(false, 1);
      this.#updateDirection(DIRECTION.DOWN);

    } else {
      this.#updateVelocity(false, 0);
    }

    const isMovingVeritcally = controls.isUpDown || controls.isDownDown;
    if (controls.isLeftDown) {

      this._gameObject.setFlipX(true);
      this.#updateVelocity(true, -1);
      
      if (!isMovingVeritcally) {

        this.#updateDirection(DIRECTION.LEFT);
      }
    } else if (controls.isRightDown) {

      this._gameObject.setFlipX(false);
      this.#updateVelocity(true, 1);
      
      if (!isMovingVeritcally) {

        this.#updateDirection(DIRECTION.RIGHT);
      }
    } else {

      this.#updateVelocity(true, 0);
    }

    this.#normalizeVelocity();
  }



  #updateVelocity(isX: boolean, value: number): void {
    if (!isArcadePhysicsBody(this._gameObject.body)) {
      return;
    }
    if (isX) {
      this._gameObject.body.velocity.x = value;
      return;
    } else {
      this._gameObject.body.velocity.y = value;
    }
  }

  #normalizeVelocity(): void {
    if (!isArcadePhysicsBody(this._gameObject.body)) {
      return;
    }
    this._gameObject.body.velocity.normalize().scale(this._gameObject.speed);
  }

  #updateDirection(direction: Direction): void {
    // console.log(`Direction changed to: ${this._gameObject.direction}`);
    this._gameObject.direction = direction;
    this._gameObject.animationComponent.playAnimation(`WALK_${this._gameObject.direction}`);
  }
}
