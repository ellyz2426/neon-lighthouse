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
const CURRENT_ARROW_COUNT = 10;
const SONAR_MAX_RADIUS = 60;
const SHOOTING_STAR_INTERVAL_MIN = 12;
const SHOOTING_STAR_INTERVAL_MAX = 35;
const BEAM_DUST_COUNT = 60;

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

  // Horizon glow
  private horizonGlowMesh!: Mesh;

  // Day/night cycle
  private dayPhase = 0; // 0=midnight, 0.25=dawn, 0.5=noon, 0.75=dusk
  private targetDayPhase = 0;
  private ambientLightRef!: AmbientLight;
  private dayLerpColor = new Color();

  // Aurora borealis
  private auroraMesh!: Mesh;
  private auroraActive = false;

  // Ocean currents
  private currentDirAngle = 0;
  private currentStrength = 0;
  private targetCurrentStrength = 0;
  private currentArrows: Mesh[] = [];
  private currentArrowEntities: { obj: ReturnType<EnvironmentSystem['world']['createTransformEntity']> }[] = [];

  // Sonar ring
  private sonarRing!: Mesh;
  private sonarActive = false;
  private sonarRadius = 0;

  // Fog sonar override
  private fogOverride = false;
  private fogOverrideTimer = 0;
  private savedFogDensity = 0;

  // Shooting stars
  private shootingStarTimer = 8;
  private shootingStarMesh!: Mesh;
  private shootingStarTrail!: Mesh;
  private shootingStarActive = false;
  private shootingStarProgress = 0;
  private shootingStarStart = new Vector3();
  private shootingStarEnd = new Vector3();
  private shootingStarDuration = 0;

  // Beam dust motes
  private beamDustPoints!: Points;
  private beamDustPositions!: Float32Array;
  private beamDustVelocities!: Float32Array;

  // Rock moss meshes (for animated glow)
  private rockMossGlows: Mesh[] = [];

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
    this.buildHorizonGlow();
    this.buildAurora();
    this.buildCurrentArrows();
    this.buildSonarRing();
    this.buildShootingStar();
    this.buildBeamDust();
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
        uCausticIntensity: { value: 0.25 },
        uMoonDir: { value: new Vector3(0.4, 0.5, -0.6).normalize() },
        uSpecularStrength: { value: 0.3 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uWindStrength;
        varying vec2 vUv;
        varying float vElevation;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vec3 pos = position;
          float windWave = sin(pos.x * 0.3 + uTime * 2.0) * uWindStrength * 0.5;
          float wave1 = sin(pos.x * 0.15 + uTime * 0.8) * 0.3;
          float wave2 = sin(pos.z * 0.12 + uTime * 0.6) * 0.25;
          float wave3 = sin((pos.x + pos.z) * 0.08 + uTime * 1.1) * 0.15;
          float wave4 = sin(pos.x * 0.4 + pos.z * 0.3 + uTime * 1.4) * 0.08;
          pos.y += wave1 + wave2 + wave3 + wave4 + windWave;
          vElevation = wave1 + wave2 + wave3 + wave4 + windWave;
          // Compute approximate normal from wave derivatives
          float dx = 0.15*cos(pos.x*0.15+uTime*0.8)*0.3 + 0.08*cos((pos.x+pos.z)*0.08+uTime*1.1)*0.15 + 0.4*cos(pos.x*0.4+pos.z*0.3+uTime*1.4)*0.08;
          float dz = 0.12*cos(pos.z*0.12+uTime*0.6)*0.25 + 0.08*cos((pos.x+pos.z)*0.08+uTime*1.1)*0.15 + 0.3*cos(pos.x*0.4+pos.z*0.3+uTime*1.4)*0.08;
          vNormal = normalize(vec3(-dx, 1.0, -dz));
          vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        uniform vec3 uFoamColor;
        uniform float uTime;
        uniform float uCausticIntensity;
        uniform vec3 uMoonDir;
        uniform float uSpecularStrength;
        varying vec2 vUv;
        varying float vElevation;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        void main() {
          float depth = smoothstep(-0.4, 0.5, vElevation);
          vec3 col = mix(uDeepColor, uShallowColor, depth);
          float foam = smoothstep(0.35, 0.5, vElevation);
          col = mix(col, uFoamColor, foam * 0.15);
          // Caustic light pattern
          vec2 cuv = vUv * 8.0;
          float c1 = sin(cuv.x * 3.0 + uTime * 0.7) * sin(cuv.y * 3.0 + uTime * 0.5);
          float c2 = sin(cuv.x * 5.0 - uTime * 0.4) * sin(cuv.y * 4.0 + uTime * 0.6);
          float caustic = pow(max((c1 + c2) * 0.5 + 0.5, 0.0), 3.0) * uCausticIntensity;
          col += vec3(0.1, 0.3, 0.25) * caustic;
          // Specular highlights from moonlight
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 halfDir = normalize(uMoonDir + viewDir);
          float spec = pow(max(dot(vNormal, halfDir), 0.0), 64.0) * uSpecularStrength;
          col += vec3(0.7, 0.8, 1.0) * spec;
          // Fresnel rim glow
          float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0) * 0.08;
          col += vec3(0.3, 0.5, 0.6) * fresnel;
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

    const baseMat = new MeshStandardMaterial({ color: 0x334455, roughness: 0.8 });
    const baseGeo = new CylinderGeometry(2.5, 3.0, 2, 12);
    const baseMesh = new Mesh(baseGeo, baseMat);
    baseMesh.position.set(0, 1, 0);
    this.lighthouseGroup.add(baseMesh);

    const towerMat = new MeshStandardMaterial({ color: 0xcccccc, roughness: 0.6 });
    const towerGeo = new CylinderGeometry(1.5, 2.2, LIGHTHOUSE_HEIGHT - 2, 12);
    const towerMesh = new Mesh(towerGeo, towerMat);
    towerMesh.position.set(0, (LIGHTHOUSE_HEIGHT - 2) / 2 + 2, 0);
    this.lighthouseGroup.add(towerMesh);

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

    const capMat = new MeshStandardMaterial({ color: 0x222222 });
    const capGeo = new ConeGeometry(2.0, 1.5, 8);
    const capMesh = new Mesh(capGeo, capMat);
    capMesh.position.set(0, LIGHTHOUSE_HEIGHT + 2.25, 0);
    this.lighthouseGroup.add(capMesh);

    this.lanternLight = new PointLight(0xffaa22, 3, 30);
    this.lanternLight.position.set(0, LIGHTHOUSE_HEIGHT + 0.75, 0);
    this.lighthouseGroup.add(this.lanternLight);

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
    const darkRockMat = new MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.95 });
    const mossyMat = new MeshStandardMaterial({
      color: 0x1a3322,
      roughness: 0.9,
      emissive: 0x0a1a10,
      emissiveIntensity: 0.3,
    });
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

    for (let ri = 0; ri < rockPositions.length; ri++) {
      const pos = rockPositions[ri];
      const rockGroup = new Group();
      const mainSize = 1 + Math.random() * 1.5;
      const mainGeo = new SphereGeometry(mainSize, 6, 5);
      const useDark = ri % 3 === 0;
      const mainRock = new Mesh(mainGeo, useDark ? darkRockMat : rockMat);
      mainRock.scale.set(1, 0.5 + Math.random() * 0.3, 1);
      rockGroup.add(mainRock);

      for (let j = 0; j < 2; j++) {
        const smallSize = 0.5 + Math.random() * 0.8;
        const smallGeo = new SphereGeometry(smallSize, 5, 4);
        const smallRock = new Mesh(smallGeo, j % 2 === 0 ? rockMat : darkRockMat);
        smallRock.position.set(
          (Math.random() - 0.5) * 2,
          0,
          (Math.random() - 0.5) * 2,
        );
        smallRock.scale.set(1, 0.4 + Math.random() * 0.3, 1);
        rockGroup.add(smallRock);
      }

      // Mossy/seaweed accent at waterline
      const mossGeo = new SphereGeometry(mainSize * 0.7, 6, 4);
      const mossMesh = new Mesh(mossGeo, mossyMat);
      mossMesh.position.set(
        (Math.random() - 0.5) * 0.5,
        -mainSize * 0.2,
        (Math.random() - 0.5) * 0.5,
      );
      mossMesh.scale.set(1.3, 0.25, 1.3);
      rockGroup.add(mossMesh);
      this.rockMossGlows.push(mossMesh);

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
    const phases = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.4;
      const r = 150 + Math.random() * 50;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      sizes[i] = 0.3 + Math.random() * 2.0;
      phases[i] = Math.random() * Math.PI * 2;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('aSize', new BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new BufferAttribute(phases, 1));
    const mat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBrightness: { value: 1.0 },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        uniform float uTime;
        varying float vBright;
        void main() {
          float speed = 1.0 + aPhase * 0.5;
          float twinkle = sin(uTime * speed + aPhase * 6.28) * 0.5 + 0.5;
          float pulse = sin(uTime * 0.3 + aPhase * 3.14) * 0.3 + 0.7;
          vBright = twinkle * pulse;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (300.0 / -mvPosition.z) * (0.7 + twinkle * 0.3);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uBrightness;
        varying float vBright;
        void main() {
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          float glow = 1.0 - smoothstep(0.0, 0.5, dist);
          float alpha = glow * vBright * uBrightness * 0.9;
          vec3 warmWhite = mix(vec3(0.8, 0.85, 1.0), vec3(1.0, 0.95, 0.8), vBright);
          gl_FragColor = vec4(warmWhite, alpha);
        }
      `,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.starPoints = new Points(geo, mat);
    this.world.createTransformEntity(this.starPoints);
  }

  private buildLighting() {
    const ambient = new AmbientLight(0x112244, 0.3);
    this.ambientLightRef = ambient;
    this.world.createTransformEntity(ambient);

    this.lightningFlash = new AmbientLight(0xccddff, 0);
    this.world.createTransformEntity(this.lightningFlash);
  }

  private buildMoon() {
    const moonGroup = new Group();

    const moonMat = new MeshBasicMaterial({
      color: 0xeeeedd,
      transparent: true,
      opacity: 0.9,
    });
    const moonGeo = new SphereGeometry(5, 16, 16);
    this.moonMesh = new Mesh(moonGeo, moonMat);
    moonGroup.add(this.moonMesh);

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
        const blobGeo = new SphereGeometry(4 + Math.random() * 6, 8, 6);
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

      const bodyGeo = new CylinderGeometry(0.3, 0.4, 1.0, 8);
      const body = new Mesh(bodyGeo, buoyBodyMat);
      body.position.set(0, 0.5, 0);
      buoyGroup.add(body);

      const bandGeo = new CylinderGeometry(0.35, 0.35, 0.2, 8);
      const band = new Mesh(bandGeo, buoyBandMat);
      band.position.set(0, 0.7, 0);
      buoyGroup.add(band);

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

  private buildHorizonGlow() {
    const glowGeo = new CylinderGeometry(95, 95, 3, 32, 1, true);
    const glowMat = new MeshBasicMaterial({
      color: 0xff8833,
      transparent: true,
      opacity: 0.04,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    this.horizonGlowMesh = new Mesh(glowGeo, glowMat);
    const entity = this.world.createTransformEntity(this.horizonGlowMesh);
    entity.object3D!.position.set(0, 0.5, 0);
  }

  private buildAurora() {
    const segments = 64;
    const geo = new PlaneGeometry(140, 10, segments, 2);
    const mat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
      },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 pos = position;
          pos.y += sin(pos.x * 0.04 + uTime * 0.3) * 6.0;
          pos.y += sin(pos.x * 0.07 + uTime * 0.5) * 3.0;
          pos.z += cos(pos.x * 0.03 + uTime * 0.2) * 3.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          float wave = sin(vUv.x * 6.28 + uTime * 0.4) * 0.5 + 0.5;
          vec3 green = vec3(0.1, 0.9, 0.4);
          vec3 cyan = vec3(0.1, 0.6, 0.9);
          vec3 purple = vec3(0.5, 0.2, 0.8);
          vec3 col = mix(green, cyan, wave);
          col = mix(col, purple, sin(vUv.x * 3.14 + uTime * 0.2) * 0.5 + 0.5);
          float edge = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
          float shimmer = 0.6 + 0.4 * sin(vUv.x * 25.0 + uTime * 2.0);
          float curtain = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
          gl_FragColor = vec4(col, edge * shimmer * curtain * uOpacity * 0.35);
        }
      `,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    this.auroraMesh = new Mesh(geo, mat);
    const entity = this.world.createTransformEntity(this.auroraMesh);
    entity.object3D!.position.set(0, 85, -70);
    entity.object3D!.rotation.x = -0.15;
    this.auroraMesh.visible = false;
  }

  private buildCurrentArrows() {
    const arrowMat = new MeshBasicMaterial({
      color: 0x44ddcc,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });

    for (let i = 0; i < CURRENT_ARROW_COUNT; i++) {
      const arrowGeo = new ConeGeometry(0.4, 1.8, 4);
      arrowGeo.rotateX(-Math.PI / 2);
      const arrow = new Mesh(arrowGeo, arrowMat.clone());
      const angle = (i / CURRENT_ARROW_COUNT) * Math.PI * 2;
      const radius = 12 + (i % 3) * 10;
      const entity = this.world.createTransformEntity(arrow);
      entity.object3D!.position.set(
        Math.cos(angle) * radius,
        0.15,
        Math.sin(angle) * radius,
      );
      this.currentArrows.push(arrow);
      this.currentArrowEntities.push({ obj: entity });
    }
  }

  private buildSonarRing() {
    const geo = new RingGeometry(0.8, 1.2, 32);
    geo.rotateX(-Math.PI / 2);
    const mat = new MeshBasicMaterial({
      color: 0x44ffaa,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    this.sonarRing = new Mesh(geo, mat);
    const entity = this.world.createTransformEntity(this.sonarRing);
    entity.object3D!.position.set(0, 0.3, 0);
  }

  private buildShootingStar() {
    // Bright head
    const headGeo = new SphereGeometry(0.5, 8, 8);
    const headMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.shootingStarMesh = new Mesh(headGeo, headMat);
    this.world.createTransformEntity(this.shootingStarMesh);

    // Trail
    const trailGeo = new CylinderGeometry(0.05, 0.3, 6, 4);
    trailGeo.translate(0, 3, 0);
    const trailMat = new MeshBasicMaterial({
      color: 0xaaccff,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.shootingStarTrail = new Mesh(trailGeo, trailMat);
    this.world.createTransformEntity(this.shootingStarTrail);
  }

  private buildBeamDust() {
    this.beamDustPositions = new Float32Array(BEAM_DUST_COUNT * 3);
    this.beamDustVelocities = new Float32Array(BEAM_DUST_COUNT * 3);
    for (let i = 0; i < BEAM_DUST_COUNT; i++) {
      this.beamDustPositions[i * 3] = 0;
      this.beamDustPositions[i * 3 + 1] = -100; // hidden below
      this.beamDustPositions[i * 3 + 2] = 0;
      this.beamDustVelocities[i * 3] = (Math.random() - 0.5) * 0.3;
      this.beamDustVelocities[i * 3 + 1] = (Math.random() - 0.5) * 0.1;
      this.beamDustVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.beamDustPositions, 3));
    const mat = new PointsMaterial({
      color: 0xffddaa,
      size: 0.15,
      transparent: true,
      opacity: 0.25,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.beamDustPoints = new Points(geo, mat);
    this.world.createTransformEntity(this.beamDustPoints);
  }

  // --- Setters ---

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

  // Day/night
  setDayPhase(phase: number) {
    this.targetDayPhase = Math.max(0, Math.min(1, phase));
  }

  getDayPhase(): number {
    return this.dayPhase;
  }

  // Aurora
  setAuroraActive(active: boolean) {
    this.auroraActive = active;
    this.auroraMesh.visible = active;
  }

  // Currents
  setCurrentStrength(strength: number) {
    this.targetCurrentStrength = strength;
  }

  setCurrentDirection(angle: number) {
    this.currentDirAngle = angle;
  }

  getCurrentDirAngle(): number {
    return this.currentDirAngle;
  }

  getCurrentStrength(): number {
    return this.currentStrength;
  }

  // Sonar
  triggerSonar() {
    this.sonarActive = true;
    this.sonarRadius = 0;
    // Temporarily reduce fog
    this.fogOverride = true;
    this.fogOverrideTimer = 3.0;
    this.savedFogDensity = this.targetFogDensity;
  }

  getSonarRadius(): number {
    return this.sonarActive ? this.sonarRadius : 0;
  }

  isSonarActive(): boolean {
    return this.sonarActive;
  }

  // Beam dust: update positions based on beam direction from LighthouseSystem
  updateBeamDust(beamOrigin: Vector3, beamDir: Vector3, beamActive: boolean, delta: number) {
    const mat = this.beamDustPoints.material as PointsMaterial;
    if (!beamActive) {
      mat.opacity = Math.max(0, mat.opacity - delta * 2);
      return;
    }
    mat.opacity = Math.min(0.25, mat.opacity + delta);
    for (let i = 0; i < BEAM_DUST_COUNT; i++) {
      const idx = i * 3;
      // Drift particles
      this.beamDustPositions[idx] += this.beamDustVelocities[idx] * delta;
      this.beamDustPositions[idx + 1] += this.beamDustVelocities[idx + 1] * delta;
      this.beamDustPositions[idx + 2] += this.beamDustVelocities[idx + 2] * delta;

      // Check if particle is too far from beam axis — respawn
      const px = this.beamDustPositions[idx] - beamOrigin.x;
      const py = this.beamDustPositions[idx + 1] - beamOrigin.y;
      const pz = this.beamDustPositions[idx + 2] - beamOrigin.z;
      const dot = px * beamDir.x + py * beamDir.y + pz * beamDir.z;

      if (dot < 0 || dot > 50 || this.beamDustPositions[idx + 1] < -5) {
        // Respawn along beam
        const t = 3 + Math.random() * 45;
        const spread = 1.5 + (t / 50) * 3;
        this.beamDustPositions[idx] = beamOrigin.x + beamDir.x * t + (Math.random() - 0.5) * spread;
        this.beamDustPositions[idx + 1] = beamOrigin.y + beamDir.y * t + (Math.random() - 0.5) * spread;
        this.beamDustPositions[idx + 2] = beamOrigin.z + beamDir.z * t + (Math.random() - 0.5) * spread;
        this.beamDustVelocities[idx] = (Math.random() - 0.5) * 0.3;
        this.beamDustVelocities[idx + 1] = (Math.random() - 0.5) * 0.1;
        this.beamDustVelocities[idx + 2] = (Math.random() - 0.5) * 0.3;
      }
    }
    (this.beamDustPoints.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  update(delta: number, time: number) {
    // Animate ocean shader
    const mat = this.oceanMesh.material as ShaderMaterial;
    mat.uniforms.uTime.value = time;

    // Wind strength interpolation
    this.windStrength += (this.targetWindStrength - this.windStrength) * delta * 2;
    mat.uniforms.uWindStrength.value = this.windStrength;

    // Day/night cycle interpolation
    this.dayPhase += (this.targetDayPhase - this.dayPhase) * delta * 0.8;
    this.updateDayNight(time);

    // Animate fog
    if (this.world.scene.fog instanceof FogExp2) {
      const fog = this.world.scene.fog;
      let targetDensity = this.targetFogDensity;
      // Fog sonar override
      if (this.fogOverride) {
        targetDensity = this.savedFogDensity * 0.2;
        this.fogOverrideTimer -= delta;
        if (this.fogOverrideTimer <= 0) {
          this.fogOverride = false;
        }
      }
      fog.density += (targetDensity - fog.density) * delta * 3;
    }

    // Pulse harbor lights
    for (const light of this.harborLights) {
      light.intensity = 0.8 + Math.sin(time * 2) * 0.4;
    }

    // Pulse and rotate lantern
    this.lanternLight.intensity = 2.5 + Math.sin(time * 3) * 0.5;
    this.lanternMesh.rotation.y = time * 0.5;

    // Animate stars — update shader uniforms
    const starMat = this.starPoints.material as ShaderMaterial;
    starMat.uniforms.uTime.value = time;
    // Stars dimmer during day
    const nightFactor = 1 - Math.max(0, Math.sin(this.dayPhase * Math.PI));
    starMat.uniforms.uBrightness.value = 0.2 + nightFactor * 0.8;

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

    // Horizon glow pulse
    const horizonMat = this.horizonGlowMesh.material as MeshBasicMaterial;
    horizonMat.opacity = 0.025 + Math.sin(time * 0.3) * 0.015;

    // Aurora animation
    if (this.auroraActive) {
      const auroraMat = this.auroraMesh.material as ShaderMaterial;
      auroraMat.uniforms.uTime.value = time;
      const targetOpacity = this.auroraActive ? 1.0 : 0;
      auroraMat.uniforms.uOpacity.value += (targetOpacity - auroraMat.uniforms.uOpacity.value) * delta * 2;
    }

    // Current arrows
    this.currentStrength += (this.targetCurrentStrength - this.currentStrength) * delta * 2;
    if (this.currentStrength > 0.01) {
      for (let i = 0; i < this.currentArrows.length; i++) {
        const arrow = this.currentArrows[i];
        const aMat = arrow.material as MeshBasicMaterial;
        // Pulse opacity
        const phase = (time * 1.5 + i * 0.6) % (Math.PI * 2);
        aMat.opacity = this.currentStrength * (0.1 + Math.sin(phase) * 0.08);
        // Point arrow in current direction and bob gently
        const ent = this.currentArrowEntities[i].obj;
        ent.object3D!.rotation.y = this.currentDirAngle;
        ent.object3D!.position.y = 0.15 + Math.sin(time + i * 2) * 0.1;
      }
    } else {
      for (const arrow of this.currentArrows) {
        (arrow.material as MeshBasicMaterial).opacity = 0;
      }
    }

    // Sonar ring expansion
    if (this.sonarActive) {
      this.sonarRadius += delta * 45;
      const scale = Math.max(this.sonarRadius, 0.1);
      this.sonarRing.scale.set(scale, 1, scale);
      const sonarMat = this.sonarRing.material as MeshBasicMaterial;
      sonarMat.opacity = Math.max(0, 0.5 * (1 - this.sonarRadius / SONAR_MAX_RADIUS));
      if (this.sonarRadius >= SONAR_MAX_RADIUS) {
        this.sonarActive = false;
        sonarMat.opacity = 0;
      }
    }

    // Shooting star animation
    if (!this.shootingStarActive) {
      this.shootingStarTimer -= delta;
      if (this.shootingStarTimer <= 0) {
        this.startShootingStar();
      }
    } else {
      this.shootingStarProgress += delta / this.shootingStarDuration;
      if (this.shootingStarProgress >= 1) {
        this.shootingStarActive = false;
        (this.shootingStarMesh.material as MeshBasicMaterial).opacity = 0;
        (this.shootingStarTrail.material as MeshBasicMaterial).opacity = 0;
        this.shootingStarTimer = SHOOTING_STAR_INTERVAL_MIN +
          Math.random() * (SHOOTING_STAR_INTERVAL_MAX - SHOOTING_STAR_INTERVAL_MIN);
      } else {
        const t = this.shootingStarProgress;
        const fadeIn = Math.min(t * 5, 1);
        const fadeOut = Math.max(0, 1 - (t - 0.7) / 0.3);
        const alpha = fadeIn * fadeOut;
        const cx = this.shootingStarStart.x + (this.shootingStarEnd.x - this.shootingStarStart.x) * t;
        const cy = this.shootingStarStart.y + (this.shootingStarEnd.y - this.shootingStarStart.y) * t;
        const cz = this.shootingStarStart.z + (this.shootingStarEnd.z - this.shootingStarStart.z) * t;
        this.shootingStarMesh.position.set(cx, cy, cz);
        (this.shootingStarMesh.material as MeshBasicMaterial).opacity = alpha * 0.9;

        // Trail follows slightly behind
        const tt = Math.max(0, t - 0.05);
        const tx = this.shootingStarStart.x + (this.shootingStarEnd.x - this.shootingStarStart.x) * tt;
        const ty = this.shootingStarStart.y + (this.shootingStarEnd.y - this.shootingStarStart.y) * tt;
        const tz = this.shootingStarStart.z + (this.shootingStarEnd.z - this.shootingStarStart.z) * tt;
        this.shootingStarTrail.position.set(tx, ty, tz);
        this.shootingStarTrail.lookAt(cx, cy, cz);
        this.shootingStarTrail.rotateX(Math.PI / 2);
        (this.shootingStarTrail.material as MeshBasicMaterial).opacity = alpha * 0.5;
      }
    }

    // Rock moss glow pulse
    for (let m = 0; m < this.rockMossGlows.length; m++) {
      const moss = this.rockMossGlows[m];
      const mossMat = moss.material as MeshStandardMaterial;
      mossMat.emissiveIntensity = 0.2 + Math.sin(time * 0.6 + m * 1.3) * 0.15;
    }

    // Specular strength from day phase (more at night when moon is visible)
    const nightSpecular = 0.3 * (1 - Math.max(0, Math.sin(this.dayPhase * Math.PI)));
    (this.oceanMesh.material as ShaderMaterial).uniforms.uSpecularStrength.value = nightSpecular;

    // Caustic intensity — brighter during day, dimmer at night in storms
    const causticTarget = 0.15 + (1 - this.windStrength * 0.5) * 0.2;
    const cMat = this.oceanMesh.material as ShaderMaterial;
    const curr = cMat.uniforms.uCausticIntensity.value as number;
    cMat.uniforms.uCausticIntensity.value = curr + (causticTarget - curr) * delta * 2;
  }

  private startShootingStar() {
    this.shootingStarActive = true;
    this.shootingStarProgress = 0;
    this.shootingStarDuration = 0.6 + Math.random() * 0.8;
    // Start from a random high point in the sky dome
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.25 + 0.1;
    const r = 130;
    this.shootingStarStart.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta),
    );
    // End: lower in the sky, offset in a direction
    const endTheta = theta + (Math.random() - 0.5) * 0.8;
    const endPhi = phi + 0.2 + Math.random() * 0.15;
    this.shootingStarEnd.set(
      r * Math.sin(endPhi) * Math.cos(endTheta),
      r * Math.cos(endPhi),
      r * Math.sin(endPhi) * Math.sin(endTheta),
    );
  }

  private updateDayNight(time: number) {
    // Day phase: 0=midnight, 0.25=dawn, 0.5=noon, 0.75=dusk
    const dayBrightness = Math.max(0, Math.sin(this.dayPhase * Math.PI));

    // Ambient light intensity
    const nightAmbient = 0.15;
    const dayAmbient = 0.6;
    this.ambientLightRef.intensity = nightAmbient + dayBrightness * (dayAmbient - nightAmbient);

    // Ambient light color shifts: night=blue-ish, day=warm-ish
    this.dayLerpColor.setRGB(
      0.07 + dayBrightness * 0.4,
      0.08 + dayBrightness * 0.35,
      0.17 + dayBrightness * 0.1,
    );
    this.ambientLightRef.color.copy(this.dayLerpColor);

    // Moon brightness — visible at night, faded during day
    if (this.moonMesh) {
      const moonMat = this.moonMesh.material as MeshBasicMaterial;
      moonMat.opacity = 0.9 * (1 - dayBrightness * 0.8);
    }
  }
}
