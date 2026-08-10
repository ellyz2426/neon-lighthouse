import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { EnvironmentSystem } from './environment-system.js';
import { LighthouseSystem } from './lighthouse-system.js';
import { ShipSystem } from './ship-system.js';
import { AudioSystem } from './audio-system.js';
import { GameSystem } from './game-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  // Register in dependency order
  world.registerSystem(AudioSystem);
  world.registerSystem(EnvironmentSystem);
  world.registerSystem(LighthouseSystem);
  world.registerSystem(ShipSystem);
  world.registerSystem(GameSystem);
});
