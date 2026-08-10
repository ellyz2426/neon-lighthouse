# Neon Lighthouse VR

A lighthouse keeper arcade game built with [IWSDK](https://iwsdk.dev) — Meta's WebXR framework.

Guide ships safely to harbor by aiming your lighthouse beam through fog, storms, and treacherous waters. Each wave brings more ships, worse weather, and harder navigation challenges.

**[Play Now](https://ellyz2426.github.io/neon-lighthouse/)**

## Controls

### VR (Quest)
- **Right trigger** — Toggle lighthouse beam
- **Right controller aim** — Aim the beam
- **Left squeeze** — Fog sonar pulse

### Browser
- **Mouse movement** — Aim beam at ocean surface
- **Click** — Toggle beam on/off
- **F key** — Fog sonar pulse

## Gameplay

- **Beam aiming**: Illuminate ships to guide them toward the harbor dock
- **Ship types**: Fishing boats (50pts), cargo ships (150pts), ferries (200pts), emergency rescue (300pts), treasure barges (500pts)
- **Combo system**: Consecutive dockings without a crash build a score multiplier (up to 3.5x)
- **Beam energy**: The beam drains energy while active — toggle it off to recharge. Overheating disables it temporarily
- **Fog sonar**: Reveal hidden ships through fog (12s cooldown, costs beam energy)
- **Upgrades**: Between waves, spend 300 points to upgrade beam range, width, or energy capacity
- **Tidal waves**: Random tidal surges push all ships off course (wave 4+)
- **Ocean currents**: Persistent drift forces from wave 5+
- **Weather**: Rain, lightning, wind affecting ship drift and visibility
- **Day/night cycle**: Alternating between waves, with aurora borealis on night waves 7+

## Features

- Procedural ocean with animated wave shader, specular moonlight, Fresnel glow, and caustics
- 5 ship types with distinct visuals, speeds, and point values
- Wave-based progression with scaling difficulty
- Beam energy management with overheat/recharge and color temperature shift
- Lighthouse upgrade system (range/width/energy)
- Dynamic weather (rain, lightning, wind, fog)
- Day/night cycle with ambient light shifting
- Fog sonar mechanic with expanding ring visual
- Ocean currents with flow arrow indicators
- Aurora borealis sky effect
- Ship SOS morse code blink near rocks
- Distress flares from endangered ships
- Tidal wave events with ocean surge
- Whale sighting events with breach animation
- Shooting stars across the night sky
- Beam dust motes floating in the lighthouse beam
- Navigation buoys with flashing lights (toggleable)
- Ship-to-ship collision avoidance AI
- Ship lantern trails and wake effects
- Golden dock celebration particles
- Lighthouse keeper's log narratives (18 entries)
- Compass overlay with directional ship indicators color-coded by type
- Full procedural audio (foghorn, bells, chimes, thunder, wind, seagulls, whale calls, ship horns, sonar)
- 7 UIKitMLAsset spatial UI panels
- XR controller and browser dual-runtime support
- High score persistence via localStorage

## Tech

Built with IWSDK 0.5.1 on Three.js + ECS. All UI via UIKitMLAsset spatial panels. Procedural geometry and audio — no external assets.

## License

MIT
