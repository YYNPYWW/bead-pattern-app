import { MINI_BEAD_SPEC, formatPhysicalSize, getBoardSpec } from "./specs";
import type { BeadMatrix, BoardSpec, PaletteColor, UsageRow } from "./types";

export type RenderOptions = {
  showGrid: boolean;
  showCodes: boolean;
  showBoardLines: boolean;
  cellSize?: number;
  padToBoard?: boolean;
  showCoordinates?: boolean;
};

type PatternLayout = {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  sourceX: number;
  sourceY: number;
  drawWidth: number;
  drawHeight: number;
};

const getPatternLayout = (
  width: number,
  height: number,
  boardId: BoardSpec["id"],
  padToBoard?: boolean,
): PatternLayout => {
  if (!padToBoard) {
    return { width, height, offsetX: 0, offsetY: 0, sourceX: 0, sourceY: 0, drawWidth: width, drawHeight: height };
  }
  const board = getBoardSpec(boardId);
  const drawWidth = Math.min(width, board.cells);
  const drawHeight = Math.min(height, board.cells);
  return {
    width: board.cells,
    height: board.cells,
    offsetX: Math.floor((board.cells - drawWidth) / 2),
    offsetY: Math.floor((board.cells - drawHeight) / 2),
    sourceX: Math.floor((width - drawWidth) / 2),
    sourceY: Math.floor((height - drawHeight) / 2),
    drawWidth,
    drawHeight,
  };
};

const getGridMarkerInset = (board: BoardSpec) => (board.cells === 52 ? 1 : 2);

const drawGridLine = (
  ctx: CanvasRenderingContext2D,
  index: number,
  end: number,
  cellSize: number,
  vertical: boolean,
  boardCells: number,
  markerInset: number,
  originX: number,
  originY: number,
) => {
  const boardPosition = index % boardCells;
  const markerPosition = boardPosition - markerInset;
  const isStart = markerPosition === 0;
  const isFive = markerPosition > 0 && markerPosition % 5 === 0;
  const isTen = isFive && markerPosition % 10 === 0;
  ctx.setLineDash(isFive && !isTen ? [4, 4] : []);
  ctx.strokeStyle = isStart || isTen ? "rgba(15, 23, 42, 0.5)" : isFive ? "rgba(15, 23, 42, 0.36)" : "rgba(20, 20, 20, 0.16)";
  ctx.lineWidth = isStart || isTen ? 1.4 : 1;
  ctx.beginPath();
  if (vertical) {
    ctx.moveTo(originX + index * cellSize + 0.5, originY);
    ctx.lineTo(originX + index * cellSize + 0.5, originY + end);
  } else {
    ctx.moveTo(originX, originY + index * cellSize + 0.5);
    ctx.lineTo(originX + end, originY + index * cellSize + 0.5);
  }
  ctx.stroke();
};

const drawCoordinates = (
  ctx: CanvasRenderingContext2D,
  renderSize: Pick<PatternLayout, "width" | "height">,
  cellSize: number,
  gutter: number,
) => {
  if (gutter <= 0) return;
  const maxLabelLength = Math.max(renderSize.width, renderSize.height).toString().length;
  const fontSize = Math.max(7, Math.min(10, Math.floor(cellSize * 0.62)));
  ctx.fillStyle = "#334155";
  ctx.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textBaseline = "middle";

  ctx.textAlign = "center";
  for (let x = 0; x < renderSize.width; x += 1) {
    const label = String(x + 1);
    ctx.fillText(label, gutter + x * cellSize + cellSize / 2, gutter - 6);
  }

  ctx.textAlign = "right";
  for (let y = 0; y < renderSize.height; y += 1) {
    ctx.fillText(String(y + 1), gutter - 6, gutter + y * cellSize + cellSize / 2);
  }
};

export const renderPatternCanvas = (
  matrix: BeadMatrix,
  palette: PaletteColor[],
  boardId: BoardSpec["id"],
  options: RenderOptions,
) => {
  const cellSize = options.cellSize ?? 16;
  const width = matrix[0]?.length ?? 0;
  const height = matrix.length;
  const renderSize = getPatternLayout(width, height, boardId, options.padToBoard);
  const board = getBoardSpec(boardId);
  const maxCoordinate = Math.max(renderSize.width, renderSize.height);
  const coordinateGutter = options.showCoordinates
    ? Math.max(28, maxCoordinate.toString().length * Math.max(7, Math.floor(cellSize * 0.62)) + 14)
    : 0;
  const canvas = document.createElement("canvas");
  canvas.width = renderSize.width * cellSize + coordinateGutter;
  canvas.height = renderSize.height * cellSize + coordinateGutter;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("无法创建导出画布。");
  }
  const colorById = new Map(palette.map((color) => [color.id, color]));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawCoordinates(ctx, renderSize, cellSize, coordinateGutter);

  for (let y = 0; y < renderSize.drawHeight; y += 1) {
    for (let x = 0; x < renderSize.drawWidth; x += 1) {
      const cell = matrix[renderSize.sourceY + y]?.[renderSize.sourceX + x];
      const color = cell ? colorById.get(cell.colorId) : undefined;
      ctx.fillStyle = color?.hex ?? "#ffffff";
      const drawX = coordinateGutter + (x + renderSize.offsetX) * cellSize;
      const drawY = coordinateGutter + (y + renderSize.offsetY) * cellSize;
      ctx.fillRect(drawX, drawY, cellSize, cellSize);
      if (options.showCodes && cellSize >= 14 && color) {
        ctx.fillStyle = getReadableTextColor(color.hex);
        ctx.font = `${Math.max(7, Math.floor(cellSize * 0.42))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(color.code.replace(/^0+/, ""), drawX + cellSize / 2, drawY + cellSize / 2);
      }
    }
  }

  if (options.showGrid) {
    const markerInset = getGridMarkerInset(board);
    for (let x = 0; x <= renderSize.width; x += 1) {
      drawGridLine(ctx, x, renderSize.height * cellSize, cellSize, true, board.cells, markerInset, coordinateGutter, coordinateGutter);
    }
    for (let y = 0; y <= renderSize.height; y += 1) {
      drawGridLine(ctx, y, renderSize.width * cellSize, cellSize, false, board.cells, markerInset, coordinateGutter, coordinateGutter);
    }
    ctx.setLineDash([]);
  }

  if (options.showBoardLines) {
    ctx.setLineDash([]);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 3;
    for (let x = 0; x <= renderSize.width; x += board.cells) {
      ctx.beginPath();
      ctx.moveTo(coordinateGutter + x * cellSize + 0.5, coordinateGutter);
      ctx.lineTo(coordinateGutter + x * cellSize + 0.5, coordinateGutter + renderSize.height * cellSize);
      ctx.stroke();
    }
    for (let y = 0; y <= renderSize.height; y += board.cells) {
      ctx.beginPath();
      ctx.moveTo(coordinateGutter, coordinateGutter + y * cellSize + 0.5);
      ctx.lineTo(coordinateGutter + renderSize.width * cellSize, coordinateGutter + y * cellSize + 0.5);
      ctx.stroke();
    }
  }

  return canvas;
};

export const downloadPng = (
  matrix: BeadMatrix,
  palette: PaletteColor[],
  usage: UsageRow[],
  boardId: BoardSpec["id"],
  fileName: string,
) => {
  const cellSize = matrix[0]?.length > 90 ? 10 : 16;
  const layout = getPatternLayout(matrix[0]?.length ?? 0, matrix.length, boardId, true);
  const patternCanvas = renderPatternCanvas(matrix, palette, boardId, {
    showGrid: true,
    showCodes: cellSize >= 14,
    showBoardLines: true,
    padToBoard: true,
    showCoordinates: true,
    cellSize,
  });
  const canvas = renderPngCanvasWithUsage(patternCanvas, getPngUsageFromLayout(matrix, palette, layout, usage));
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName || "mini-bead-pattern"}.png`;
    link.click();
    URL.revokeObjectURL(url);
  });
};

const getPngUsageFromLayout = (matrix: BeadMatrix, palette: PaletteColor[], layout: PatternLayout, fallbackUsage: UsageRow[]) => {
  const colorById = new Map(palette.map((color) => [color.id, color]));
  if (layout.drawWidth <= 0 || layout.drawHeight <= 0) {
    return fallbackUsage;
  }
  const counts = new Map<string, number>();
  for (let y = 0; y < layout.drawHeight; y += 1) {
    for (let x = 0; x < layout.drawWidth; x += 1) {
      const colorId = matrix[layout.sourceY + y]?.[layout.sourceX + x]?.colorId;
      if (!colorId) continue;
      counts.set(colorId, (counts.get(colorId) ?? 0) + 1);
    }
  }
  const rows: UsageRow[] = [];
  counts.forEach((count, colorId) => {
    const color = colorById.get(colorId);
    if (color && count > 0) {
      rows.push({ color, count });
    }
  });
  return rows.sort((a, b) => b.count - a.count);
};

const renderPngCanvasWithUsage = (patternCanvas: HTMLCanvasElement, usage: UsageRow[]) => {
  const padding = 32;
  const columnWidth = 230;
  const rowHeight = 30;
  const titleHeight = 70;
  const exportWidth = Math.max(patternCanvas.width, 1100);
  const columns = Math.max(1, Math.floor((exportWidth - padding * 2) / columnWidth));
  const rowsPerColumn = Math.ceil(Math.max(usage.length, 1) / columns);
  const usageHeight = titleHeight + rowsPerColumn * rowHeight + padding;
  const canvas = document.createElement("canvas");
  canvas.width = exportWidth;
  canvas.height = patternCanvas.height + usageHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("无法创建 PNG 导出画布。");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(patternCanvas, Math.floor((exportWidth - patternCanvas.width) / 2), 0);

  const usageTop = patternCanvas.height;
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, usageTop, canvas.width, usageHeight);
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, usageTop + 0.5);
  ctx.lineTo(canvas.width, usageTop + 0.5);
  ctx.stroke();

  const totalCount = usage.reduce((sum, row) => sum + row.count, 0);
  ctx.fillStyle = "#111827";
  ctx.font = "700 22px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText("拼豆颜色用量", padding, usageTop + 24);
  ctx.fillStyle = "#475569";
  ctx.font = "14px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  ctx.fillText(`共 ${usage.length} 色，${totalCount} 颗`, padding, usageTop + 52);

  usage.forEach(({ color, count }, index) => {
    const column = Math.floor(index / rowsPerColumn);
    const row = index % rowsPerColumn;
    const x = padding + column * columnWidth;
    const y = usageTop + titleHeight + row * rowHeight;

    ctx.fillStyle = color.hex;
    ctx.fillRect(x, y + 5, 18, 18);
    ctx.strokeStyle = "#94a3b8";
    ctx.strokeRect(x + 0.5, y + 5.5, 17, 17);

    ctx.fillStyle = "#111827";
    ctx.font = "700 13px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(color.code, x + 26, y + 4);

    ctx.fillStyle = "#334155";
    ctx.font = "13px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    const label = color.name === color.code ? `${count} 颗` : `${color.name} · ${count} 颗`;
    ctx.fillText(label, x + 76, y + 4);
  });

  return canvas;
};

export const openPdfPrintView = (
  matrix: BeadMatrix,
  palette: PaletteColor[],
  usage: UsageRow[],
  boardId: BoardSpec["id"],
  projectName: string,
) => {
  const canvas = renderPatternCanvas(matrix, palette, boardId, {
    showGrid: true,
    showCodes: matrix[0]?.length <= 70,
    showBoardLines: true,
    cellSize: matrix[0]?.length > 90 ? 8 : 12,
  });
  const dataUrl = canvas.toDataURL("image/png");
  const width = matrix[0]?.length ?? 0;
  const height = matrix.length;
  const board = getBoardSpec(boardId);
  const boardCols = Math.ceil(width / board.cells);
  const boardRows = Math.ceil(height / board.cells);
  const rows = usage
    .map(
      ({ color, count }) =>
        `<tr><td><span class="swatch" style="background:${color.hex}"></span>${escapeHtml(color.code)}</td><td>${escapeHtml(
          color.name,
        )}</td><td>${count}</td></tr>`,
    )
    .join("");
  const popup = window.open("", "_blank", "noopener,noreferrer,width=1100,height=800");
  if (!popup) {
    alert("浏览器阻止了导出窗口，请允许弹出窗口后重试。");
    return;
  }
  popup.document.write(`<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(projectName || "Mini 拼豆图纸")}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; margin: 24px; }
        h1 { font-size: 22px; margin: 0 0 8px; }
        .meta { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 16px 0; }
        .box { border: 1px solid #d1d5db; padding: 10px; border-radius: 6px; }
        .label { font-size: 11px; color: #64748b; text-transform: uppercase; }
        .value { font-size: 15px; font-weight: 700; margin-top: 4px; }
        img { max-width: 100%; border: 1px solid #cbd5e1; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
        th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
        th { background: #f8fafc; }
        .swatch { display: inline-block; width: 14px; height: 14px; border: 1px solid #94a3b8; vertical-align: -2px; margin-right: 6px; }
        @media print { body { margin: 10mm; } button { display: none; } .page-break { break-before: page; } }
      </style>
    </head>
    <body>
      <button onclick="window.print()">保存为 PDF / 打印</button>
      <h1>${escapeHtml(projectName || "Mini 拼豆图纸")}</h1>
      <div class="meta">
        <div class="box"><div class="label">规格</div><div class="value">${MINI_BEAD_SPEC.name}</div></div>
        <div class="box"><div class="label">格数</div><div class="value">${width} x ${height}</div></div>
        <div class="box"><div class="label">成品尺寸</div><div class="value">${formatPhysicalSize(width, height)}</div></div>
        <div class="box"><div class="label">豆板</div><div class="value">${board.label}，${boardCols} x ${boardRows} 板</div></div>
      </div>
      <img src="${dataUrl}" alt="拼豆图纸" />
      <div class="page-break"></div>
      <h2>用量统计</h2>
      <table>
        <thead><tr><th>色号</th><th>颜色名</th><th>数量</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <script>window.onload = () => setTimeout(() => window.print(), 350);</script>
    </body>
  </html>`);
  popup.document.close();
};

const getReadableTextColor = (hex: string) => {
  const normalized = hex.replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#111827" : "#ffffff";
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
