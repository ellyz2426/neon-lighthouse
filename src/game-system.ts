import { createSystem, UIKitMLAsset, InputComponent } from '@iwsdk/core';
import { ShipSystem } from './ship-system.js';
import { LighthouseSystem } from './lighthouse-system.js';
import { AudioSystem } from './audio-system.js';
import { EnvironmentSystem } from './environment-system.js';

type GameState = 'menu' | 'tutorial' | 'settings' | 'playing' | 'wave-complete' | 'game-over';

interface WaveConfig {
  shipCount: number;
  spawnInterval: number;
  shipSpeed: number;
  fogDensity: number;
  stormChance: number;
  hasRain: boolean;
  windStrength: number;
  skyShift: [number, number, number];
  emergencyChance: number;
  treasureChance: number;
  currentStrength: number;
  currentAngle: number;
  dayPhase: number;
  hasAurora: boolean;
}

export class GameSystem extends createSystem({}) {
  private state: GameState = 'menu';
  private wave = 0;
  private score = 0;
  private lives = 3;
  private highScore = 0;
  private bestWave = 0;
  private totalShipsSaved = 0;
  private waveShipsSaved = 0;
  private waveShipsLost = 0;
  private waveShipTotal = 0;
  private fogHornTimer = 0;
  private lightningTimer = 0;
  private waveHasStorm = false;
  private waveStartTimer = 0;
  private showingWaveStart = false;

  // Special event timers
  private emergencyTimer = 0;
  private treasureTimer = 0;
  private emergencyChance = 0;
  private treasureChance = 0;
  private emergencySpawned = false;
  private treasureSpawned = false;

  // Fog sonar mechanic
  private sonarCooldown = 0;
  private sonarReady = true;
  private sonarCooldownMax = 12;
  private lastSonarRadius = 0;

  private shipSystem!: ShipSystem;
  private lighthouseSystem!: LighthouseSystem;
  private audioSystem!: AudioSystem;
  private envSystem!: EnvironmentSystem;

  // Panels
  private menuPanel: UIKitMLAsset | undefined = undefined;
  private hudPanel: UIKitMLAsset | undefined = undefined;
  private waveCompletePanel: UIKitMLAsset | undefined = undefined;
  private gameOverPanel: UIKitMLAsset | undefined = undefined;
  private settingsPanel: UIKitMLAsset | undefined = undefined;
  private tutorialPanel: UIKitMLAsset | undefined = undefined;
  private compassPanel: UIKitMLAsset | undefined = undefined;

  init() {
    this.shipSystem = this.world.getSystem(ShipSystem)!;
    this.lighthouseSystem = this.world.getSystem(LighthouseSystem)!;
    this.audioSystem = this.world.getSystem(AudioSystem)!;
    this.envSystem = this.world.getSystem(EnvironmentSystem)!;

    this.highScore = parseInt(localStorage.getItem('neon-lighthouse-high-score') || '0', 10);
    this.bestWave = parseInt(localStorage.getItem('neon-lighthouse-best-wave') || '0', 10);

    this.menuPanel = this.world.getSceneObject<UIKitMLAsset>('menu-panel-node');
    this.hudPanel = this.world.getSceneObject<UIKitMLAsset>('hud-panel-node');
    this.waveCompletePanel = this.world.getSceneObject<UIKitMLAsset>('wave-complete-panel-node');
    this.gameOverPanel = this.world.getSceneObject<UIKitMLAsset>('game-over-panel-node');
    this.settingsPanel = this.world.getSceneObject<UIKitMLAsset>('settings-panel-node');
    this.tutorialPanel = this.world.getSceneObject<UIKitMLAsset>('tutorial-panel-node');
    this.compassPanel = this.world.getSceneObject<UIKitMLAsset>('compass-panel-node');

    this.setupPanelButtons();
    this.setupSonarInput();
    this.showState('menu');
  }

  private setupPanelButtons() {
    // Menu buttons
    this.menuPanel?.getElementById('btn-play')?.addEventListener('click', () => {
      this.audioSystem.playUIClick();
      this.startGame();
    });
    this.menuPanel?.getElementById('btn-tutorial')?.addEventListener('click', () => {
      this.audioSystem.playUIClick();
      this.showState('tutorial');
    });
    this.menuPanel?.getElementById('btn-settings')?.addEventListener('click', () => {
      this.audioSystem.playUIClick();
      this.showState('settings');
    });

    // Tutorial
    this.tutorialPanel?.getElementById('btn-got-it')?.addEventListener('click', () => {
      this.audioSystem.playUIClick();
      this.showState('menu');
    });

    // Settings
    this.settingsPanel?.getElementById('btn-sensitivity')?.addEventListener('click', () => {
      this.audioSystem.playUIClick();
    });
    this.settingsPanel?.getElementById('btn-volume')?.addEventListener('click', () => {
      this.audioSystem.toggleVolume();
      this.audioSystem.playUIClick();
      this.settingsPanel?.getElementById('volume-val')?.setProperties({
        text: this.audioSystem.isVolumeOn() ? 'ON' : 'OFF',
      });
    });
    this.settingsPanel?.getElementById('btn-buoys')?.addEventListener('click', () => {
      this.envSystem.toggleBuoys();
      this.audioSystem.playUIClick();
      this.settingsPanel?.getElementById('buoy-val')?.setProperties({
        text: this.envSystem.areBuoysVisible() ? 'ON' : 'OFF',
      });
    });
    this.settingsPanel?.getElementById('btn-back')?.addEventListener('click', () => {
      this.audioSystem.playUIClick();
      this.showState('menu');
    });

    // Wave complete
    this.waveCompletePanel?.getElementById('btn-next-wave')?.addEventListener('click', () => {
      this.audioSystem.playUIClick();
      this.startWave();
    });
    this.waveCompletePanel?.getElementById('btn-upgrade-range')?.addEventListener('click', () => {
      this.tryUpgrade('range');
    });
    this.waveCompletePanel?.getElementById('btn-upgrade-width')?.addEventListener('click', () => {
      this.tryUpgrade('width');
    });
    this.waveCompletePanel?.getElementById('btn-upgrade-energy')?.addEventListener('click', () => {
      this.tryUpgrade('energy');
    });

    // Game over
    this.gameOverPanel?.getElementById('btn-play-again')?.addEventListener('click', () => {
      this.audioSystem.playUIClick();
      this.startGame();
    });
    this.gameOverPanel?.getElementById('btn-main-menu')?.addEventListener('click', () => {
      this.audioSystem.playUIClick();
      this.showState('menu');
    });
  }

  private setupSonarInput() {
    // Keyboard: F key activates sonar
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.code === 'KeyF' && this.state === 'playing') {
        this.activateSonar();
      }
    });
  }

  private activateSonar() {
    if (!this.sonarReady || this.state !== 'playing') return;
    // Costs 20% beam energy to use sonar
    const energy = this.lighthouseSystem.getBeamEnergy();
    if (energy < this.lighthouseSystem.getMaxEnergy() * 0.15) return;

    this.sonarReady = false;
    this.sonarCooldown = this.sonarCooldownMax;
    this.lastSonarRadius = 0;

    this.envSystem.triggerSonar();
    this.audioSystem.playSonarPing();
    this.audioSystem.playFoghorn();

    this.hudPanel?.getElementById('wave-start-info')?.setProperties({
      text: '\ud83d\udce1 SONAR PULSE \u2014 Ships revealed!',
    });
    this.showingWaveStart = true;
    this.waveStartTimer = 2.0;
  }

  private tryUpgrade(type: 'range' | 'width' | 'energy') {
    const cost = 300;
    if (this.score < cost) return;
    this.score -= cost;
    this.audioSystem.playUpgradeSound();

    if (type === 'range') {
      this.lighthouseSystem.upgradeRange();
    } else if (type === 'width') {
      this.lighthouseSystem.upgradeWidth();
    } else {
      this.lighthouseSystem.upgradeCapacity();
    }

    this.updateUpgradePanel();
  }

  private updateUpgradePanel() {
    const canAfford = this.score >= 300;
    const affordText = canAfford ? '300 pts' : 'NEED 300';
    this.waveCompletePanel?.getElementById('upgrade-cost')?.setProperties({ text: affordText });
    this.waveCompletePanel?.getElementById('upgrade-score')?.setProperties({ text: String(this.score) });
  }

  private showState(newState: GameState) {
    this.state = newState;
    const panels = [
      { panel: this.menuPanel, show: newState === 'menu' },
      { panel: this.hudPanel, show: newState === 'playing' },
      { panel: this.waveCompletePanel, show: newState === 'wave-complete' },
      { panel: this.gameOverPanel, show: newState === 'game-over' },
      { panel: this.settingsPanel, show: newState === 'settings' },
      { panel: this.tutorialPanel, show: newState === 'tutorial' },
      { panel: this.compassPanel, show: newState === 'playing' },
    ];
    for (const { panel, show } of panels) {
      if (panel) panel.visible = show;
    }
  }

  private startGame() {
    this.score = 0;
    this.lives = 3;
    this.wave = 0;
    this.totalShipsSaved = 0;
    this.shipSystem.clearAllShips();
    this.envSystem.setFogDensity(0.012);
    this.envSystem.setRainActive(false);
    this.envSystem.setWindStrength(0);
    this.envSystem.setDayPhase(0);
    this.envSystem.setAuroraActive(false);
    this.envSystem.setCurrentStrength(0);

    this.menuPanel?.getElementById('high-score')?.setProperties({ text: String(this.highScore) });
    this.menuPanel?.getElementById('best-wave')?.setProperties({ text: String(this.bestWave) });

    this.startWave();
  }

  private startWave() {
    this.wave++;
    this.waveShipsSaved = 0;
    this.waveShipsLost = 0;
    this.emergencySpawned = false;
    this.treasureSpawned = false;
    this.sonarReady = true;
    this.sonarCooldown = 0;
    this.shipSystem.clearAllShips();

    const config = this.getWaveConfig(this.wave);
    this.waveShipTotal = config.shipCount;
    this.shipSystem.shipsToSpawn = config.shipCount;
    this.shipSystem.spawnInterval = config.spawnInterval;
    this.shipSystem.baseSpeed = config.shipSpeed;
    this.shipSystem.spawnTimer = 0.5;

    this.emergencyChance = config.emergencyChance;
    this.treasureChance = config.treasureChance;
    this.emergencyTimer = 5 + Math.random() * 10;
    this.treasureTimer = 8 + Math.random() * 15;

    this.envSystem.setFogDensity(config.fogDensity);
    this.envSystem.setSkyColor(config.skyShift[0], config.skyShift[1], config.skyShift[2]);
    this.envSystem.setRainActive(config.hasRain);
    this.envSystem.setWindStrength(config.windStrength);

    // Day/night cycle
    this.envSystem.setDayPhase(config.dayPhase);

    // Ocean currents
    this.envSystem.setCurrentStrength(config.currentStrength);
    this.envSystem.setCurrentDirection(config.currentAngle);

    // Aurora borealis
    this.envSystem.setAuroraActive(config.hasAurora);

    // Set ambient drone tonality based on storminess
    const storminess = config.windStrength + (config.hasRain ? 0.3 : 0) + config.currentStrength * 0.5;
    this.audioSystem.setDroneTone(Math.min(storminess, 1));

    this.waveHasStorm = config.stormChance > Math.random();
    if (this.waveHasStorm) {
      this.audioSystem.playStormWind();
      this.lightningTimer = 3 + Math.random() * 5;
    }

    this.lighthouseSystem.resetEnergy();
    this.lighthouseSystem.setBeamActive(true);
    this.showState('playing');

    // Show wave start info
    this.showingWaveStart = true;
    this.waveStartTimer = 3.0;
    const difficulty = this.wave <= 3 ? 'CALM' : this.wave <= 6 ? 'ROUGH' : this.wave <= 9 ? 'STORM' : 'TEMPEST';
    const weather = config.hasRain ? (this.waveHasStorm ? '\u26a1 Thunder' : '\ud83c\udf27 Rain') : '\u2b50 Clear';
    const timeOfDay = config.dayPhase < 0.15 ? '\ud83c\udf19 Night' : config.dayPhase < 0.35 ? '\ud83c\udf05 Dawn' : config.dayPhase < 0.65 ? '\u2600\ufe0f Day' : '\ud83c\udf07 Dusk';
    const extras: string[] = [];
    if (config.currentStrength > 0.1) extras.push('\ud83c\udf0a Currents');
    if (config.hasAurora) extras.push('\u2728 Aurora');
    const extraStr = extras.length > 0 ? ' \u2022 ' + extras.join(' ') : '';

    this.hudPanel?.getElementById('wave-start-info')?.setProperties({
      text: `Wave ${this.wave} \u2022 ${difficulty} \u2022 ${weather} \u2022 ${timeOfDay}${extraStr}`,
    });

    this.updateHUD();
  }

  private getWaveConfig(wave: number): WaveConfig {
    const hasRain = wave >= 3 && Math.random() < Math.min(wave * 0.12, 0.8);
    const windStr = wave >= 4 ? Math.min((wave - 3) * 0.15, 1.0) : 0;
    const skyR = 0.01 + Math.min(wave * 0.005, 0.04);
    const skyG = 0.02 + Math.min(wave * 0.003, 0.03);
    const skyB = 0.06 + Math.min(wave * 0.005, 0.04);

    // Day/night cycle: alternating, with dawn between waves
    // Even waves tend toward dawn/day, odd waves toward dusk/night
    let dayPhase: number;
    if (wave <= 2) {
      dayPhase = 0.25 + wave * 0.1; // dawn → early day
    } else if (wave % 2 === 0) {
      dayPhase = 0.3 + Math.random() * 0.2; // day-ish
    } else {
      dayPhase = 0.8 + Math.random() * 0.15; // night-ish (wraps)
      if (dayPhase > 1) dayPhase -= 1;
    }

    // Currents from wave 5+
    const currentStr = wave >= 5 ? Math.min((wave - 4) * 0.12, 0.6) : 0;
    const currentAngle = Math.random() * Math.PI * 2;

    // Aurora from wave 7+ (only at night)
    const hasAurora = wave >= 7 && dayPhase < 0.2 && Math.random() < 0.6;

    return {
      shipCount: 3 + wave * 2,
      spawnInterval: Math.max(1.5, 4 - wave * 0.3),
      shipSpeed: 0.6 + wave * 0.08,
      fogDensity: 0.012 + wave * 0.002,
      stormChance: Math.min(wave * 0.1, 0.7),
      hasRain,
      windStrength: windStr,
      skyShift: [skyR, skyG, skyB],
      emergencyChance: wave >= 3 ? Math.min((wave - 2) * 0.15, 0.6) : 0,
      treasureChance: wave >= 5 ? Math.min((wave - 4) * 0.1, 0.4) : 0,
      currentStrength: currentStr,
      currentAngle,
      dayPhase,
      hasAurora,
    };
  }

  private updateHUD() {
    this.hudPanel?.getElementById('score')?.setProperties({ text: String(this.score) });
    this.hudPanel?.getElementById('lives')?.setProperties({ text: String(this.lives) });
    this.hudPanel?.getElementById('wave')?.setProperties({ text: String(this.wave) });
    const activeShips = this.shipSystem.getActiveShipCount() + this.shipSystem.shipsToSpawn;
    this.hudPanel?.getElementById('ships-remaining')?.setProperties({ text: String(activeShips) });

    // Beam energy bar
    const energy = this.lighthouseSystem.getBeamEnergy();
    const maxEnergy = this.lighthouseSystem.getMaxEnergy();
    const energyPct = Math.round((energy / maxEnergy) * 100);
    const beamText = this.lighthouseSystem.isOverheated() ? 'OVERHEAT' :
      this.lighthouseSystem.isBeamActive() ? `${energyPct}%` : `OFF ${energyPct}%`;
    this.hudPanel?.getElementById('beam-power')?.setProperties({ text: beamText });

    // Ship type counts
    const [f, c, p] = this.shipSystem.getShipCountByType();
    this.hudPanel?.getElementById('fishing-count')?.setProperties({ text: String(f) });
    this.hudPanel?.getElementById('cargo-count')?.setProperties({ text: String(c) });
    this.hudPanel?.getElementById('ferry-count')?.setProperties({ text: String(p) });

    // Special ships
    const [em, tr] = this.shipSystem.getSpecialShipCount();
    if (em > 0 || tr > 0) {
      const specials: string[] = [];
      if (em > 0) specials.push(`\ud83d\udea8${em}`);
      if (tr > 0) specials.push(`\ud83d\udcb0${tr}`);
      this.hudPanel?.getElementById('special-info')?.setProperties({ text: specials.join(' ') });
    } else {
      this.hudPanel?.getElementById('special-info')?.setProperties({ text: '' });
    }

    // Sonar cooldown display
    if (!this.sonarReady) {
      const cd = Math.ceil(this.sonarCooldown);
      this.hudPanel?.getElementById('sonar-status')?.setProperties({ text: `SONAR: ${cd}s` });
    } else {
      this.hudPanel?.getElementById('sonar-status')?.setProperties({ text: 'SONAR: [F]' });
    }
  }

  private updateCompass() {
    const ships = this.shipSystem.getAllShips();
    const dirs = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
    const dirAngles = [
      Math.PI, 3 * Math.PI / 4, Math.PI / 2, Math.PI / 4,
      0, -Math.PI / 4, -Math.PI / 2, -3 * Math.PI / 4,
    ];
    const activeInDir: number[] = new Array(8).fill(-1);

    for (const ship of ships) {
      if (ship.docked || ship.sinking) continue;
      const pos = ship.entity.object3D!.position;
      const angle = Math.atan2(pos.x, pos.z);
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let d = 0; d < 8; d++) {
        let diff = Math.abs(angle - dirAngles[d]);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < bestDist) {
          bestDist = diff;
          bestIdx = d;
        }
      }
      if (activeInDir[bestIdx] < ship.shipType) {
        activeInDir[bestIdx] = ship.shipType;
      }
    }

    const typeColors = ['#4488cc', '#cc8844', '#ccccee', '#ff2222', '#ffcc00'];
    const inactiveColor = 'rgba(180, 200, 220, 0.5)';
    const inactiveBg = 'rgba(100, 120, 140, 0.3)';

    for (let d = 0; d < 8; d++) {
      const dirEl = this.compassPanel?.getElementById(`dir-${dirs[d]}`);
      const dotEl = this.compassPanel?.getElementById(`dot-${dirs[d]}`);
      if (activeInDir[d] >= 0) {
        const col = typeColors[Math.min(activeInDir[d], typeColors.length - 1)];
        dirEl?.setProperties({ color: col });
        dotEl?.setProperties({ backgroundColor: col });
      } else {
        dirEl?.setProperties({ color: inactiveColor });
        dotEl?.setProperties({ backgroundColor: inactiveBg });
      }
    }
  }

  private checkWaveComplete() {
    const ships = this.shipSystem.getAllShips();
    const allSpawned = this.shipSystem.shipsToSpawn <= 0;
    if (!allSpawned) return;

    let anyActive = false;
    let docked = 0;
    let sunk = 0;
    let dockedPoints = 0;
    for (const ship of ships) {
      if (ship.docked) {
        docked++;
        dockedPoints += ship.points;
      } else if (ship.sinking) {
        sunk++;
      } else {
        anyActive = true;
      }
    }

    const [em, tr] = this.shipSystem.getSpecialShipCount();
    if (em > 0 || tr > 0) anyActive = true;

    if (anyActive) return;

    this.waveShipsSaved = docked;
    this.waveShipsLost = this.waveShipTotal - docked;

    const perfectBonus = this.waveShipsLost === 0 ? 500 : 0;
    const waveScore = dockedPoints + perfectBonus;
    this.score += waveScore;
    this.totalShipsSaved += docked;

    this.lives -= this.waveShipsLost;

    // Clear weather
    this.envSystem.setRainActive(false);
    this.envSystem.setWindStrength(0);
    this.envSystem.setCurrentStrength(0);
    this.envSystem.setAuroraActive(false);
    // Transition to dawn between waves
    this.envSystem.setDayPhase(0.3);
    this.audioSystem.setDroneTone(0);

    if (this.lives <= 0) {
      this.gameOver();
      return;
    }

    this.audioSystem.playWaveComplete();
    const stars = this.waveShipsLost === 0 ? 3 : this.waveShipsLost <= 1 ? 2 : 1;
    const starStr = Array(stars).fill('\u2605').join(' ') +
      (stars < 3 ? ' ' + Array(3 - stars).fill('\u2606').join(' ') : '');

    this.waveCompletePanel?.getElementById('wave-num')?.setProperties({ text: `Wave ${this.wave}` });
    this.waveCompletePanel?.getElementById('ships-saved')?.setProperties({ text: String(docked) });
    this.waveCompletePanel?.getElementById('ships-lost')?.setProperties({ text: String(this.waveShipsLost) });
    this.waveCompletePanel?.getElementById('bonus')?.setProperties({ text: `+${perfectBonus}` });
    this.waveCompletePanel?.getElementById('stars')?.setProperties({ text: starStr });

    this.updateUpgradePanel();
    this.showState('wave-complete');
  }

  private gameOver() {
    this.audioSystem.playGameOver();
    this.envSystem.setRainActive(false);
    this.envSystem.setWindStrength(0);
    this.envSystem.setCurrentStrength(0);
    this.envSystem.setAuroraActive(false);
    this.audioSystem.setDroneTone(0);

    let isNewHigh = false;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('neon-lighthouse-high-score', String(this.highScore));
      isNewHigh = true;
    }
    if (this.wave > this.bestWave) {
      this.bestWave = this.wave;
      localStorage.setItem('neon-lighthouse-best-wave', String(this.bestWave));
    }

    this.gameOverPanel?.getElementById('final-score')?.setProperties({ text: String(this.score) });
    this.gameOverPanel?.getElementById('waves-survived')?.setProperties({ text: String(this.wave) });
    this.gameOverPanel?.getElementById('total-ships-saved')?.setProperties({ text: String(this.totalShipsSaved) });
    this.gameOverPanel?.getElementById('new-high-label')?.setProperties({
      text: isNewHigh ? 'NEW HIGH SCORE!' : ' ',
    });

    this.menuPanel?.getElementById('high-score')?.setProperties({ text: String(this.highScore) });
    this.menuPanel?.getElementById('best-wave')?.setProperties({ text: String(this.bestWave) });

    this.shipSystem.clearAllShips();
    this.showState('game-over');
  }

  update(delta: number, _time: number) {
    if (this.state === 'playing') {
      this.updateHUD();
      this.updateCompass();
      this.checkWaveComplete();

      // Wave start info fade
      if (this.showingWaveStart) {
        this.waveStartTimer -= delta;
        if (this.waveStartTimer <= 0) {
          this.showingWaveStart = false;
          this.hudPanel?.getElementById('wave-start-info')?.setProperties({ text: '' });
        }
      }

      // Periodic foghorn
      this.fogHornTimer -= delta;
      if (this.fogHornTimer <= 0) {
        this.audioSystem.playFoghorn();
        this.fogHornTimer = 15 + Math.random() * 10;
      }

      // Random lightning during storms
      if (this.waveHasStorm) {
        this.lightningTimer -= delta;
        if (this.lightningTimer <= 0) {
          this.envSystem.triggerLightning();
          this.audioSystem.playThunder();
          this.lightningTimer = 4 + Math.random() * 8;
        }
      }

      // XR sonar input: squeeze triggers sonar
      const leftPad = this.world.input.xr.gamepads.left;
      if (leftPad?.getButtonDown(InputComponent.Squeeze)) {
        this.activateSonar();
      }

      // Sonar cooldown
      if (!this.sonarReady) {
        this.sonarCooldown -= delta;
        if (this.sonarCooldown <= 0) {
          this.sonarReady = true;
        }
      }

      // Sonar reveals ships as the ring expands
      if (this.envSystem.isSonarActive()) {
        const sonarR = this.envSystem.getSonarRadius();
        if (sonarR > this.lastSonarRadius + 5) {
          this.shipSystem.sonarReveal(sonarR);
          this.lastSonarRadius = sonarR;
        }
      }

      // Special event: emergency ship
      if (!this.emergencySpawned && this.emergencyChance > 0) {
        this.emergencyTimer -= delta;
        if (this.emergencyTimer <= 0 && Math.random() < this.emergencyChance) {
          this.shipSystem.spawnShip(3);
          this.emergencySpawned = true;
          this.hudPanel?.getElementById('wave-start-info')?.setProperties({
            text: '\ud83d\udea8 EMERGENCY RESCUE \u2014 Ship in distress!',
          });
          this.showingWaveStart = true;
          this.waveStartTimer = 3.0;
        }
      }

      // Special event: treasure ship
      if (!this.treasureSpawned && this.treasureChance > 0) {
        this.treasureTimer -= delta;
        if (this.treasureTimer <= 0 && Math.random() < this.treasureChance) {
          this.shipSystem.spawnShip(4);
          this.treasureSpawned = true;
          this.hudPanel?.getElementById('wave-start-info')?.setProperties({
            text: '\ud83d\udcb0 TREASURE BARGE spotted on the horizon!',
          });
          this.showingWaveStart = true;
          this.waveStartTimer = 3.0;
        }
      }
    }
  }
}
