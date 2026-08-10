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
} from '@iwsdk/core';
import { Ship } from './components.js';
import { LighthouseSystem } from './lighthouse-system.js';
import { EnvironmentSystem } from './environment-system.js';
import { AudioSystem } from './audio-system.js';

interface ShipData {
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
}

const HARBOR_POS = new Vector3(8, 0, -5);
const DOCK_RADIUS = 4;
const SPAWN_DISTANCE = 55;
const BEAM_HIT_RADIUS = 6;

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

  init() {
    this.lighthouseSystem = this.world.getSystem(LighthouseSystem)!;
    this.envSystem = this.world.getSystem(EnvironmentSystem)!;
    this.audioSystem = this.world.getSystem(AudioSystem)!;
  }

  spawnShip(): ShipData {
    const group = new Group();

    // Hull
    const hullMat = new MeshStandardMaterial({ color: 0x334455, roughness: 0.7 });
    const hullGeo = new BoxGeometry(1.2, 0.5, 2.8);
    const hull = new Mesh(hullGeo, hullMat);
    hull.position.y = 0.1;
    group.add(hull);

    // Cabin
    const cabinMat = new MeshStandardMaterial({ color: 0x556677, roughness: 0.6 });
    const cabinGeo = new BoxGeometry(0.8, 0.6, 1.0);
    const cabin = new Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 0.6, -0.3);
    group.add(cabin);

    // Mast
    const mastMat = new MeshStandardMaterial({ color: 0x888888 });
    const mastGeo = new CylinderGeometry(0.04, 0.04, 1.5, 4);
    const mast = new Mesh(mastGeo, mastMat);
    mast.position.set(0, 1.1, 0.3);
    group.add(mast);

    // Navigation lights
    // Port (red, left)
    const portLightGeo = new SphereGeometry(0.08, 6, 6);
    const portLightMat = new MeshBasicMaterial({ color: 0xff2222 });
    const portLightMesh = new Mesh(portLightGeo, portLightMat);
    portLightMesh.position.set(-0.7, 0.5, 1.2);
    group.add(portLightMesh);
    const portLight = new PointLight(0xff2222, 0.8, 5);
    portLight.position.copy(portLightMesh.position);
    group.add(portLight);

    // Starboard (green, right)
    const starLightGeo = new SphereGeometry(0.08, 6, 6);
    const starLightMat = new MeshBasicMaterial({ color: 0x22ff22 });
    const starLightMesh = new Mesh(starLightGeo, starLightMat);
    starLightMesh.position.set(0.7, 0.5, 1.2);
    group.add(starLightMesh);
    const starboardLight = new PointLight(0x22ff22, 0.8, 5);
    starboardLight.position.copy(starLightMesh.position);
    group.add(starboardLight);

    // Random spawn angle from edge
    const spawnAngle = Math.random() * Math.PI * 2;
    const spawnX = Math.cos(spawnAngle) * SPAWN_DISTANCE;
    const spawnZ = Math.sin(spawnAngle) * SPAWN_DISTANCE;

    const entity = this.world.createTransformEntity(group);
    entity.object3D!.position.set(spawnX, 0, spawnZ);

    // Initial heading toward center area
    const headingToCenter = Math.atan2(-spawnZ, -spawnX);

    const shipData: ShipData = {
      entity,
      group,
      speed: this.baseSpeed + Math.random() * 0.3,
      heading: headingToCenter,
      isLit: false,
      litTimer: 0,
      docked: false,
      sinking: false,
      sinkProgress: 0,
      spawnAngle,
      portLight,
      starboardLight,
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

  clearAllShips() {
    for (const ship of this.ships) {
      ship.entity.dispose();
    }
    this.ships = [];
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
          this.ships.splice(i, 1);
        }
        continue;
      }

      // Check if lit by beam
      if (beamActive) {
        // Project ship position onto beam line
        this.tempVec.copy(pos).sub(beamOrigin);
        const dot = this.tempVec.dot(beamDir);
        if (dot > 0) {
          this.tempVec2.copy(beamDir).multiplyScalar(dot);
          const perpDist = this.tempVec.sub(this.tempVec2).length();
          const beamWidthAtDist = dot * 0.18; // cone angle
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
        // Steer toward harbor
        const toHarbor = this.tempVec
          .copy(HARBOR_POS)
          .sub(pos)
          .normalize();
        const targetHeading = Math.atan2(toHarbor.x, toHarbor.z);
        let angleDiff = targetHeading - ship.heading;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        ship.heading += angleDiff * delta * 2;
      } else {
        // Drift slightly — random wander
        ship.heading += (Math.sin(time + i * 3.7) * 0.2) * delta;
      }

      // Move ship
      const moveSpeed = ship.speed * delta;
      pos.x += Math.sin(ship.heading) * moveSpeed;
      pos.z += Math.cos(ship.heading) * moveSpeed;

      // Bob on waves
      pos.y = Math.sin(time * 1.5 + i * 2) * 0.15;

      // Face heading direction
      ship.entity.object3D!.rotation.y = ship.heading;
      ship.entity.object3D!.rotation.z = Math.sin(time * 2 + i) * 0.05;

      // Pulse navigation lights
      const lightPulse = ship.isLit ? 2.0 : 0.5 + Math.sin(time * 3 + i) * 0.3;
      ship.portLight.intensity = lightPulse;
      ship.starboardLight.intensity = lightPulse;

      // Check harbor dock
      const distToHarbor = pos.distanceTo(HARBOR_POS);
      if (distToHarbor < DOCK_RADIUS) {
        ship.docked = true;
        this.audioSystem?.playDockChime();
        continue;
      }

      // Check rock collisions
      for (const rockPos of rockPositions) {
        const dist = pos.distanceTo(rockPos);
        if (dist < 2.5) {
          ship.sinking = true;
          this.audioSystem?.playCrashSound();
          break;
        }
      }

      // Check out of bounds
      if (pos.length() > SPAWN_DISTANCE + 10) {
        ship.sinking = true;
      }
    }
  }
}
