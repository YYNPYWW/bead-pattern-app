import type { PaletteColor, RGB } from "./types";
import { BEAD_COLOR_HEX_CONFIG } from "./config/beadColors";

const hexToRgb = (hex: string): RGB => {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const makeColor = (code: string, name: string, hex: string): PaletteColor => ({
  id: code,
  code,
  name,
  hex,
  rgb: hexToRgb(hex),
});

export const DEFAULT_PALETTE: PaletteColor[] = BEAD_COLOR_HEX_CONFIG.map((color) => ({
  ...makeColor(color.code, color.name, color.hex),
  note: color.isTransparent ? "透明豆：图片未提供十六进制，使用白色作为屏幕显示和自动匹配色。" : undefined,
}));
