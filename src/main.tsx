import React, { ChangeEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Download,
  FileImage,
  Grid2X2,
  ImagePlus,
  Paintbrush,
  Pipette,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
} from "lucide-react";
import { BOARD_SPECS, MINI_BEAD_SPEC, formatPhysicalSize, getBoardSpec } from "./specs";
import { DEFAULT_PALETTE } from "./palette";
import { cloneMatrix, convertImageToMatrix, loadImage, summarizeUsage } from "./conversion";
import { downloadPng } from "./exporters";
import type { BeadMatrix, ConversionOptions } from "./types";
import "./styles.css";

const STORAGE_KEY = "mini-bead-pattern-v1";
const ALL_PALETTE_GROUP = "全部";

const defaultOptions: ConversionOptions = {
  width: 52,
  height: 52,
  boardId: "52",
  maxColors: 18,
  dithering: true,
  pixelArtMode: true,
  backgroundMode: "white",
  disabledColorIds: [],
  crop: { x: 0, y: 0, width: 1, height: 1 },
};

function App() {
  const palette = DEFAULT_PALETTE;
  const [options, setOptions] = useState<ConversionOptions>(defaultOptions);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageMeta, setImageMeta] = useState({ name: "", dataUrl: "", width: 0, height: 0 });
  const [matrix, setMatrix] = useState<BeadMatrix>([]);
  const [originalMatrix, setOriginalMatrix] = useState<BeadMatrix>([]);
  const [selectedColorId, setSelectedColorId] = useState(DEFAULT_PALETTE[0].id);
  const [selectedPaletteGroup, setSelectedPaletteGroup] = useState(ALL_PALETTE_GROUP);
  const [tool, setTool] = useState<"paint" | "picker">("paint");
  const [zoom, setZoom] = useState(9);
  const [message, setMessage] = useState("请上传图片开始生成 2.6mm mini 拼豆图纸。");
  const [undoStack, setUndoStack] = useState<BeadMatrix[]>([]);
  const [redoStack, setRedoStack] = useState<BeadMatrix[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const board = getBoardSpec(options.boardId);
  const usage = useMemo(() => summarizeUsage(matrix, palette), [matrix, palette]);
  const boardCols = matrix[0]?.length ? Math.ceil(matrix[0].length / board.cells) : 0;
  const boardRows = matrix.length ? Math.ceil(matrix.length / board.cells) : 0;
  const paletteGroups = useMemo(() => {
    const letters = new Set(palette.map((color) => color.code.match(/^[A-Z]+/)?.[0] ?? ""));
    return [ALL_PALETTE_GROUP, ...[...letters].filter(Boolean).sort()];
  }, [palette]);
  const visiblePalette = useMemo(
    () =>
      selectedPaletteGroup === ALL_PALETTE_GROUP
        ? palette
        : palette.filter((color) => color.code.startsWith(selectedPaletteGroup)),
    [palette, selectedPaletteGroup],
  );
  const visibleActiveCount = visiblePalette.filter((color) => !options.disabledColorIds.includes(color.id)).length;

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (parsed.options) setOptions({ ...defaultOptions, ...parsed.options });
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ options }));
  }, [options]);

  useEffect(() => {
    drawPreview();
  }, [matrix, palette, options.boardId, zoom]);

  const drawPreview = () => {
    const canvas = canvasRef.current;
    if (!canvas || !matrix.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = matrix[0].length;
    const height = matrix.length;
    canvas.width = width * zoom;
    canvas.height = height * zoom;
    const byId = new Map(palette.map((color) => [color.id, color]));
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    matrix.forEach((row, y) => {
      row.forEach((cell, x) => {
        ctx.fillStyle = byId.get(cell.colorId)?.hex ?? "#ffffff";
        ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
      });
    });
    if (zoom >= 6) {
      ctx.strokeStyle = "rgba(15, 23, 42, 0.16)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= width; x += 1) {
        ctx.beginPath();
        ctx.moveTo(x * zoom + 0.5, 0);
        ctx.lineTo(x * zoom + 0.5, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += 1) {
        ctx.beginPath();
        ctx.moveTo(0, y * zoom + 0.5);
        ctx.lineTo(canvas.width, y * zoom + 0.5);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    for (let x = 0; x <= width; x += board.cells) {
      ctx.beginPath();
      ctx.moveTo(x * zoom + 0.5, 0);
      ctx.lineTo(x * zoom + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += board.cells) {
      ctx.beginPath();
      ctx.moveTo(0, y * zoom + 0.5);
      ctx.lineTo(canvas.width, y * zoom + 0.5);
      ctx.stroke();
    }
  };

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const loaded = await loadImage(file);
      setImage(loaded.image);
      setImageMeta({
        name: file.name.replace(/\.[^.]+$/, ""),
        dataUrl: loaded.dataUrl,
        width: loaded.image.naturalWidth,
        height: loaded.image.naturalHeight,
      });
      setOptions((current) => ({
        ...current,
        crop: { x: 0, y: 0, width: loaded.image.naturalWidth, height: loaded.image.naturalHeight },
      }));
      setMessage("图片已载入，调整参数后点击生成图纸。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "图片载入失败。");
    }
  };

  const generateWithOptions = (nextOptions: ConversionOptions) => {
    if (!image) {
      setMessage("请先上传图片。");
      return;
    }
    try {
      const next = convertImageToMatrix(image, nextOptions, palette);
      setMatrix(next);
      setOriginalMatrix(cloneMatrix(next));
      setUndoStack([]);
      setRedoStack([]);
      setSelectedColorId(next[0]?.[0]?.colorId ?? palette[0].id);
      setMessage(`已生成 ${nextOptions.width} x ${nextOptions.height} 格图纸。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成失败。");
    }
  };

  const generate = () => generateWithOptions(options);

  const updateOptionsAndRegenerate = (nextOptions: ConversionOptions) => {
    setOptions(nextOptions);
    if (image) {
      generateWithOptions(nextOptions);
    }
  };

  const updateCell = (x: number, y: number, colorId: string) => {
    if (!matrix[y]?.[x] || matrix[y][x].colorId === colorId) return;
    setUndoStack((stack) => [...stack.slice(-19), cloneMatrix(matrix)]);
    setRedoStack([]);
    const next = cloneMatrix(matrix);
    next[y][x] = { colorId };
    setMatrix(next);
  };

  const handleCanvasClick = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!matrix.length) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * matrix[0].length);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * matrix.length);
    const cell = matrix[y]?.[x];
    if (!cell) return;
    if (tool === "picker") {
      setSelectedColorId(cell.colorId);
      setTool("paint");
      return;
    }
    updateCell(x, y, selectedColorId);
  };

  const undo = () => {
    const previous = undoStack[undoStack.length - 1];
    if (!previous) return;
    setRedoStack((stack) => [...stack, cloneMatrix(matrix)]);
    setMatrix(previous);
    setUndoStack((stack) => stack.slice(0, -1));
  };

  const redo = () => {
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    setUndoStack((stack) => [...stack, cloneMatrix(matrix)]);
    setMatrix(next);
    setRedoStack((stack) => stack.slice(0, -1));
  };

  const resetEdits = () => {
    if (!originalMatrix.length) return;
    setUndoStack((stack) => [...stack.slice(-19), cloneMatrix(matrix)]);
    setRedoStack([]);
    setMatrix(cloneMatrix(originalMatrix));
  };

  const activePalette = palette.filter((color) => !options.disabledColorIds.includes(color.id));
  const setPaletteGroupEnabled = (group: string, enabled: boolean) => {
    const groupColorIds = (
      group === ALL_PALETTE_GROUP ? palette : palette.filter((color) => color.code.startsWith(group))
    ).map((color) => color.id);
    setOptions((current) => {
      if (enabled) {
        return {
          ...current,
          disabledColorIds: current.disabledColorIds.filter((id) => !groupColorIds.includes(id)),
        };
      }
      return {
        ...current,
        disabledColorIds: [...new Set([...current.disabledColorIds, ...groupColorIds])],
      };
    });
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">2.6mm mini fuse beads</p>
          <h1>图片转 Mini 拼豆图纸</h1>
        </div>
        <div className="top-actions">
          <label className="icon-button primary">
            <ImagePlus size={18} />
            上传图片
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageUpload} />
          </label>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel controls">
          <PanelTitle icon={<SlidersHorizontal size={18} />} title="转换参数" />
          <div className="notice">{message}</div>

          <div className="field-grid two">
            <label>
              宽度格数
              <input
                type="number"
                min={8}
                max={220}
                value={options.width}
                onChange={(event) => setOptions({ ...options, width: Number(event.target.value) })}
              />
            </label>
            <label>
              高度格数
              <input
                type="number"
                min={8}
                max={220}
                value={options.height}
                onChange={(event) => setOptions({ ...options, height: Number(event.target.value) })}
              />
            </label>
          </div>

          <label>
            豆板规格
            <select
              value={options.boardId}
              onChange={(event) => {
                const nextBoard = event.target.value as "52" | "104";
                setOptions({ ...options, boardId: nextBoard, width: Number(nextBoard), height: Number(nextBoard) });
              }}
            >
              {BOARD_SPECS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div className="field-grid two">
            <label>
              最大颜色数
              <input
                type="number"
                min={2}
                max={palette.length}
                value={options.maxColors}
                onChange={(event) => setOptions({ ...options, maxColors: Number(event.target.value) })}
              />
            </label>
            <label>
              预览缩放
              <input type="number" min={4} max={20} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
            </label>
          </div>

          <label>
            背景处理
            <select
              value={options.backgroundMode}
              onChange={(event) => setOptions({ ...options, backgroundMode: event.target.value as ConversionOptions["backgroundMode"] })}
            >
              <option value="white">透明区域铺白</option>
              <option value="transparent">透明区域当白色</option>
              <option value="keep">保留原始像素</option>
            </select>
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={options.dithering}
              onChange={(event) => updateOptionsAndRegenerate({ ...options, dithering: event.target.checked })}
            />
            开启 Floyd-Steinberg 抖动
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={options.pixelArtMode}
              onChange={(event) => updateOptionsAndRegenerate({ ...options, pixelArtMode: event.target.checked })}
            />
            像素图模式：保留硬边缘
          </label>

          <CropControls imageMeta={imageMeta} options={options} setOptions={setOptions} />

          <button className="run-button" onClick={generate}>
            <Grid2X2 size={18} />
            生成图纸
          </button>

          <div className="meta-grid">
            <Stat label="豆子规格" value={MINI_BEAD_SPEC.name} />
            <Stat label="色卡" value={`${palette.length} 色`} />
            <Stat label="成品尺寸" value={matrix.length ? formatPhysicalSize(matrix[0].length, matrix.length) : "-"} />
            <Stat label="豆板数量" value={matrix.length ? `${boardCols} x ${boardRows} 板` : "-"} />
          </div>
        </aside>

        <section className="preview-zone">
          <div className="preview-toolbar">
            <div className="tool-group">
              <button className={tool === "paint" ? "active" : ""} onClick={() => setTool("paint")} title="逐格改色">
                <Paintbrush size={18} />
              </button>
              <button className={tool === "picker" ? "active" : ""} onClick={() => setTool("picker")} title="吸管选色">
                <Pipette size={18} />
              </button>
              <button onClick={undo} disabled={!undoStack.length} title="撤销">
                <RotateCcw size={18} />
              </button>
              <button onClick={redo} disabled={!redoStack.length} title="重做">
                <RotateCw size={18} />
              </button>
            </div>
            <div className="tool-group">
              <button onClick={resetEdits} disabled={!originalMatrix.length}>
                恢复转换结果
              </button>
              <button onClick={() => matrix.length && downloadPng(matrix, palette, usage, options.boardId, imageMeta.name)} disabled={!matrix.length}>
                <FileImage size={18} />
                PNG
              </button>
              {/*
                v1 暂不提供 PDF 导出。保留按钮代码，后续恢复 PDF 功能时再打开。
              <button
                onClick={() => matrix.length && openPdfPrintView(matrix, palette, usage, options.boardId, imageMeta.name)}
                disabled={!matrix.length}
              >
                <FileText size={18} />
                PDF
              </button>
              */}
            </div>
          </div>

          <div className="canvas-frame">
            {matrix.length ? (
              <canvas ref={canvasRef} onClick={handleCanvasClick} />
            ) : (
              <div className="empty-state">
                <Download size={36} />
                <strong>等待生成图纸</strong>
                <span>上传图片后会在这里显示带板边界的拼豆网格。</span>
              </div>
            )}
          </div>
        </section>

        <aside className="panel palette-panel">
          <PanelTitle icon={<Pipette size={18} />} title="色板与用量" />
          <div className="palette-status">
            <span>{activePalette.length} 个可用颜色</span>
            <span>{usage.reduce((sum, row) => sum + row.count, 0)} 颗</span>
          </div>

          <div className="selected-color">
            <span style={{ background: palette.find((color) => color.id === selectedColorId)?.hex }} />
            <div>
              <strong>{palette.find((color) => color.id === selectedColorId)?.code ?? "-"}</strong>
              <small>{palette.find((color) => color.id === selectedColorId)?.name ?? "未选择"}</small>
            </div>
          </div>

          <div className="palette-groups">
            {paletteGroups.map((group) => {
              const groupColors =
                group === ALL_PALETTE_GROUP ? palette : palette.filter((color) => color.code.startsWith(group));
              const enabledCount = groupColors.filter((color) => !options.disabledColorIds.includes(color.id)).length;
              return (
                <button
                  key={group}
                  className={selectedPaletteGroup === group ? "selected" : ""}
                  onClick={() => setSelectedPaletteGroup(group)}
                  title={`${enabledCount}/${groupColors.length} 个可用颜色`}
                >
                  <span>{group}</span>
                  <small>
                    {enabledCount}/{groupColors.length}
                  </small>
                </button>
              );
            })}
          </div>

          <div className="group-actions">
            <span>
              {selectedPaletteGroup}：{visibleActiveCount}/{visiblePalette.length} 个可用
            </span>
            <div>
              <button onClick={() => setPaletteGroupEnabled(selectedPaletteGroup, true)}>全选</button>
              <button onClick={() => setPaletteGroupEnabled(selectedPaletteGroup, false)}>全不选</button>
            </div>
          </div>

          <div className="color-list">
            {visiblePalette.map((color) => {
              const disabled = options.disabledColorIds.includes(color.id);
              return (
                <button
                  key={color.id}
                  className={`color-row ${selectedColorId === color.id ? "selected" : ""} ${disabled ? "disabled" : ""}`}
                  onClick={() => setSelectedColorId(color.id)}
                >
                  <span className="swatch" style={{ background: color.hex }} />
                  <span className="color-code">{color.code}</span>
                  <span className="color-name">{color.name}</span>
                  <input
                    type="checkbox"
                    checked={!disabled}
                    title="参与自动转换"
                    onChange={(event) => {
                      event.stopPropagation();
                      setOptions((current) => ({
                        ...current,
                        disabledColorIds: event.target.checked
                          ? current.disabledColorIds.filter((id) => id !== color.id)
                          : [...current.disabledColorIds, color.id],
                      }));
                    }}
                  />
                </button>
              );
            })}
          </div>

          <div className="usage-list">
            <h2>实际用量</h2>
            {usage.slice(0, 24).map(({ color, count }) => (
              <div key={color.id} className="usage-row">
                <span className="swatch" style={{ background: color.hex }} />
                <span>{color.code}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="panel-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CropControls({
  imageMeta,
  options,
  setOptions,
}: {
  imageMeta: { width: number; height: number };
  options: ConversionOptions;
  setOptions: (options: ConversionOptions) => void;
}) {
  const disabled = !imageMeta.width;
  const updateCrop = (key: keyof ConversionOptions["crop"], value: number) => {
    setOptions({ ...options, crop: { ...options.crop, [key]: value } });
  };
  return (
    <div className="crop-box">
      <div className="section-label">裁剪区域</div>
      <div className="field-grid two">
        <label>
          X
          <input disabled={disabled} type="number" value={Math.round(options.crop.x)} onChange={(event) => updateCrop("x", Number(event.target.value))} />
        </label>
        <label>
          Y
          <input disabled={disabled} type="number" value={Math.round(options.crop.y)} onChange={(event) => updateCrop("y", Number(event.target.value))} />
        </label>
        <label>
          宽
          <input
            disabled={disabled}
            type="number"
            min={1}
            max={imageMeta.width || 1}
            value={Math.round(options.crop.width)}
            onChange={(event) => updateCrop("width", Number(event.target.value))}
          />
        </label>
        <label>
          高
          <input
            disabled={disabled}
            type="number"
            min={1}
            max={imageMeta.height || 1}
            value={Math.round(options.crop.height)}
            onChange={(event) => updateCrop("height", Number(event.target.value))}
          />
        </label>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
