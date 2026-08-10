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

// Ship types: 0=fishing, 1=cargo, 2=ferry
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
}

const HARBOR_POS = new Vector3(8, 0, -5);
const DOCK_RADIUS = 4;
const SPAWN_DISTANCE = 55;
const BEAM_HIT_RADIUS = 6;
const WAKE_PARTICLE_COUNT = 30;

// Ship type configs
const SHIP_CONFIGS = [
  { name: 'fishing', hullColor: 0x446688, cabinColor: 0x667799, scale: 0.8, speedMod: 1.2, points: 50, hullW: 0.8, hullH: 0.4, hullD: 2.0 },
  { name: 'cargo', hullColor: 0x554433, cabinColor: 0x665544, scale: 1.3, speedMod: 0.7, points: 150, hullW: 1.8, hullH: 0.7, hullD: 4.0 },
  { name: 'ferry', hullColor: 0xccccdd, cabinColor: 0xddddee, scale: 1.1, speedMod: 0.9, points: 200, hullW: 1.4, hullH: 0.5, hullD: 3.2 },
];

export class ShipSystem extends createSystem({}) {
  private ships: ShipData[] = [];
  private lighthouseSystem!: LighthouseSystem;
  private envSystem!: EnvironmentSystem;
  private audioSystem!: AudioSystem;
  private tempVec = new Vector3();
  private tempVec2 = new Vector3();

  // Game state (managed by GameSystem)
  public shipsToSpawn = 0;
  public spawnTimer = 0;
  public spawnInterval = 3;
  public baseSpeed = 0.8;
  public waveShipCount = 0;

  // Splash particle pool
  private splashPool: { entity: ReturnType<typeof createSystem.prototype.world.createTransformEntity>; points: Points; life: number; posArr: Float32Array; velArr: Float32Array }[] = [];

  init() {
    this.lighthouseSystem = this.world.getSystem(LighthouseSystem)!;
    this.envSystem = this.world.getSystem(EnvironmentSystem)!;
    this.audioSystem = this.world.getSystem(AudioSystem)!;
  }

  private pickShipType(): number {
    const r = Math.random();
    if (r < 0.5) return 0;       // 50% fishing
    if (r < 0.85) return 1;      // 35% cargo
    return 2;                    // 15% ferry
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
    const cabinH = shipType === 2 ? 0.9 : 0.6; // Ferries have taller cabin
    const cabinGeo = new BoxGeometry(cfg.hullW * 0.6, cabinH, cfg.hullD * 0.35);
    const cabin = new Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 0.1 + cfg.hullH / 2 + cabinH / 2, -cfg.hullD * 0.1);
    group.add(cabin);

    // Mast (fishing boats have taller mast)
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

    // Ferry windows (ferry only)
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

    // Scale the whole ship
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
    };

    this.ships.push(shipData);
    this.audioSystem?.playShipBell();
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

  clearAllShips() {
    for (const ship of this.ships) {
      ship.entity.dispose();
      ship.wakeEntity.dispose();
    }
    this.ships = [];
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
    const rockPositions = this.envSystem.rockPositions;
    const windStrength = this.envSystem.getWindStrength();

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
          const beamWidthAtDist = dot * 0.18;
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

      // Wind drift
      ship.heading += windStrength * 0.05 * delta;

      // Move ship
      const moveSpeed = ship.speed * delta;
      pos.x += Math.sin(ship.heading) * moveSpeed;
      pos.z += Math.cos(ship.heading) * moveSpeed;

      // Bob on waves
      pos.y = Math.sin(time * 1.5 + i * 2) * 0.15;

      // Face heading
      ship.entity.object3D!.rotation.y = ship.heading;
      ship.entity.object3D!.rotation.z = Math.sin(time * 2 + i) * 0.05;

      // Pulse navigation lights
      const lightPulse = ship.isLit ? 2.0 : 0.5 + Math.sin(time * 3 + i) * 0.3;
      ship.portLight.intensity = lightPulse;
      ship.starboardLight.intensity = lightPulse;

      // Update wake trail
      if (!ship.docked && !ship.sinking) {
        const wIdx = ship.wakeIdx % WAKE_PARTICLE_COUNT;
        ship.wakePositions[wIdx * 3] = pos.x - Math.sin(ship.heading) * 1.5;
        ship.wakePositions[wIdx * 3 + 1] = 0.05;
        ship.wakePositions[wIdx * 3 + 2] = pos.z - Math.cos(ship.heading) * 1.5;
        ship.wakeIdx++;
        (ship.wakePoints.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      }

      // Check harbor dock
      const distToHarbor = pos.distanceTo(HARBOR_POS);
      if (distToHarbor < DOCK_RADIUS) {
        ship.docked = true;
        this.spawnSplash(pos.clone());
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
        splash.velArr[p * 3 + 1] -= 9.8 * delta; // gravity
      }
      (splash.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    }
  }
}
