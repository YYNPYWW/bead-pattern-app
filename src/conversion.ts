import type { BeadMatrix, ConversionOptions, PaletteColor, RGB, UsageRow } from "./types";

const colorDistance = (a: RGB, b: RGB) => {
  const r = a.r - b.r;
  const g = a.g - b.g;
  const bDiff = a.b - b.b;
  return r * r * 0.3 + g * g * 0.59 + bDiff * bDiff * 0.11;
};

const nearestColor = (rgb: RGB, palette: PaletteColor[]) => {
  let best = palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const color of palette) {
    const distance = colorDistance(rgb, color.rgb);
    if (distance < bestDistance) {
      best = color;
      bestDistance = distance;
    }
  }
  return best;
};

const chooseLimitedPalette = (pixels: RGB[], palette: PaletteColor[], maxColors: number) => {
  if (maxColors >= palette.length) {
    return palette;
  }

  const usage = new Map<string, number>();
  for (let i = 0; i < pixels.length; i += Math.max(1, Math.floor(pixels.length / 5000))) {
    const nearest = nearestColor(pixels[i], palette);
    usage.set(nearest.id, (usage.get(nearest.id) ?? 0) + 1);
  }

  const limited = [...palette]
    .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0))
    .slice(0, Math.max(2, maxColors));
  return limited.length ? limited : palette.slice(0, Math.max(2, maxColors));
};

export const loadImage = (file: File) =>
  new Promise<{ image: HTMLImageElement; dataUrl: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取图片失败。"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("图片格式无法识别。"));
      image.onload = () => resolve({ image, dataUrl: String(reader.result) });
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

export const convertImageToMatrix = (
  image: HTMLImageElement,
  options: ConversionOptions,
  palette: PaletteColor[],
): BeadMatrix => {
  const activePalette = palette.filter((color) => !options.disabledColorIds.includes(color.id));
  if (activePalette.length < 2) {
    throw new Error("至少需要 2 个可用颜色。");
  }

  const source = document.createElement("canvas");
  source.width = options.width;
  source.height = options.height;
  const ctx = source.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("无法创建图片处理画布。");
  }

  if (options.backgroundMode === "white") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, source.width, source.height);
  }

  const crop = options.crop;
  ctx.imageSmoothingEnabled = !options.pixelArtMode;
  if (!options.pixelArtMode) {
    ctx.imageSmoothingQuality = "high";
  }
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    options.width,
    options.height,
  );

  const imageData = ctx.getImageData(0, 0, options.width, options.height);
  const data = imageData.data;
  const pixels: RGB[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    if (options.backgroundMode === "transparent" && alpha < 0.05) {
      pixels.push({ r: 255, g: 255, b: 255 });
    } else if (alpha < 1 && options.backgroundMode !== "keep") {
      pixels.push({
        r: Math.round(data[i] * alpha + 255 * (1 - alpha)),
        g: Math.round(data[i + 1] * alpha + 255 * (1 - alpha)),
        b: Math.round(data[i + 2] * alpha + 255 * (1 - alpha)),
      });
    } else {
      pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
    }
  }

  const limitedPalette = chooseLimitedPalette(pixels, activePalette, options.maxColors);
  const matrix: BeadMatrix = Array.from({ length: options.height }, () =>
    Array.from({ length: options.width }, () => ({ colorId: limitedPalette[0].id })),
  );

  if (!options.dithering) {
    pixels.forEach((pixel, index) => {
      const y = Math.floor(index / options.width);
      const x = index % options.width;
      matrix[y][x] = { colorId: nearestColor(pixel, limitedPalette).id };
    });
    return matrix;
  }

  const work = pixels.map((pixel) => ({ ...pixel }));
  const pushError = (x: number, y: number, error: RGB, factor: number) => {
    if (x < 0 || x >= options.width || y < 0 || y >= options.height) {
      return;
    }
    const index = y * options.width + x;
    work[index].r = Math.max(0, Math.min(255, work[index].r + error.r * factor));
    work[index].g = Math.max(0, Math.min(255, work[index].g + error.g * factor));
    work[index].b = Math.max(0, Math.min(255, work[index].b + error.b * factor));
  };

  for (let y = 0; y < options.height; y += 1) {
    for (let x = 0; x < options.width; x += 1) {
      const index = y * options.width + x;
      const oldColor = work[index];
      const next = nearestColor(oldColor, limitedPalette);
      matrix[y][x] = { colorId: next.id };
      const error = {
        r: oldColor.r - next.rgb.r,
        g: oldColor.g - next.rgb.g,
        b: oldColor.b - next.rgb.b,
      };
      pushError(x + 1, y, error, 7 / 16);
      pushError(x - 1, y + 1, error, 3 / 16);
      pushError(x, y + 1, error, 5 / 16);
      pushError(x + 1, y + 1, error, 1 / 16);
    }
  }

  return matrix;
};

export const cloneMatrix = (matrix: BeadMatrix): BeadMatrix =>
  matrix.map((row) => row.map((cell) => ({ ...cell })));

export const summarizeUsage = (matrix: BeadMatrix, palette: PaletteColor[]): UsageRow[] => {
  const byId = new Map(palette.map((color) => [color.id, color]));
  const counts = new Map<string, number>();
  matrix.forEach((row) => row.forEach((cell) => counts.set(cell.colorId, (counts.get(cell.colorId) ?? 0) + 1)));
  return [...counts.entries()]
    .map(([colorId, count]) => {
      const color = byId.get(colorId);
      return color ? { color, count } : null;
    })
    .filter((row): row is UsageRow => Boolean(row))
    .sort((a, b) => b.count - a.count);
};
