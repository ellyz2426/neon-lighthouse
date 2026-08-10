import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

export default defineAssets({
  'menu-panel': {
    url: publicAssetUrl('ui/menu.uikitml'),
    type: AssetType.UIKitML,
    name: 'Menu Panel',
  },
  'hud-panel': {
    url: publicAssetUrl('ui/hud.uikitml'),
    type: AssetType.UIKitML,
    name: 'HUD Panel',
  },
  'wave-complete-panel': {
    url: publicAssetUrl('ui/wave-complete.uikitml'),
    type: AssetType.UIKitML,
    name: 'Wave Complete Panel',
  },
  'game-over-panel': {
    url: publicAssetUrl('ui/game-over.uikitml'),
    type: AssetType.UIKitML,
    name: 'Game Over Panel',
  },
  'settings-panel': {
    url: publicAssetUrl('ui/settings.uikitml'),
    type: AssetType.UIKitML,
    name: 'Settings Panel',
  },
  'tutorial-panel': {
    url: publicAssetUrl('ui/tutorial.uikitml'),
    type: AssetType.UIKitML,
    name: 'Tutorial Panel',
  },
  'compass-panel': {
    url: publicAssetUrl('ui/compass.uikitml'),
    type: AssetType.UIKitML,
    name: 'Compass Panel',
  },
});
