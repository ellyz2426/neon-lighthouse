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

  // Exposed for other systems to read beam direction
  public getBeamDirection(): Vector3 {
    return this.beamDirection.clone();
  }

  public getBeamOrigin(): Vector3 {
    return BEAM_ORIGIN.clone();
  }

  public isBeamActive(): boolean {
    return this.beamActive;
  }

  public getBeamConeAngle(): number {
    return 0.18;
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
    this.handleXRInput();
    this.handleBrowserInput();
    this.updateBeamVisuals(time);
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

    if (this.beamActive) {
      mat.opacity = 0.06 + Math.sin(time * 4) * 0.02;
      this.spotLight.intensity = 4 + Math.sin(time * 3) * 1;

      // Orient beam group to point in beam direction
      const target = BEAM_ORIGIN.clone().add(
        this.beamDirection.clone().multiplyScalar(BEAM_LENGTH),
      );
      this.beamGroup.lookAt(target);
      this.beamGroup.rotateX(Math.PI / 2); // Cone points along -Y, need to fix

      // Move spotlight target
      this.spotLight.target.position
        .copy(this.beamDirection)
        .multiplyScalar(BEAM_LENGTH);
    } else {
      mat.opacity = 0;
      this.spotLight.intensity = 0;
    }
  }
}
