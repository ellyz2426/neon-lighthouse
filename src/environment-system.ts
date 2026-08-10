import {
  createSystem,
  World,
  Vector3,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  CylinderGeometry,
  MeshStandardMaterial,
  SphereGeometry,
  ConeGeometry,
  BoxGeometry,
  PointLight,
  AmbientLight,
  FogExp2,
  BufferGeometry,
  BufferAttribute,
  Points,
  PointsMaterial,
  MeshBasicMaterial,
  Color,
  DoubleSide,
  AdditiveBlending,
  Group,
  TorusGeometry,
  RingGeometry,
  Float32BufferAttribute,
} from '@iwsdk/core';

const OCEAN_SIZE = 200;
const OCEAN_SEGMENTS = 80;
const LIGHTHOUSE_HEIGHT = 10;
const HARBOR_POS = new Vector3(8, 0, -5);
const NUM_ROCKS = 12;
const STAR_COUNT = 600;
const RAIN_COUNT = 2000;
const NUM_BUOYS = 6;

export class EnvironmentSystem extends createSystem({}) {
  private oceanMesh!: Mesh;
  private oceanGeo!: PlaneGeometry;
  private posAttr!: BufferAttribute;
  private origY!: Float32Array;
  private fogDensity = 0.012;
  private targetFogDensity = 0.012;
  private harborLights: PointLight[] = [];
  private starPoints!: Points;
  private lighthouseGroup!: Group;
  private lanternLight!: PointLight;
  private lanternMesh!: Mesh;

  // Weather
  private rainPoints!: Points;
  private rainPositions!: Float32Array;
  private rainActive = false;
  private lightningTimer = 0;
  private lightningFlash!: AmbientLight;
  private lightningActive = false;
  private windStrength = 0;
  private targetWindStrength = 0;

  // Sky color shifting
  private skyDome!: Color;
  private targetSkyColor = new Color(0x010818);
  private currentSkyColor = new Color(0x010818);

  // Moon and clouds
  private moonMesh!: Mesh;
  private cloudMeshes: Mesh[] = [];

  // Rock foam
  private foamMeshes: Mesh[] = [];

  // Buoys
  private buoyGroups: Group[] = [];
  private buoyLights: PointLight[] = [];
  private buoysVisible = true;

  // Exposed for other systems
  public rockPositions: Vector3[] = [];
  public harborPosition = HARBOR_POS.clone();

  init() {
    this.buildOcean();
    this.buildLighthouse();
    this.buildHarbor();
    this.buildRocks();
    this.buildStarfield();
    this.buildLighting();
    this.buildMoon();
    this.buildClouds();
    this.buildRainSystem();
    this.buildBuoys();
  }

  private buildOcean() {
    const geo = new PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, OCEAN_SEGMENTS, OCEAN_SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const mat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDeepColor: { value: new Color(0x001428) },
        uShallowColor: { value: new Color(0x003344) },
        uFoamColor: { value: new Color(0x00ffcc) },
        uWindStrength: { value: 0 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uWindStrength;
        varying vec2 vUv;
        varying float vElevation;
        void main() {
          vUv = uv;
          vec3 pos = position;
          float windWave = sin(pos.x * 0.3 + uTime * 2.0) * uWindStrength * 0.5;
          float wave1 = sin(pos.x * 0.15 + uTime * 0.8) * 0.3;
          float wave2 = sin(pos.z * 0.12 + uTime * 0.6) * 0.25;
          float wave3 = sin((pos.x + pos.z) * 0.08 + uTime * 1.1) * 0.15;
          pos.y += wave1 + wave2 + wave3 + windWave;
          vElevation = wave1 + wave2 + wave3 + windWave;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        uniform vec3 uFoamColor;
        varying vec2 vUv;
        varying float vElevation;
        void main() {
          float depth = smoothstep(-0.4, 0.5, vElevation);
          vec3 col = mix(uDeepColor, uShallowColor, depth);
          float foam = smoothstep(0.35, 0.5, vElevation);
          col = mix(col, uFoamColor, foam * 0.15);
          gl_FragColor = vec4(col, 0.92);
        }
      `,
      transparent: true,
      side: DoubleSide,
    });
    this.oceanMesh = new Mesh(geo, mat);
    this.oceanGeo = geo;
    this.posAttr = geo.getAttribute('position') as BufferAttribute;
    this.origY = new Float32Array(this.posAttr.count);
    for (let i = 0; i < this.posAttr.count; i++) {
      this.origY[i] = this.posAttr.getY(i);
    }
    const oceanEntity = this.world.createTransformEntity(this.oceanMesh);
    oceanEntity.object3D!.position.set(0, -0.2, 0);

    this.world.scene.fog = new FogExp2(0x010818, this.fogDensity);
  }

  private buildLighthouse() {
    this.lighthouseGroup = new Group();

    // Tower base
    const baseMat = new MeshStandardMaterial({ color: 0x334455, roughness: 0.8 });
    const baseGeo = new CylinderGeometry(2.5, 3.0, 2, 12);
    const baseMesh = new Mesh(baseGeo, baseMat);
    baseMesh.position.set(0, 1, 0);
    this.lighthouseGroup.add(baseMesh);

    // Tower body
    const towerMat = new MeshStandardMaterial({ color: 0xcccccc, roughness: 0.6 });
    const towerGeo = new CylinderGeometry(1.5, 2.2, LIGHTHOUSE_HEIGHT - 2, 12);
    const towerMesh = new Mesh(towerGeo, towerMat);
    towerMesh.position.set(0, (LIGHTHOUSE_HEIGHT - 2) / 2 + 2, 0);
    this.lighthouseGroup.add(towerMesh);

    // Red stripe bands
    const stripeMat = new MeshStandardMaterial({ color: 0xcc2222, roughness: 0.5 });
    for (let i = 0; i < 3; i++) {
      const stripeGeo = new CylinderGeometry(
        1.5 + (2 - i) * 0.15,
        1.5 + (2 - i) * 0.2,
        0.6,
        12,
      );
      const stripe = new Mesh(stripeGeo, stripeMat);
      stripe.position.set(0, 3 + i * 2.5, 0);
      this.lighthouseGroup.add(stripe);
    }

    // Lantern room
    const lanternMat = new MeshStandardMaterial({
      color: 0xffcc44,
      emissive: 0xffaa22,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.7,
    });
    const lanternGeo = new CylinderGeometry(1.8, 1.8, 1.5, 8);
    this.lanternMesh = new Mesh(lanternGeo, lanternMat);
    this.lanternMesh.position.set(0, LIGHTHOUSE_HEIGHT + 0.75, 0);
    this.lighthouseGroup.add(this.lanternMesh);

    // Lantern cap
    const capMat = new MeshStandardMaterial({ color: 0x222222 });
    const capGeo = new ConeGeometry(2.0, 1.5, 8);
    const capMesh = new Mesh(capGeo, capMat);
    capMesh.position.set(0, LIGHTHOUSE_HEIGHT + 2.25, 0);
    this.lighthouseGroup.add(capMesh);

    // Lantern light
    this.lanternLight = new PointLight(0xffaa22, 3, 30);
    this.lanternLight.position.set(0, LIGHTHOUSE_HEIGHT + 0.75, 0);
    this.lighthouseGroup.add(this.lanternLight);

    // Railing
    const railMat = new MeshStandardMaterial({ color: 0x444444 });
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const railGeo = new CylinderGeometry(0.05, 0.05, 1.2, 4);
      const railPost = new Mesh(railGeo, railMat);
      railPost.position.set(
        Math.cos(angle) * 2.0,
        LIGHTHOUSE_HEIGHT + 0.1,
        Math.sin(angle) * 2.0,
      );
      this.lighthouseGroup.add(railPost);
    }

    const entity = this.world.createTransformEntity(this.lighthouseGroup);
    entity.object3D!.position.set(0, 0, 0);
  }

  private buildHarbor() {
    const harborGroup = new Group();

    const pierMat = new MeshStandardMaterial({ color: 0x664422, roughness: 0.9 });
    const pierGeo = new BoxGeometry(8, 0.5, 3);
    const pierMesh = new Mesh(pierGeo, pierMat);
    pierMesh.position.set(0, 0.3, 0);
    harborGroup.add(pierMesh);

    const supportMat = new MeshStandardMaterial({ color: 0x553311 });
    for (let x = -3; x <= 3; x += 2) {
      const supportGeo = new CylinderGeometry(0.15, 0.15, 2, 6);
      const support = new Mesh(supportGeo, supportMat);
      support.position.set(x, -0.7, 0);
      harborGroup.add(support);
    }

    const lightColors = [0x00ff44, 0xff2222, 0x00ff44];
    for (let i = 0; i < 3; i++) {
      const lightGeo = new SphereGeometry(0.15, 8, 8);
      const lightMat = new MeshBasicMaterial({ color: lightColors[i] });
      const lightMesh = new Mesh(lightGeo, lightMat);
      lightMesh.position.set(-3 + i * 3, 1, 1.5);
      harborGroup.add(lightMesh);

      const pl = new PointLight(lightColors[i], 1, 8);
      pl.position.copy(lightMesh.position);
      harborGroup.add(pl);
      this.harborLights.push(pl);
    }

    const entity = this.world.createTransformEntity(harborGroup);
    entity.object3D!.position.copy(HARBOR_POS);
  }

  private buildRocks() {
    const rockMat = new MeshStandardMaterial({ color: 0x2a2a2a, roughness: 1.0 });
    const foamMat = new MeshBasicMaterial({
      color: 0x88cccc,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });

    const rockPositions = [
      new Vector3(-15, -0.5, -20),
      new Vector3(-25, -0.3, -10),
      new Vector3(20, -0.4, -25),
      new Vector3(-10, -0.6, -35),
      new Vector3(30, -0.3, -15),
      new Vector3(-30, -0.4, -30),
      new Vector3(15, -0.5, -40),
      new Vector3(-20, -0.3, -45),
      new Vector3(25, -0.5, -35),
      new Vector3(-35, -0.6, -20),
      new Vector3(35, -0.4, -40),
      new Vector3(5, -0.3, -50),
    ];

    for (const pos of rockPositions) {
      const rockGroup = new Group();
      const mainSize = 1 + Math.random() * 1.5;
      const mainGeo = new SphereGeometry(mainSize, 6, 5);
      const mainRock = new Mesh(mainGeo, rockMat);
      mainRock.scale.set(1, 0.5 + Math.random() * 0.3, 1);
      rockGroup.add(mainRock);

      for (let j = 0; j < 2; j++) {
        const smallSize = 0.5 + Math.random() * 0.8;
        const smallGeo = new SphereGeometry(smallSize, 5, 4);
        const smallRock = new Mesh(smallGeo, rockMat);
        smallRock.position.set(
          (Math.random() - 0.5) * 2,
          0,
          (Math.random() - 0.5) * 2,
        );
        smallRock.scale.set(1, 0.4 + Math.random() * 0.3, 1);
        rockGroup.add(smallRock);
      }

      // Foam ring around rocks as warning
      const foamGeo = new RingGeometry(mainSize + 0.5, mainSize + 2.0, 16);
      foamGeo.rotateX(-Math.PI / 2);
      const foamMesh = new Mesh(foamGeo, foamMat.clone());
      foamMesh.position.set(0, 0.05, 0);
      rockGroup.add(foamMesh);
      this.foamMeshes.push(foamMesh);

      const entity = this.world.createTransformEntity(rockGroup);
      entity.object3D!.position.copy(pos);
      this.rockPositions.push(pos.clone());
    }
  }

  private buildStarfield() {
    const positions = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.4;
      const r = 150 + Math.random() * 50;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      sizes[i] = 0.5 + Math.random() * 1.5;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('size', new BufferAttribute(sizes, 1));
    const mat = new PointsMaterial({
      color: 0xffffff,
      size: 0.8,
      transparent: true,
      opacity: 0.8,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.starPoints = new Points(geo, mat);
    this.world.createTransformEntity(this.starPoints);
  }

  private buildLighting() {
    const ambient = new AmbientLight(0x112244, 0.3);
    this.world.createTransformEntity(ambient);

    // Lightning flash light (starts invisible)
    this.lightningFlash = new AmbientLight(0xccddff, 0);
    this.world.createTransformEntity(this.lightningFlash);
  }

  private buildMoon() {
    const moonGroup = new Group();

    // Moon disc
    const moonMat = new MeshBasicMaterial({
      color: 0xeeeedd,
      transparent: true,
      opacity: 0.9,
    });
    const moonGeo = new SphereGeometry(5, 16, 16);
    this.moonMesh = new Mesh(moonGeo, moonMat);
    moonGroup.add(this.moonMesh);

    // Moon glow
    const glowMat = new MeshBasicMaterial({
      color: 0xaabbcc,
      transparent: true,
      opacity: 0.15,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const glowGeo = new SphereGeometry(8, 16, 16);
    const glowMesh = new Mesh(glowGeo, glowMat);
    moonGroup.add(glowMesh);

    const entity = this.world.createTransformEntity(moonGroup);
    entity.object3D!.position.set(80, 100, -120);
  }

  private buildClouds() {
    const cloudMat = new MeshBasicMaterial({
      color: 0x223344,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });

    const cloudPositions = [
      new Vector3(-40, 60, -80),
      new Vector3(30, 65, -90),
      new Vector3(-60, 55, -70),
      new Vector3(50, 70, -100),
      new Vector3(0, 62, -85),
    ];

    for (const pos of cloudPositions) {
      const cloudGroup = new Group();
      const numBlobs = 3 + Math.floor(Math.random() * 3);
      for (let b = 0; b < numBlobs; b++) {
        const blobGeo = new SphereGeometry(
          4 + Math.random() * 6,
          8,
          6,
        );
        const blob = new Mesh(blobGeo, cloudMat);
        blob.position.set(
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 4,
        );
        blob.scale.set(1, 0.4, 0.8);
        cloudGroup.add(blob);
      }
      const entity = this.world.createTransformEntity(cloudGroup);
      entity.object3D!.position.copy(pos);
      this.cloudMeshes.push(cloudGroup as unknown as Mesh);
    }
  }

  private buildRainSystem() {
    this.rainPositions = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i++) {
      this.rainPositions[i * 3] = (Math.random() - 0.5) * 100;
      this.rainPositions[i * 3 + 1] = Math.random() * 50 + 10;
      this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 100;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(this.rainPositions, 3));
    const mat = new PointsMaterial({
      color: 0x8899bb,
      size: 0.15,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.rainPoints = new Points(geo, mat);
    this.world.createTransformEntity(this.rainPoints);
  }

  private buildBuoys() {
    const buoyPositions = [
      new Vector3(-10, 0, -15),
      new Vector3(15, 0, -18),
      new Vector3(-5, 0, -30),
      new Vector3(22, 0, -10),
      new Vector3(-18, 0, -8),
      new Vector3(5, 0, -22),
    ];

    const buoyBodyMat = new MeshStandardMaterial({ color: 0xff4422, roughness: 0.6 });
    const buoyBandMat = new MeshStandardMaterial({ color: 0xffcc00 });

    for (const pos of buoyPositions) {
      const buoyGroup = new Group();

      // Buoy body
      const bodyGeo = new CylinderGeometry(0.3, 0.4, 1.0, 8);
      const body = new Mesh(bodyGeo, buoyBodyMat);
      body.position.set(0, 0.5, 0);
      buoyGroup.add(body);

      // Yellow band
      const bandGeo = new CylinderGeometry(0.35, 0.35, 0.2, 8);
      const band = new Mesh(bandGeo, buoyBandMat);
      band.position.set(0, 0.7, 0);
      buoyGroup.add(band);

      // Top light
      const topGeo = new SphereGeometry(0.12, 6, 6);
      const topMat = new MeshBasicMaterial({ color: 0xffff00 });
      const top = new Mesh(topGeo, topMat);
      top.position.set(0, 1.1, 0);
      buoyGroup.add(top);

      const buoyLight = new PointLight(0xffff00, 0.5, 10);
      buoyLight.position.set(0, 1.1, 0);
      buoyGroup.add(buoyLight);
      this.buoyLights.push(buoyLight);

      const entity = this.world.createTransformEntity(buoyGroup);
      entity.object3D!.position.copy(pos);
      this.buoyGroups.push(buoyGroup);
    }
  }

  setFogDensity(density: number) {
    this.targetFogDensity = density;
  }

  setSkyColor(r: number, g: number, b: number) {
    this.targetSkyColor.setRGB(r, g, b);
  }

  setRainActive(active: boolean) {
    this.rainActive = active;
  }

  setWindStrength(strength: number) {
    this.targetWindStrength = strength;
  }

  triggerLightning() {
    this.lightningActive = true;
    this.lightningTimer = 0.15 + Math.random() * 0.1;
    this.lightningFlash.intensity = 3 + Math.random() * 2;
  }

  toggleBuoys() {
    this.buoysVisible = !this.buoysVisible;
    for (const group of this.buoyGroups) {
      group.visible = this.buoysVisible;
    }
  }

  areBuoysVisible(): boolean {
    return this.buoysVisible;
  }

  getWindStrength(): number {
    return this.windStrength;
  }

  update(delta: number, time: number) {
    // Animate ocean shader
    const mat = this.oceanMesh.material as ShaderMaterial;
    mat.uniforms.uTime.value = time;

    // Wind strength interpolation
    this.windStrength += (this.targetWindStrength - this.windStrength) * delta * 2;
    mat.uniforms.uWindStrength.value = this.windStrength;

    // Animate fog
    if (this.world.scene.fog instanceof FogExp2) {
      const fog = this.world.scene.fog;
      fog.density += (this.targetFogDensity - fog.density) * delta * 2;
    }

    // Pulse harbor lights
    for (const light of this.harborLights) {
      light.intensity = 0.8 + Math.sin(time * 2) * 0.4;
    }

    // Pulse and rotate lantern
    this.lanternLight.intensity = 2.5 + Math.sin(time * 3) * 0.5;
    this.lanternMesh.rotation.y = time * 0.5;

    // Twinkle stars
    const starMat = this.starPoints.material as PointsMaterial;
    starMat.opacity = 0.6 + Math.sin(time * 0.5) * 0.2;

    // Animate rock foam
    for (const foam of this.foamMeshes) {
      const fMat = foam.material as MeshBasicMaterial;
      fMat.opacity = 0.15 + Math.sin(time * 1.5 + foam.id * 0.7) * 0.1;
      foam.scale.setScalar(1.0 + Math.sin(time * 0.8 + foam.id) * 0.1);
    }

    // Rain animation
    const rainMat = this.rainPoints.material as PointsMaterial;
    if (this.rainActive) {
      rainMat.opacity = Math.min(rainMat.opacity + delta * 2, 0.5);
      const posArr = this.rainPositions;
      for (let i = 0; i < RAIN_COUNT; i++) {
        posArr[i * 3 + 1] -= delta * 30;
        posArr[i * 3] += this.windStrength * delta * 5;
        if (posArr[i * 3 + 1] < -1) {
          posArr[i * 3] = (Math.random() - 0.5) * 100;
          posArr[i * 3 + 1] = 40 + Math.random() * 20;
          posArr[i * 3 + 2] = (Math.random() - 0.5) * 100;
        }
      }
      (this.rainPoints.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    } else {
      rainMat.opacity = Math.max(rainMat.opacity - delta, 0);
    }

    // Lightning decay
    if (this.lightningActive) {
      this.lightningTimer -= delta;
      if (this.lightningTimer <= 0) {
        this.lightningActive = false;
        this.lightningFlash.intensity = 0;
      }
    }

    // Sky color lerp
    this.currentSkyColor.lerp(this.targetSkyColor, delta * 1.5);
    if (this.world.scene.fog instanceof FogExp2) {
      this.world.scene.fog.color.copy(this.currentSkyColor);
    }

    // Buoy bobbing and flashing
    for (let i = 0; i < this.buoyGroups.length; i++) {
      const group = this.buoyGroups[i];
      group.position.y = Math.sin(time * 1.2 + i * 1.5) * 0.3;
      this.buoyLights[i].intensity = 0.3 + Math.abs(Math.sin(time * 2 + i * 0.8)) * 0.7;
    }

    // Slow cloud drift
    for (const cloud of this.cloudMeshes) {
      cloud.position.x += delta * 0.5;
      if (cloud.position.x > 100) cloud.position.x = -100;
    }
  }
}
