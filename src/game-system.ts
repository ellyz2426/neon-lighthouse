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

    // Load saved scores
    this.highScore = parseInt(localStorage.getItem('neon-lighthouse-high-score') || '0', 10);
    this.bestWave = parseInt(localStorage.getItem('neon-lighthouse-best-wave') || '0', 10);

    // Get panels
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

    // Update menu high scores
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

    if (config.stormChance > Math.random()) {
      this.audioSystem.playStormWind();
    }

    this.lighthouseSystem.setBeamActive(true);
    this.showState('playing');
    this.updateHUD();
  }

  private getWaveConfig(wave: number): WaveConfig {
    return {
      shipCount: 3 + wave * 2,
      spawnInterval: Math.max(1.5, 4 - wave * 0.3),
      shipSpeed: 0.6 + wave * 0.08,
      fogDensity: 0.012 + wave * 0.002,
      stormChance: Math.min(wave * 0.1, 0.7),
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
  }

  private updateCompass() {
    const ships = this.shipSystem.getAllShips();
    const dirs = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
    const dirAngles = [
      Math.PI, 3 * Math.PI / 4, Math.PI / 2, Math.PI / 4,
      0, -Math.PI / 4, -Math.PI / 2, -3 * Math.PI / 4,
    ];
    const activeInDir = new Array(8).fill(false);

    for (const ship of ships) {
      if (ship.docked || ship.sinking) continue;
      const pos = ship.entity.object3D!.position;
      const angle = Math.atan2(pos.x, pos.z);
      // Find closest direction
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
      activeInDir[bestIdx] = true;
    }

    for (let d = 0; d < 8; d++) {
      const dirEl = this.compassPanel?.getElementById(`dir-${dirs[d]}`);
      const dotEl = this.compassPanel?.getElementById(`dot-${dirs[d]}`);
      if (activeInDir[d]) {
        dirEl?.setProperties({ color: '#ff6644' });
        dotEl?.setProperties({ backgroundColor: '#ff6644' });
      } else {
        dirEl?.setProperties({ color: 'rgba(180, 200, 220, 0.5)' });
        dotEl?.setProperties({ backgroundColor: 'rgba(100, 120, 140, 0.3)' });
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
    for (const ship of ships) {
      if (ship.docked) {
        docked++;
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

    // Score
    const savePoints = docked * 100;
    const perfectBonus = this.waveShipsLost === 0 ? 500 : 0;
    const waveScore = savePoints + perfectBonus;
    this.score += waveScore;
    this.totalShipsSaved += docked;

    // Lose lives for lost ships
    this.lives -= this.waveShipsLost;

    if (this.lives <= 0) {
      this.gameOver();
      return;
    }

    // Show wave complete
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

    // Update high scores
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

      // Periodic foghorn
      this.fogHornTimer -= delta;
      if (this.fogHornTimer <= 0) {
        this.audioSystem.playFoghorn();
        this.fogHornTimer = 15 + Math.random() * 10;
      }
    }
  }
}
