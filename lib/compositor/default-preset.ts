import backdropSvg from '../../assets/default-backdrop.svg?raw';

export interface ShowcasePreset {
  backdropSvg: string;
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
