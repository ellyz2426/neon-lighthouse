import {
  createSystem,
  Vector3,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  CylinderGeometry,
  SphereGeometry,
  MeshBasicMaterial,
  PointLight,
  Group,
  BufferGeometry,
  BufferAttribute,
  Points,
  PointsMaterial,
  AdditiveBlending,
} from '@iwsdk/core';
import { Ship } from './components.js';
import { LighthouseSystem } from './lighthouse-system.js';
import { EnvironmentSystem } from './environment-system.js';
import { AudioSystem } from './audio-system.js';

// Ship types: 0=fishing, 1=cargo, 2=ferry, 3=emergency, 4=treasure
export interface ShipData {
  entity: ReturnType<typeof createSystem.prototype.world.createTransformEntity>;
  group: Group;
  speed: number;
  heading: number;
  isLit: boolean;
  litTimer: number;
  docked: boolean;
  sinking: boolean;
  sinkProgress: number;
  spawnAngle: number;
  portLight: PointLight;
  starboardLight: PointLight;
  shipType: number;
  points: number;
  wakeEntity: ReturnType<typeof createSystem.prototype.world.createTransformEntity>;
  wakePoints: Points;
  wakePositions: Float32Array;
  wakeIdx: number;
  glowLight: PointLight;
  flareTimer: number;
  nearRockTimer: number;
  // Lantern trail
  lanternTrailEntity: ReturnType<typeof createSystem.prototype.world.createTransformEntity>;
  lanternTrailPoints: Points;
  lanternTrailPositions: Float32Array;
  lanternTrailIdx: number;
  // Ship horn state
  hornTimer: number;
}

interface FlareData {
  entity: ReturnType<typeof createSystem.prototype.world.createTransformEntity>;
  points: Points;
  life: number;
  posArr: Float32Array;
  velArr: Float32Array;
}

const HARBOR_POS = new Vector3(8, 0, -5);
const DOCK_RADIUS = 4;
const SPAWN_DISTANCE = 55;
const BEAM_HIT_RADIUS = 6;
const WAKE_PARTICLE_COUNT = 30;
const FLARE_PARTICLE_COUNT = 15;
const LANTERN_TRAIL_COUNT = 40;

// Ship type configs
const SHIP_CONFIGS = [
  { name: 'fishing', hullColor: 0x446688, cabinColor: 0x667799, scale: 0.8, speedMod: 1.2, points: 50, hullW: 0.8, hullH: 0.4, hullD: 2.0 },
  { name: 'cargo', hullColor: 0x554433, cabinColor: 0x665544, scale: 1.3, speedMod: 0.7, points: 150, hullW: 1.8, hullH: 0.7, hullD: 4.0 },
  { name: 'ferry', hullColor: 0xccccdd, cabinColor: 0xddddee, scale: 1.1, speedMod: 0.9, points: 200, hullW: 1.4, hullH: 0.5, hullD: 3.2 },
  { name: 'emergency', hullColor: 0xcc2222, cabinColor: 0xff4444, scale: 0.9, speedMod: 1.5, points: 300, hullW: 1.0, hullH: 0.4, hullD: 2.5 },
  { name: 'treasure', hullColor: 0xaa8822, cabinColor: 0xffcc44, scale: 1.2, speedMod: 0.5, points: 500, hullW: 1.6, hullH: 0.6, hullD: 3.5 },
];

// SOS morse code pattern: returns true when light should be ON
function sosLightOn(t: number): boolean {
  const phase = ((t % 4.2) + 4.2) % 4.2;
  // S: ... (3 dots)
  if (phase < 0.15) return true;
  if (phase < 0.25) return false;
  if (phase < 0.40) return true;
  if (phase < 0.50) return false;
  if (phase < 0.65) return true;
  if (phase < 0.95) return false;
  // O: --- (3 dashes)
  if (phase < 1.35) return true;
  if (phase < 1.45) return false;
  if (phase < 1.85) return true;
  if (phase < 1.95) return false;
  if (phase < 2.35) return true;
  if (phase < 2.65) return false;
  // S: ... (3 dots)
  if (phase < 2.80) return true;
  if (phase < 2.90) return false;
  if (phase < 3.05) return true;
  if (phase < 3.15) return false;
  if (phase < 3.30) return true;
  return false; // word gap
}

export class ShipSystem extends createSystem({}) {
  private ships: ShipData[] = [];
  private lighthouseSystem!: LighthouseSystem;
  private envSystem!: EnvironmentSystem;
  private audioSystem!: AudioSystem;
  private tempVec = new Vector3();
  private tempVec2 = new Vector3();
  private tidalForceX = 0;
  private tidalForceZ = 0;

  // Game state (managed by GameSystem)
  public shipsToSpawn = 0;
  public spawnTimer = 0;
  public spawnInterval = 3;
  public baseSpeed = 0.8;
  public waveShipCount = 0;

  // Splash particle pool
  private splashPool: { entity: ReturnType<typeof createSystem.prototype.world.createTransformEntity>; points: Points; life: number; posArr: Float32Array; velArr: Float32Array }[] = [];

  // Dock celebration particles
  private dockCelebrationPool: {
    entity: ReturnType<typeof createSystem.prototype.world.createTransformEntity>;
    points: Points;
    life: number;
    posArr: Float32Array;
    velArr: Float32Array;
  }[] = [];

  // Distress flare pool
  private flarePool: FlareData[] = [];

  init() {
    this.lighthouseSystem = this.world.getSystem(LighthouseSystem)!;
    this.envSystem = this.world.getSystem(EnvironmentSystem)!;
    this.audioSystem = this.world.getSystem(AudioSystem)!;
  }

  private pickShipType(): number {
    const r = Math.random();
    if (r < 0.5) return 0;
    if (r < 0.85) return 1;
    return 2;
  }

  spawnShip(forceType?: number): ShipData {
    const shipType = forceType !== undefined ? forceType : this.pickShipType();
    const cfg = SHIP_CONFIGS[shipType];
    const group = new Group();

    // Hull
    const hullMat = new MeshStandardMaterial({ color: cfg.hullColor, roughness: 0.7 });
    const hullGeo = new BoxGeometry(cfg.hullW, cfg.hullH, cfg.hullD);
    const hull = new Mesh(hullGeo, hullMat);
    hull.position.y = 0.1;
    group.add(hull);

    // Cabin
    const cabinMat = new MeshStandardMaterial({ color: cfg.cabinColor, roughness: 0.6 });
    const cabinH = shipType === 2 ? 0.9 : shipType === 4 ? 0.8 : 0.6;
    const cabinGeo = new BoxGeometry(cfg.hullW * 0.6, cabinH, cfg.hullD * 0.35);
    const cabin = new Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 0.1 + cfg.hullH / 2 + cabinH / 2, -cfg.hullD * 0.1);
    group.add(cabin);

    // Mast
    const mastMat = new MeshStandardMaterial({ color: 0x888888 });
    const mastH = shipType === 0 ? 2.0 : 1.2;
    const mastGeo = new CylinderGeometry(0.04, 0.04, mastH, 4);
    const mast = new Mesh(mastGeo, mastMat);
    mast.position.set(0, 0.1 + cfg.hullH / 2 + mastH / 2, cfg.hullD * 0.2);
    group.add(mast);

    // Cargo containers (cargo ships only)
    if (shipType === 1) {
      const containerMat = new MeshStandardMaterial({ color: 0xcc6622, roughness: 0.8 });
      for (let c = 0; c < 3; c++) {
        const contGeo = new BoxGeometry(0.5, 0.4, 0.6);
        const cont = new Mesh(contGeo, containerMat);
        cont.position.set(
          (c - 1) * 0.55,
          0.1 + cfg.hullH / 2 + 0.2,
          cfg.hullD * 0.25,
        );
        group.add(cont);
      }
    }

    // Ferry windows
    if (shipType === 2) {
      const windowMat = new MeshBasicMaterial({ color: 0xffdd88 });
      for (let w = 0; w < 4; w++) {
        const winGeo = new BoxGeometry(0.02, 0.15, 0.15);
        const winMesh = new Mesh(winGeo, windowMat);
        winMesh.position.set(
          cfg.hullW * 0.3 + 0.01,
          0.1 + cfg.hullH / 2 + 0.3,
          -cfg.hullD * 0.15 + w * 0.25,
        );
        group.add(winMesh);
        const winMesh2 = winMesh.clone();
        winMesh2.position.x = -(cfg.hullW * 0.3 + 0.01);
        group.add(winMesh2);
      }
    }

    // Emergency ship: flashing red light on top
    if (shipType === 3) {
      const emergencyGlowMat = new MeshBasicMaterial({ color: 0xff0000 });
      const emergencyGlowGeo = new SphereGeometry(0.15, 6, 6);
      const emergencyGlow = new Mesh(emergencyGlowGeo, emergencyGlowMat);
      emergencyGlow.position.set(0, 0.1 + cfg.hullH + 1.0, 0);
      group.add(emergencyGlow);
      const redLight = new PointLight(0xff0000, 2, 8);
      redLight.position.copy(emergencyGlow.position);
      group.add(redLight);
    }

    // Treasure ship: gold accents and glow
    if (shipType === 4) {
      const goldMat = new MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.8 });
      const goldRimGeo = new CylinderGeometry(cfg.hullW * 0.55, cfg.hullW * 0.55, 0.1, 8);
      const goldRim = new Mesh(goldRimGeo, goldMat);
      goldRim.position.set(0, 0.1 + cfg.hullH + 0.05, 0);
      group.add(goldRim);
      const treasureLight = new PointLight(0xffaa00, 2, 10);
      treasureLight.position.set(0, 0.5, 0);
      group.add(treasureLight);
    }

    // Navigation lights
    const portLightGeo = new SphereGeometry(0.08, 6, 6);
    const portLightMat = new MeshBasicMaterial({ color: 0xff2222 });
    const portLightMesh = new Mesh(portLightGeo, portLightMat);
    portLightMesh.position.set(-cfg.hullW / 2 - 0.1, 0.3, cfg.hullD / 2);
    group.add(portLightMesh);
    const portLight = new PointLight(0xff2222, 0.8, 5);
    portLight.position.copy(portLightMesh.position);
    group.add(portLight);

    const starLightGeo = new SphereGeometry(0.08, 6, 6);
    const starLightMat = new MeshBasicMaterial({ color: 0x22ff22 });
    const starLightMesh = new Mesh(starLightGeo, starLightMat);
    starLightMesh.position.set(cfg.hullW / 2 + 0.1, 0.3, cfg.hullD / 2);
    group.add(starLightMesh);
    const starboardLight = new PointLight(0x22ff22, 0.8, 5);
    starboardLight.position.copy(starLightMesh.position);
    group.add(starboardLight);

    // Illumination glow light
    const glowLight = new PointLight(0xffcc44, 0, 8);
    glowLight.position.set(0, 0.5, 0);
    group.add(glowLight);

    group.scale.setScalar(cfg.scale);

    // Spawn position
    const spawnAngle = Math.random() * Math.PI * 2;
    const spawnX = Math.cos(spawnAngle) * SPAWN_DISTANCE;
    const spawnZ = Math.sin(spawnAngle) * SPAWN_DISTANCE;

    const entity = this.world.createTransformEntity(group);
    entity.object3D!.position.set(spawnX, 0, spawnZ);

    const headingToCenter = Math.atan2(-spawnZ, -spawnX);

    // Wake trail particles
    const wakePositions = new Float32Array(WAKE_PARTICLE_COUNT * 3);
    for (let i = 0; i < WAKE_PARTICLE_COUNT * 3; i++) {
      wakePositions[i] = 0;
    }
    const wakeGeo = new BufferGeometry();
    wakeGeo.setAttribute('position', new BufferAttribute(wakePositions, 3));
    const wakeMat = new PointsMaterial({
      color: 0x88ccdd,
      size: 0.3,
      transparent: true,
      opacity: 0.3,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const wakePoints = new Points(wakeGeo, wakeMat);
    const wakeEntity = this.world.createTransformEntity(wakePoints);

    // Lantern trail particles (golden glow trail for lit ships)
    const lanternTrailPositions = new Float32Array(LANTERN_TRAIL_COUNT * 3);
    for (let i = 0; i < LANTERN_TRAIL_COUNT * 3; i++) {
      lanternTrailPositions[i] = 0;
    }
    const lanternGeo = new BufferGeometry();
    lanternGeo.setAttribute('position', new BufferAttribute(lanternTrailPositions, 3));
    const lanternMat = new PointsMaterial({
      color: 0xffcc44,
      size: 0.4,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const lanternTrailPoints = new Points(lanternGeo, lanternMat);
    const lanternTrailEntity = this.world.createTransformEntity(lanternTrailPoints);

    const shipData: ShipData = {
      entity,
      group,
      speed: this.baseSpeed * cfg.speedMod + Math.random() * 0.2,
      heading: headingToCenter,
      isLit: false,
      litTimer: 0,
      docked: false,
      sinking: false,
      sinkProgress: 0,
      spawnAngle,
      portLight,
      starboardLight,
      shipType,
      points: cfg.points,
      wakeEntity,
      wakePoints,
      wakePositions,
      wakeIdx: 0,
      glowLight,
      flareTimer: 0,
      nearRockTimer: 0,
      lanternTrailEntity,
      lanternTrailPoints,
      lanternTrailPositions,
      lanternTrailIdx: 0,
      hornTimer: (shipType === 1 || shipType === 2) ? (5 + Math.random() * 10) : -1,
    };

    this.ships.push(shipData);
    this.audioSystem?.playShipBell();

    // Special spawn sounds
    if (shipType === 3) {
      this.audioSystem?.playDistressHorn();
    } else if (shipType === 4) {
      this.audioSystem?.playTreasureChime();
    }
    // Ship horn for large vessels on spawn
    if (shipType === 1 || shipType === 2) {
      this.audioSystem?.playShipHorn();
    }

    return shipData;
  }

  getActiveShipCount(): number {
    return this.ships.filter((s) => !s.docked && !s.sinking).length;
  }

  getAllShips(): ShipData[] {
    return this.ships;
  }

  getShipCountByType(): [number, number, number] {
    let f = 0, c = 0, p = 0;
    for (const s of this.ships) {
      if (s.docked || s.sinking) continue;
      if (s.shipType === 0) f++;
      else if (s.shipType === 1) c++;
      else p++;
    }
    return [f, c, p];
  }

  getSpecialShipCount(): [number, number] {
    let emergency = 0, treasure = 0;
    for (const s of this.ships) {
      if (s.docked || s.sinking) continue;
      if (s.shipType === 3) emergency++;
      if (s.shipType === 4) treasure++;
    }
    return [emergency, treasure];
  }

  // Sonar reveal: boost litTimer for all ships within radius
  sonarReveal(radius: number) {
    for (const ship of this.ships) {
      if (ship.docked || ship.sinking) continue;
      const pos = ship.entity.object3D!.position;
      const dist = pos.length(); // distance from lighthouse at origin
      if (dist < radius) {
        ship.litTimer = Math.max(ship.litTimer, 1.5);
        ship.isLit = true;
      }
    }
  }

  clearAllShips() {
    for (const ship of this.ships) {
      ship.entity.dispose();
      ship.wakeEntity.dispose();
      ship.lanternTrailEntity.dispose();
    }
    this.ships = [];

    for (const flare of this.flarePool) {
      flare.entity.dispose();
    }
    this.flarePool = [];

    for (const celeb of this.dockCelebrationPool) {
      celeb.entity.dispose();
    }
    this.dockCelebrationPool = [];
  }

  setTidalForce(x: number, z: number) {
    this.tidalForceX = x;
    this.tidalForceZ = z;
  }

  private spawnSplash(position: Vector3) {
    const count = 20;
    const posArr = new Float32Array(count * 3);
    const velArr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      posArr[i * 3] = position.x + (Math.random() - 0.5) * 1.5;
      posArr[i * 3 + 1] = position.y + Math.random() * 0.5;
      posArr[i * 3 + 2] = position.z + (Math.random() - 0.5) * 1.5;
      velArr[i * 3] = (Math.random() - 0.5) * 3;
      velArr[i * 3 + 1] = 2 + Math.random() * 3;
      velArr[i * 3 + 2] = (Math.random() - 0.5) * 3;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(posArr, 3));
    const mat = new PointsMaterial({
      color: 0xaaddee,
      size: 0.25,
      transparent: true,
      opacity: 0.7,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const points = new Points(geo, mat);
    const entity = this.world.createTransformEntity(points);
    this.splashPool.push({ entity, points, life: 1.0, posArr, velArr });
  }

  private spawnDockCelebration(position: Vector3) {
    const count = 30;
    const posArr = new Float32Array(count * 3);
    const velArr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      posArr[i * 3] = position.x + (Math.random() - 0.5) * 0.5;
      posArr[i * 3 + 1] = position.y + 0.5;
      posArr[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.5;
      const angle = Math.random() * Math.PI * 2;
      const upSpeed = 3 + Math.random() * 4;
      const outSpeed = 1 + Math.random() * 2;
      velArr[i * 3] = Math.cos(angle) * outSpeed;
      velArr[i * 3 + 1] = upSpeed;
      velArr[i * 3 + 2] = Math.sin(angle) * outSpeed;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(posArr, 3));
    const mat = new PointsMaterial({
      color: 0xffcc44,
      size: 0.35,
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const points = new Points(geo, mat);
    const entity = this.world.createTransformEntity(points);
    this.dockCelebrationPool.push({ entity, points, life: 1.5, posArr, velArr });
  }

  private spawnDistressFlare(position: Vector3) {
    const posArr = new Float32Array(FLARE_PARTICLE_COUNT * 3);
    const velArr = new Float32Array(FLARE_PARTICLE_COUNT * 3);
    for (let i = 0; i < FLARE_PARTICLE_COUNT; i++) {
      posArr[i * 3] = position.x;
      posArr[i * 3 + 1] = position.y + 0.5;
      posArr[i * 3 + 2] = position.z;
      const angle = Math.random() * Math.PI * 2;
      const upSpeed = 5 + Math.random() * 5;
      velArr[i * 3] = Math.cos(angle) * (0.5 + Math.random());
      velArr[i * 3 + 1] = upSpeed;
      velArr[i * 3 + 2] = Math.sin(angle) * (0.5 + Math.random());
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(posArr, 3));
    const mat = new PointsMaterial({
      color: 0xff3322,
      size: 0.5,
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const points = new Points(geo, mat);
    const entity = this.world.createTransformEntity(points);
    this.flarePool.push({ entity, points, life: 2.5, posArr, velArr });
  }

  update(delta: number, time: number) {
    // Spawn queued ships
    if (this.shipsToSpawn > 0) {
      this.spawnTimer -= delta;
      if (this.spawnTimer <= 0) {
        this.spawnShip();
        this.shipsToSpawn--;
        this.spawnTimer = this.spawnInterval;
      }
    }

    const beamOrigin = this.lighthouseSystem.getBeamOrigin();
    const beamDir = this.lighthouseSystem.getBeamDirection();
    const beamActive = this.lighthouseSystem.isBeamActive();
    const beamConeAngle = this.lighthouseSystem.getBeamConeAngle();
    const rockPositions = this.envSystem.rockPositions;
    const windStrength = this.envSystem.getWindStrength();

    // Current drift
    const currentStrength = this.envSystem.getCurrentStrength();
    const currentAngle = this.envSystem.getCurrentDirAngle();
    const currentDriftX = Math.cos(currentAngle) * currentStrength;
    const currentDriftZ = Math.sin(currentAngle) * currentStrength;

    for (let i = this.ships.length - 1; i >= 0; i--) {
      const ship = this.ships[i];
      if (ship.docked) continue;

      const pos = ship.entity.object3D!.position;

      // Handle sinking
      if (ship.sinking) {
        ship.sinkProgress += delta * 0.5;
        pos.y = -ship.sinkProgress * 3;
        ship.entity.object3D!.rotation.z = Math.sin(time * 5) * ship.sinkProgress * 0.5;
        if (ship.sinkProgress >= 1) {
          ship.entity.dispose();
          ship.wakeEntity.dispose();
          ship.lanternTrailEntity.dispose();
          this.ships.splice(i, 1);
        }
        continue;
      }

      // Check if lit by beam
      if (beamActive) {
        this.tempVec.copy(pos).sub(beamOrigin);
        const dot = this.tempVec.dot(beamDir);
        if (dot > 0) {
          this.tempVec2.copy(beamDir).multiplyScalar(dot);
          const perpDist = this.tempVec.sub(this.tempVec2).length();
          const beamWidthAtDist = dot * beamConeAngle;
          ship.isLit = perpDist < beamWidthAtDist + BEAM_HIT_RADIUS;
        } else {
          ship.isLit = false;
        }
      } else {
        ship.isLit = false;
      }

      // Update lit timer
      if (ship.isLit) {
        ship.litTimer = Math.min(ship.litTimer + delta, 2.0);
      } else {
        ship.litTimer = Math.max(ship.litTimer - delta * 0.5, 0);
      }

      // Illumination glow
      const glowTarget = ship.isLit ? 3.0 : 0;
      ship.glowLight.intensity += (glowTarget - ship.glowLight.intensity) * delta * 5;

      // Navigation
      if (ship.litTimer > 0.3) {
        const toHarbor = this.tempVec.copy(HARBOR_POS).sub(pos).normalize();
        const targetHeading = Math.atan2(toHarbor.x, toHarbor.z);
        let angleDiff = targetHeading - ship.heading;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        ship.heading += angleDiff * delta * 2;
      } else {
        ship.heading += (Math.sin(time + i * 3.7) * 0.2) * delta;
      }

      // Ship-to-ship collision avoidance
      for (let j = 0; j < this.ships.length; j++) {
        if (j === i) continue;
        const other = this.ships[j];
        if (other.docked || other.sinking) continue;
        const otherPos = other.entity.object3D!.position;
        const dx = pos.x - otherPos.x;
        const dz = pos.z - otherPos.z;
        const distSq = dx * dx + dz * dz;
        const avoidRadius = 5;
        if (distSq < avoidRadius * avoidRadius && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          const avoidAngle = Math.atan2(dx, dz);
          const avoidStrength = (1 - dist / avoidRadius) * 1.5;
          let avoidDiff = avoidAngle - ship.heading;
          while (avoidDiff > Math.PI) avoidDiff -= Math.PI * 2;
          while (avoidDiff < -Math.PI) avoidDiff += Math.PI * 2;
          ship.heading += avoidDiff * avoidStrength * delta;
        }
      }

      // Wind drift
      ship.heading += windStrength * 0.05 * delta;

      // Move ship
      const moveSpeed = ship.speed * delta;
      pos.x += Math.sin(ship.heading) * moveSpeed;
      pos.z += Math.cos(ship.heading) * moveSpeed;

      // Current drift force
      if (currentStrength > 0.01) {
        pos.x += currentDriftX * delta * 2;
        pos.z += currentDriftZ * delta * 2;
        // Also slightly push the heading
        ship.heading += currentStrength * 0.02 * delta * Math.sin(currentAngle - ship.heading);
      }

      // Tidal wave force
      if (Math.abs(this.tidalForceX) > 0.01 || Math.abs(this.tidalForceZ) > 0.01) {
        pos.x += this.tidalForceX * delta;
        pos.z += this.tidalForceZ * delta;
      }

      // Bob on waves
      pos.y = Math.sin(time * 1.5 + i * 2) * 0.15;

      // Face heading
      ship.entity.object3D!.rotation.y = ship.heading;
      ship.entity.object3D!.rotation.z = Math.sin(time * 2 + i) * 0.05;

      // Compute nearest rock (for SOS blink and distress flares)
      let nearestRockDist = Infinity;
      for (const rockPos of rockPositions) {
        const d = pos.distanceTo(rockPos);
        if (d < nearestRockDist) nearestRockDist = d;
      }

      // Pulse navigation lights
      const lightPulse = ship.isLit ? 2.0 : 0.5 + Math.sin(time * 3 + i) * 0.3;
      ship.portLight.intensity = lightPulse;
      ship.starboardLight.intensity = lightPulse;

      // SOS morse code blink for unlit ships near rocks
      if (nearestRockDist < 8 && !ship.isLit && ship.shipType <= 2) {
        const sosOn = sosLightOn(time + i * 1.7);
        ship.portLight.intensity = sosOn ? 3.0 : 0.1;
        ship.starboardLight.intensity = sosOn ? 3.0 : 0.1;
      }

      // Emergency ship: fast flashing red
      if (ship.shipType === 3) {
        const flash = Math.sin(time * 10) > 0 ? 3.0 : 0.5;
        ship.portLight.intensity = flash;
        ship.starboardLight.intensity = flash;
        ship.portLight.color.setHex(0xff0000);
        ship.starboardLight.color.setHex(0xff0000);
      }

      // Treasure ship: golden pulse
      if (ship.shipType === 4) {
        ship.glowLight.color.setHex(0xffaa00);
        ship.glowLight.intensity = 1.5 + Math.sin(time * 2) * 0.5;
      }

      // Update wake trail
      if (!ship.docked && !ship.sinking) {
        const wIdx = ship.wakeIdx % WAKE_PARTICLE_COUNT;
        ship.wakePositions[wIdx * 3] = pos.x - Math.sin(ship.heading) * 1.5;
        ship.wakePositions[wIdx * 3 + 1] = 0.05;
        ship.wakePositions[wIdx * 3 + 2] = pos.z - Math.cos(ship.heading) * 1.5;
        ship.wakeIdx++;
        (ship.wakePoints.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      }

      // Lantern trail — golden glow trail when ship is lit
      const lanternMat = ship.lanternTrailPoints.material as PointsMaterial;
      if (ship.isLit || ship.litTimer > 0) {
        // Add trail point
        const ltIdx = ship.lanternTrailIdx % LANTERN_TRAIL_COUNT;
        ship.lanternTrailPositions[ltIdx * 3] = pos.x;
        ship.lanternTrailPositions[ltIdx * 3 + 1] = 0.2;
        ship.lanternTrailPositions[ltIdx * 3 + 2] = pos.z;
        ship.lanternTrailIdx++;
        (ship.lanternTrailPoints.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
        const targetOpacity = ship.isLit ? 0.35 : Math.max(0, ship.litTimer * 0.15);
        lanternMat.opacity += (targetOpacity - lanternMat.opacity) * delta * 3;
      } else {
        lanternMat.opacity = Math.max(0, lanternMat.opacity - delta * 0.5);
      }

      // Ship horn for cargo/ferry — periodic deep horn
      if (ship.hornTimer > 0) {
        ship.hornTimer -= delta;
        if (ship.hornTimer <= 0) {
          this.audioSystem?.playShipHorn();
          ship.hornTimer = 12 + Math.random() * 15;
        }
      }

      // Distress flares — ships near rocks fire flares
      if (nearestRockDist < 8 && !ship.isLit) {
        ship.nearRockTimer += delta;
        ship.flareTimer -= delta;
        if (ship.flareTimer <= 0 && ship.nearRockTimer > 1.0) {
          this.spawnDistressFlare(pos.clone());
          this.audioSystem?.playFlareSound();
          ship.flareTimer = 3.0 + Math.random() * 2;
        }
      } else {
        ship.nearRockTimer = 0;
      }

      // Check harbor dock
      const distToHarbor = pos.distanceTo(HARBOR_POS);
      if (distToHarbor < DOCK_RADIUS) {
        ship.docked = true;
        this.spawnSplash(pos.clone());
        this.spawnDockCelebration(pos.clone());
        this.audioSystem?.playDockChime();
        continue;
      }

      // Check rock collisions
      for (const rockPos of rockPositions) {
        const dist = pos.distanceTo(rockPos);
        if (dist < 2.5) {
          ship.sinking = true;
          this.spawnSplash(pos.clone());
          this.audioSystem?.playCrashSound();
          break;
        }
      }

      // Out of bounds
      if (pos.length() > SPAWN_DISTANCE + 10) {
        ship.sinking = true;
      }
    }

    // Update splash particles
    for (let s = this.splashPool.length - 1; s >= 0; s--) {
      const splash = this.splashPool[s];
      splash.life -= delta * 1.5;
      if (splash.life <= 0) {
        splash.entity.dispose();
        this.splashPool.splice(s, 1);
        continue;
      }
      const pMat = splash.points.material as PointsMaterial;
      pMat.opacity = splash.life * 0.7;
      for (let p = 0; p < 20; p++) {
        splash.posArr[p * 3] += splash.velArr[p * 3] * delta;
        splash.posArr[p * 3 + 1] += splash.velArr[p * 3 + 1] * delta;
        splash.posArr[p * 3 + 2] += splash.velArr[p * 3 + 2] * delta;
        splash.velArr[p * 3 + 1] -= 9.8 * delta;
      }
      (splash.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    }

    // Update distress flares
    for (let f = this.flarePool.length - 1; f >= 0; f--) {
      const flare = this.flarePool[f];
      flare.life -= delta;
      if (flare.life <= 0) {
        flare.entity.dispose();
        this.flarePool.splice(f, 1);
        continue;
      }
      const fMat = flare.points.material as PointsMaterial;
      fMat.opacity = Math.min(flare.life, 1.0) * 0.9;
      for (let p = 0; p < FLARE_PARTICLE_COUNT; p++) {
        flare.posArr[p * 3] += flare.velArr[p * 3] * delta;
        flare.posArr[p * 3 + 1] += flare.velArr[p * 3 + 1] * delta;
        flare.posArr[p * 3 + 2] += flare.velArr[p * 3 + 2] * delta;
        flare.velArr[p * 3 + 1] -= 3.0 * delta;
      }
      (flare.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    }

    // Update dock celebration particles
    for (let c = this.dockCelebrationPool.length - 1; c >= 0; c--) {
      const celeb = this.dockCelebrationPool[c];
      celeb.life -= delta;
      if (celeb.life <= 0) {
        celeb.entity.dispose();
        this.dockCelebrationPool.splice(c, 1);
        continue;
      }
      const cMat = celeb.points.material as PointsMaterial;
      cMat.opacity = Math.min(celeb.life, 1.0) * 0.9;
      for (let p = 0; p < 30; p++) {
        celeb.posArr[p * 3] += celeb.velArr[p * 3] * delta;
        celeb.posArr[p * 3 + 1] += celeb.velArr[p * 3 + 1] * delta;
        celeb.posArr[p * 3 + 2] += celeb.velArr[p * 3 + 2] * delta;
        celeb.velArr[p * 3 + 1] -= 4.0 * delta; // gravity
      }
      (celeb.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    }
  }
}
