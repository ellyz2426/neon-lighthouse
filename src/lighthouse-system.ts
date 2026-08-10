import {
  createSystem,
  Vector3,
  Vector2,
  Mesh,
  ConeGeometry,
  MeshBasicMaterial,
  Raycaster,
  SpotLight,
  AdditiveBlending,
  Group,
  InputComponent,
  SphereGeometry,
  PointLight,
} from '@iwsdk/core';

const BEAM_LENGTH = 60;
const BEAM_RADIUS = 4;
const BEAM_ORIGIN = new Vector3(0, 11, 0);

export class LighthouseSystem extends createSystem({}) {
  private beamGroup!: Group;
  private beamMesh!: Mesh;
  private spotLight!: SpotLight;
  private beamDirection = new Vector3(0, 0, -1);
  private beamActive = true;
  private aimTarget = new Vector3(0, 0, -30);
  private raycaster = new Raycaster();

  // Mouse aim for browser mode
  private mouseNDC = new Vector2(0, 0);
  private mouseDown = false;

  // Beam energy system
  private beamEnergy = 100;
  private maxEnergy = 100;
  private energyDrainRate = 8; // per second when active
  private energyRechargeRate = 12; // per second when inactive
  private beamOverheated = false;
  private overheatCooldown = 0;

  // Beam upgrades
  private beamRangeMultiplier = 1.0;
  private beamWidthMultiplier = 1.0;
  private beamIntensityMultiplier = 1.0;

  // Beam tip glow
  private beamTipGlow!: PointLight;
  private beamTipMesh!: Mesh;

  // Exposed for other systems to read beam direction
  public getBeamDirection(): Vector3 {
    return this.beamDirection.clone();
  }

  public getBeamOrigin(): Vector3 {
    return BEAM_ORIGIN.clone();
  }

  public isBeamActive(): boolean {
    return this.beamActive && !this.beamOverheated;
  }

  public getBeamConeAngle(): number {
    return 0.18 * this.beamWidthMultiplier;
  }

  public getBeamEnergy(): number {
    return this.beamEnergy;
  }

  public getMaxEnergy(): number {
    return this.maxEnergy;
  }

  public isOverheated(): boolean {
    return this.beamOverheated;
  }

  // Upgrade methods
  public upgradeRange() {
    this.beamRangeMultiplier = Math.min(this.beamRangeMultiplier + 0.15, 1.6);
  }

  public upgradeWidth() {
    this.beamWidthMultiplier = Math.min(this.beamWidthMultiplier + 0.12, 1.5);
  }

  public upgradeIntensity() {
    this.beamIntensityMultiplier = Math.min(this.beamIntensityMultiplier + 0.2, 2.0);
  }

  public upgradeCapacity() {
    this.maxEnergy = Math.min(this.maxEnergy + 20, 200);
    this.beamEnergy = this.maxEnergy;
  }

  public resetEnergy() {
    this.beamEnergy = this.maxEnergy;
    this.beamOverheated = false;
    this.overheatCooldown = 0;
  }

  init() {
    this.buildBeam();
    this.setupMouseControls();
  }

  private buildBeam() {
    this.beamGroup = new Group();

    // Volumetric beam cone
    const beamGeo = new ConeGeometry(BEAM_RADIUS, BEAM_LENGTH, 16, 1, true);
    beamGeo.translate(0, -BEAM_LENGTH / 2, 0);
    const beamMat = new MeshBasicMaterial({
      color: 0xffcc44,
      transparent: true,
      opacity: 0.08,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.beamMesh = new Mesh(beamGeo, beamMat);
    this.beamGroup.add(this.beamMesh);

    // Spot light for actual illumination
    this.spotLight = new SpotLight(0xffcc44, 5, BEAM_LENGTH, 0.2, 0.5);
    this.spotLight.position.set(0, 0, 0);
    this.beamGroup.add(this.spotLight);
    this.beamGroup.add(this.spotLight.target);

    // Beam tip glow — bright point at the end of the beam where it hits water
    const tipGlowMat = new MeshBasicMaterial({
      color: 0xffee66,
      transparent: true,
      opacity: 0.4,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const tipGlowGeo = new SphereGeometry(2, 8, 8);
    this.beamTipMesh = new Mesh(tipGlowGeo, tipGlowMat);
    this.beamTipMesh.position.set(0, -BEAM_LENGTH, 0);
    this.beamGroup.add(this.beamTipMesh);

    this.beamTipGlow = new PointLight(0xffcc44, 3, 15);
    this.beamTipGlow.position.set(0, -BEAM_LENGTH, 0);
    this.beamGroup.add(this.beamTipGlow);

    const entity = this.world.createTransformEntity(this.beamGroup);
    entity.object3D!.position.copy(BEAM_ORIGIN);
  }

  private setupMouseControls() {
    const canvas = this.world.renderer.domElement;
    canvas.addEventListener('mousemove', (e: MouseEvent) => {
      this.mouseNDC.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      );
    });
    canvas.addEventListener('mousedown', () => {
      this.mouseDown = true;
    });
    canvas.addEventListener('mouseup', () => {
      this.mouseDown = false;
    });
    canvas.addEventListener('click', () => {
      this.beamActive = !this.beamActive;
    });
  }

  setBeamActive(active: boolean) {
    this.beamActive = active;
  }

  toggleBeam() {
    this.beamActive = !this.beamActive;
  }

  update(delta: number, time: number) {
    this.updateBeamEnergy(delta);
    this.handleXRInput();
    this.handleBrowserInput();
    this.updateBeamVisuals(time);
  }

  private updateBeamEnergy(delta: number) {
    if (this.beamOverheated) {
      this.overheatCooldown -= delta;
      if (this.overheatCooldown <= 0) {
        this.beamOverheated = false;
        this.beamEnergy = this.maxEnergy * 0.3;
      }
      return;
    }

    if (this.beamActive) {
      this.beamEnergy -= this.energyDrainRate * delta;
      if (this.beamEnergy <= 0) {
        this.beamEnergy = 0;
        this.beamOverheated = true;
        this.overheatCooldown = 2.0;
      }
    } else {
      this.beamEnergy = Math.min(this.beamEnergy + this.energyRechargeRate * delta, this.maxEnergy);
    }
  }

  private handleXRInput() {
    const rightPad = this.world.input.xr.gamepads.right;
    if (!rightPad) return;

    // Toggle beam with trigger
    if (rightPad.getButtonDown(InputComponent.Trigger)) {
      this.beamActive = !this.beamActive;
    }

    // Use ray space for beam direction
    const raySpace = this.world.player.raySpaces.right;
    if (raySpace) {
      const worldPos = new Vector3();
      const worldDir = new Vector3(0, 0, -1);
      raySpace.getWorldPosition(worldPos);
      raySpace.getWorldDirection(worldDir);

      // Aim beam in ray direction projected from lighthouse top
      this.beamDirection.copy(worldDir).normalize();
    }
  }

  private handleBrowserInput() {
    // In browser mode, use mouse position to aim beam
    if (this.world.input.xr.gamepads.right) return; // XR mode active

    // Project mouse into world to determine beam direction
    this.raycaster.setFromCamera(
      this.mouseNDC,
      this.world.camera,
    );

    // Intersect with ocean plane (y=0)
    const planeY = 0;
    const origin = this.raycaster.ray.origin;
    const direction = this.raycaster.ray.direction;
    if (direction.y !== 0) {
      const t = (planeY - origin.y) / direction.y;
      if (t > 0) {
        this.aimTarget.set(
          origin.x + direction.x * t,
          planeY,
          origin.z + direction.z * t,
        );
        this.beamDirection
          .copy(this.aimTarget)
          .sub(BEAM_ORIGIN)
          .normalize();
      }
    }
  }

  private updateBeamVisuals(time: number) {
    const mat = this.beamMesh.material as MeshBasicMaterial;
    const effectiveActive = this.beamActive && !this.beamOverheated;

    if (effectiveActive) {
      // Energy-based opacity — dimmer as energy drops
      const energyFrac = this.beamEnergy / this.maxEnergy;
      const baseOpacity = 0.04 + energyFrac * 0.06;
      mat.opacity = baseOpacity + Math.sin(time * 4) * 0.015;
      this.spotLight.intensity = (3 + Math.sin(time * 3) * 1) * this.beamIntensityMultiplier * energyFrac;

      // Orient beam group to point in beam direction
      const target = BEAM_ORIGIN.clone().add(
        this.beamDirection.clone().multiplyScalar(BEAM_LENGTH * this.beamRangeMultiplier),
      );
      this.beamGroup.lookAt(target);
      this.beamGroup.rotateX(Math.PI / 2); // Cone points along -Y, need to fix

      // Move spotlight target
      this.spotLight.target.position
        .copy(this.beamDirection)
        .multiplyScalar(BEAM_LENGTH * this.beamRangeMultiplier);

      // Beam tip glow — pulse at water intersection
      const tipMat = this.beamTipMesh.material as MeshBasicMaterial;
      tipMat.opacity = 0.2 + Math.sin(time * 5) * 0.15;
      this.beamTipGlow.intensity = (2 + Math.sin(time * 4) * 1) * energyFrac;
      this.beamTipMesh.scale.setScalar(0.8 + Math.sin(time * 3) * 0.2);

      // Overheat warning flicker
      if (energyFrac < 0.2) {
        const flicker = Math.sin(time * 15) > 0 ? 0.5 : 1.0;
        mat.opacity *= flicker;
        this.spotLight.intensity *= flicker;
      }
    } else {
      mat.opacity = 0;
      this.spotLight.intensity = 0;

      // Dim the tip glow
      const tipMat = this.beamTipMesh.material as MeshBasicMaterial;
      tipMat.opacity = 0;
      this.beamTipGlow.intensity = 0;
    }

    // Overheat red pulse on beam mesh
    if (this.beamOverheated) {
      mat.color.setHex(0xff4422);
      mat.opacity = Math.abs(Math.sin(time * 8)) * 0.03;
    } else {
      mat.color.setHex(0xffcc44);
    }
  }
}
