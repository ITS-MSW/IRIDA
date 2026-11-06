import backdropSvg from '../../assets/default-backdrop.svg?raw';

export interface ShowcasePreset {
  backdropSvg: string;
  backgroundColor?: string;
  padding: number;
  maxSide: number;
  shadow: { color: string; blur: number; offsetY: number };
}

export const defaultPreset: ShowcasePreset = {
  backdropSvg,
  padding: 64,
  maxSide: 4096,
  shadow: { color: 'rgba(35, 23, 57, 0.17)', blur: 22, offsetY: 9 },
};

export const backgrounds = [
  { value: 'lavender', label: 'Lavender', color: undefined },
  { value: 'sand', label: 'Sand', color: '#f2e7d8' },
  { value: 'midnight', label: 'Midnight', color: '#252337' },
  { value: 'solid', label: 'Solid color', color: undefined },
] as const;
export interface ShowcaseSettings {
  background: typeof backgrounds[number]['value'];
  color: string;
  padding: number;
  shadow: boolean;
}
export const defaultSettings: ShowcaseSettings = { background: 'lavender', color: '#ffffff', padding: 64, shadow: true };
export function presetFor(settings: ShowcaseSettings): ShowcasePreset {
  return {
    ...defaultPreset,
    backgroundColor: settings.background === 'solid' ? settings.color : backgrounds.find(item => item.value === settings.background)?.color,
    padding: settings.padding,
    shadow: settings.shadow ? defaultPreset.shadow : { color: 'transparent', blur: 0, offsetY: 0 },
  };
}
