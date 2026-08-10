import { createSystem, UIKitMLAsset } from '@iwsdk/core';
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
}

const SHIP_TYPE_NAMES = ['Fishing', 'Cargo', 'Ferry'];

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

    this.menuPanel?.getElementById('high-score')?.setProperties({ text: String(this.highScore) });
    this.menuPanel?.getElementById('best-wave')?.setProperties({ text: String(this.bestWave) });

    this.startWave();
  }

  private startWave() {
    this.wave++;
    this.waveShipsSaved = 0;
    this.waveShipsLost = 0;
    this.shipSystem.clearAllShips();

    const config = this.getWaveConfig(this.wave);
    this.waveShipTotal = config.shipCount;
    this.shipSystem.shipsToSpawn = config.shipCount;
    this.shipSystem.spawnInterval = config.spawnInterval;
    this.shipSystem.baseSpeed = config.shipSpeed;
    this.shipSystem.spawnTimer = 0.5;

    this.envSystem.setFogDensity(config.fogDensity);
    this.envSystem.setSkyColor(config.skyShift[0], config.skyShift[1], config.skyShift[2]);
    this.envSystem.setRainActive(config.hasRain);
    this.envSystem.setWindStrength(config.windStrength);

    this.waveHasStorm = config.stormChance > Math.random();
    if (this.waveHasStorm) {
      this.audioSystem.playStormWind();
      this.lightningTimer = 3 + Math.random() * 5;
    }

    this.lighthouseSystem.setBeamActive(true);
    this.showState('playing');

    // Show wave start info
    this.showingWaveStart = true;
    this.waveStartTimer = 3.0;
    const difficulty = this.wave <= 3 ? 'CALM' : this.wave <= 6 ? 'ROUGH' : this.wave <= 9 ? 'STORM' : 'TEMPEST';
    const weather = config.hasRain ? (this.waveHasStorm ? '\u26a1 Thunder' : '\ud83c\udf27 Rain') : '\u2b50 Clear';
    this.hudPanel?.getElementById('wave-start-info')?.setProperties({
      text: `Wave ${this.wave} \u2022 ${difficulty} \u2022 ${weather} \u2022 ${config.shipCount} ships`,
    });

    this.updateHUD();
  }

  private getWaveConfig(wave: number): WaveConfig {
    const hasRain = wave >= 3 && Math.random() < Math.min(wave * 0.12, 0.8);
    const windStr = wave >= 4 ? Math.min((wave - 3) * 0.15, 1.0) : 0;
    // Sky shifts from deep blue to stormy grey-green as waves progress
    const skyR = 0.01 + Math.min(wave * 0.005, 0.04);
    const skyG = 0.02 + Math.min(wave * 0.003, 0.03);
    const skyB = 0.06 + Math.min(wave * 0.005, 0.04);

    return {
      shipCount: 3 + wave * 2,
      spawnInterval: Math.max(1.5, 4 - wave * 0.3),
      shipSpeed: 0.6 + wave * 0.08,
      fogDensity: 0.012 + wave * 0.002,
      stormChance: Math.min(wave * 0.1, 0.7),
      hasRain,
      windStrength: windStr,
      skyShift: [skyR, skyG, skyB],
    };
  }

  private updateHUD() {
    this.hudPanel?.getElementById('score')?.setProperties({ text: String(this.score) });
    this.hudPanel?.getElementById('lives')?.setProperties({ text: String(this.lives) });
    this.hudPanel?.getElementById('wave')?.setProperties({ text: String(this.wave) });
    const activeShips = this.shipSystem.getActiveShipCount() + this.shipSystem.shipsToSpawn;
    this.hudPanel?.getElementById('ships-remaining')?.setProperties({ text: String(activeShips) });
    this.hudPanel?.getElementById('beam-power')?.setProperties({
      text: this.lighthouseSystem.isBeamActive() ? 'ON' : 'OFF',
    });

    // Ship type counts
    const [f, c, p] = this.shipSystem.getShipCountByType();
    this.hudPanel?.getElementById('fishing-count')?.setProperties({ text: String(f) });
    this.hudPanel?.getElementById('cargo-count')?.setProperties({ text: String(c) });
    this.hudPanel?.getElementById('ferry-count')?.setProperties({ text: String(p) });
  }

  private updateCompass() {
    const ships = this.shipSystem.getAllShips();
    const dirs = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
    const dirAngles = [
      Math.PI, 3 * Math.PI / 4, Math.PI / 2, Math.PI / 4,
      0, -Math.PI / 4, -Math.PI / 2, -3 * Math.PI / 4,
    ];
    const activeInDir: number[] = new Array(8).fill(-1); // -1 = none, or shipType

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
      // Use highest-value ship type in that direction
      if (activeInDir[bestIdx] < ship.shipType) {
        activeInDir[bestIdx] = ship.shipType;
      }
    }

    const typeColors = ['#4488cc', '#cc8844', '#ccccee']; // fishing=blue, cargo=orange, ferry=white
    const inactiveColor = 'rgba(180, 200, 220, 0.5)';
    const inactiveBg = 'rgba(100, 120, 140, 0.3)';

    for (let d = 0; d < 8; d++) {
      const dirEl = this.compassPanel?.getElementById(`dir-${dirs[d]}`);
      const dotEl = this.compassPanel?.getElementById(`dot-${dirs[d]}`);
      if (activeInDir[d] >= 0) {
        const col = typeColors[activeInDir[d]];
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

    if (anyActive) return;

    // Wave done
    this.waveShipsSaved = docked;
    this.waveShipsLost = this.waveShipTotal - docked;

    // Score based on ship points
    const perfectBonus = this.waveShipsLost === 0 ? 500 : 0;
    const waveScore = dockedPoints + perfectBonus;
    this.score += waveScore;
    this.totalShipsSaved += docked;

    // Lose lives
    this.lives -= this.waveShipsLost;

    // Clear weather
    this.envSystem.setRainActive(false);
    this.envSystem.setWindStrength(0);

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

    this.showState('wave-complete');
  }

  private gameOver() {
    this.audioSystem.playGameOver();
    this.envSystem.setRainActive(false);
    this.envSystem.setWindStrength(0);

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
    }
  }
}
