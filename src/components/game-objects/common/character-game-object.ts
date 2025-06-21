import * as Phaser from 'phaser';
import { Direction, Position } from '../../../common/types';
import { InputComponent } from '../../input/input-component';
import { AnimationComponent, AnimationConfig } from '../../game-object/animation-component';
import { ControlsComponent } from '../../game-object/controls-component';
import { SpeedComponent } from '../../game-object/speed-component';
import { DirectionComponent } from '../../game-object/direction-component';
import { StateMachine } from '../../state-machine/state-machine';
import { InvulnerableComponent } from '../../game-object/invulnerable-component';
import { CHARACTER_STATES } from '../../state-machine/states/character/character-states';
import { LifeComponent } from '../../game-object/life-component';

export type CharacterConfig = {
  scene: Phaser.Scene;
  position: Position;
  assetKey: string;
  frame?: number;
  InputComponent: InputComponent;
  AnimationConfig: AnimationConfig;
  speed: number;
  id?: string;
  isPlayer: boolean;
  isInvulnerable?: boolean;
  invulnerableAfterHitAnimationDuration?: number;
  maxLife: number;
  currentLife?: number;
};

export abstract class CharacterGameObject extends Phaser.Physics.Arcade.Sprite {
  protected _controlsComponent: ControlsComponent;
  protected _speedComponent: SpeedComponent;
  protected _directionComponent: DirectionComponent;
  protected _animationComponent: AnimationComponent;
  protected _invulnerableComponent: InvulnerableComponent;
  protected _lifeComponent: LifeComponent;
  protected _stateMachine: StateMachine;
  protected _isPlayer: boolean;
  protected _isDefeated: boolean;

  constructor(config: CharacterConfig) {
    const {
      scene,
      position,
      assetKey,
      frame,
      speed,
      AnimationConfig,
      InputComponent,
      id,
      isPlayer,
      isInvulnerable,
      invulnerableAfterHitAnimationDuration,
      maxLife,
      currentLife,
    } = config;
    const { x, y } = position;
    super(scene, x, y, assetKey, frame || 0);

    //add object to scene and enable physics
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this._controlsComponent = new ControlsComponent(this, InputComponent);
    this._speedComponent = new SpeedComponent(this, config.speed);
    this._directionComponent = new DirectionComponent(this);
    this._animationComponent = new AnimationComponent(this, AnimationConfig);
    this._invulnerableComponent = new InvulnerableComponent(
      this,
      isInvulnerable || false,
      invulnerableAfterHitAnimationDuration,
    );
    this._lifeComponent = new LifeComponent(this, maxLife, currentLife);

    //add state machine
    this._stateMachine = new StateMachine(id);

    //general config
    this._isPlayer = isPlayer;
    this._isDefeated = false;
  }

  get isDefeated(): boolean {
    return this._isDefeated;
  }

  get isEnemy(): boolean {
    return !this._isPlayer;
  }

  get controls(): InputComponent {
    return this._controlsComponent.controls;
  }

  get speed(): number {
    return this._speedComponent.speed;
  }

  get direction(): Direction {
    return this._directionComponent.direction;
  }
  set direction(value: Direction) {
    this._directionComponent.direction = value;
  }
  get animationComponent(): AnimationComponent {
    return this._animationComponent;
  }
  
  get InvulnerableComponent(): InvulnerableComponent {
    return this._invulnerableComponent;
  }

  public update(): void {
    this._stateMachine.update();
  }

  public hit(direction: Direction, damage: number): void {
    if (this._isDefeated) {
      return;
    }
    // If the character is invulnerable, do not change state
    if (this._invulnerableComponent.invulnerable) {
      return;
    }
    // If the character is already in the death state, do not change state
    this._lifeComponent.takeDamage(damage);
    if (this._lifeComponent.life === 0) {
      this._isDefeated = true;
      this._stateMachine.setState(CHARACTER_STATES.DEATH_STATE);
      return;
    }

    this._stateMachine.setState(CHARACTER_STATES.HURT_STATE, direction);
  }
  // Method to handle the death of the character
  public disableObject(): void {
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
    this.active = false;
    if (!this._isPlayer) {
      this.visible = false;
    }
  }
  // Method to enable the character after being defeated
  public enableObject(): void {
    if (!this._isDefeated) {
      return;
    }
    (this.body as Phaser.Physics.Arcade.Body).enable = true;
    this.active = true;
    this.visible = true;
  }
}
