import { createComponent, Types, defineComponents } from '@iwsdk/core';

export const Ship = createComponent('Ship', {
  speed: { type: Types.Float32, default: 0.8 },
  headingAngle: { type: Types.Float32, default: 0 },
  isLit: { type: Types.Boolean, default: false },
  litTimer: { type: Types.Float32, default: 0 },
  docked: { type: Types.Boolean, default: false },
  sinking: { type: Types.Boolean, default: false },
  sinkProgress: { type: Types.Float32, default: 0 },
  spawnAngle: { type: Types.Float32, default: 0 },
  shipType: { type: Types.Int32, default: 0 }, // 0=fishing, 1=cargo, 2=ferry
  points: { type: Types.Int32, default: 100 },
});

export const Rock = createComponent('Rock', {
  damageRadius: { type: Types.Float32, default: 1.5 },
});

export const Harbor = createComponent('Harbor', {
  dockRadius: { type: Types.Float32, default: 3.0 },
});

export const LighthouseBeam = createComponent('LighthouseBeam', {
  range: { type: Types.Float32, default: 60 },
  coneAngle: { type: Types.Float32, default: 0.18 },
  active: { type: Types.Boolean, default: true },
});

export const StarField = createComponent('StarField', {
  count: { type: Types.Int32, default: 400 },
});

export const OceanTile = createComponent('OceanTile', {
  waveSpeed: { type: Types.Float32, default: 1.0 },
});

export const Flare = createComponent('Flare', {
  life: { type: Types.Float32, default: 2.0 },
  speed: { type: Types.Float32, default: 8.0 },
});

export default defineComponents([
  Ship,
  Rock,
  Harbor,
  LighthouseBeam,
  StarField,
  OceanTile,
  Flare,
]);
