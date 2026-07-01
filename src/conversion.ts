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

const colorSaturation = (rgb: RGB) => {
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  return (max - min) / 255;
};

const estimateBackgroundColor = (pixels: RGB[], width: number, height: number): RGB => {
  const buckets = new Map<string, { count: number; rgb: RGB }>();
  const addPixel = (x: number, y: number) => {
    const pixel = pixels[y * width + x];
    const key = `${Math.round(pixel.r / 24)}-${Math.round(pixel.g / 24)}-${Math.round(pixel.b / 24)}`;
    const current = buckets.get(key);
    if (current) {
      current.count += 1;
      current.rgb.r += pixel.r;
      current.rgb.g += pixel.g;
      current.rgb.b += pixel.b;
    } else {
      buckets.set(key, { count: 1, rgb: { ...pixel } });
    }
  };

  for (let x = 0; x < width; x += 1) {
    addPixel(x, 0);
    addPixel(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    addPixel(0, y);
    addPixel(width - 1, y);
  }

  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant) {
    return { r: 255, g: 255, b: 255 };
  }
  return {
    r: dominant.rgb.r / dominant.count,
    g: dominant.rgb.g / dominant.count,
    b: dominant.rgb.b / dominant.count,
  };
};

const localEdgeStrength = (pixels: RGB[], width: number, height: number, x: number, y: number) => {
  const current = pixels[y * width + x];
  let total = 0;
  let count = 0;
  const compare = (nextX: number, nextY: number) => {
    if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
      return;
    }
    total += Math.sqrt(colorDistance(current, pixels[nextY * width + nextX])) / 255;
    count += 1;
  };
  compare(x + 1, y);
  compare(x - 1, y);
  compare(x, y + 1);
  compare(x, y - 1);
  return count ? Math.min(1, total / count) : 0;
};

const subjectWeight = (pixels: RGB[], width: number, height: number, index: number, background: RGB) => {
  const pixel = pixels[index];
  const x = index % width;
  const y = Math.floor(index / width);
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY) || 1;
  const centerBias = 1 - Math.min(1, Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2) / maxDistance);
  const backgroundContrast = Math.min(1, Math.sqrt(colorDistance(pixel, background)) / 255);
  const edge = localEdgeStrength(pixels, width, height, x, y);
  const saturation = colorSaturation(pixel);

  return 1 + backgroundContrast * 2.4 + edge * 2 + saturation * 1.2 + centerBias * 0.7;
};

const chooseLimitedPalette = (pixels: RGB[], palette: PaletteColor[], maxColors: number, width: number, height: number) => {
  if (maxColors >= palette.length) {
    return palette;
  }

  const targetSize = Math.max(2, maxColors);
  const background = estimateBackgroundColor(pixels, width, height);
  const usage = new Map<string, { count: number; subjectScore: number }>();
  for (let i = 0; i < pixels.length; i += Math.max(1, Math.floor(pixels.length / 5000))) {
    const nearest = nearestColor(pixels[i], palette);
    const current = usage.get(nearest.id) ?? { count: 0, subjectScore: 0 };
    current.count += 1;
    current.subjectScore += subjectWeight(pixels, width, height, i, background);
    usage.set(nearest.id, current);
  }

  const rankedByArea = [...palette].sort((a, b) => (usage.get(b.id)?.count ?? 0) - (usage.get(a.id)?.count ?? 0));
  const rankedBySubject = [...palette].sort(
    (a, b) => (usage.get(b.id)?.subjectScore ?? 0) - (usage.get(a.id)?.subjectScore ?? 0),
  );
  const selected: PaletteColor[] = [];
  const addColor = (color: PaletteColor, enforceSeparation: boolean) => {
    if (selected.some((item) => item.id === color.id)) {
      return;
    }
    if (enforceSeparation && selected.some((item) => colorDistance(item.rgb, color.rgb) < (targetSize <= 8 ? 900 : 400))) {
      return;
    }
    selected.push(color);
  };

  if (rankedByArea[0]) {
    addColor(rankedByArea[0], false);
  }
  for (const color of rankedBySubject) {
    if (selected.length >= targetSize) break;
    addColor(color, true);
  }
  for (const color of rankedBySubject) {
    if (selected.length >= targetSize) break;
    addColor(color, false);
  }

  return selected.length ? selected : palette.slice(0, targetSize);
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

  const limitedPalette = chooseLimitedPalette(pixels, activePalette, options.maxColors, options.width, options.height);
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
