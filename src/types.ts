export type RGB = {
  r: number;
  g: number;
  b: number;
};

export type PaletteColor = {
  id: string;
  code: string;
  name: string;
  hex: string;
  rgb: RGB;
  note?: string;
};

export type BeadSpec = {
  name: string;
  diameterMm: number;
};

export type BoardSpec = {
  id: "52" | "104";
  label: string;
  cells: number;
};

export type BackgroundMode = "white" | "transparent" | "keep";

export type ConversionOptions = {
  width: number;
  height: number;
  boardId: BoardSpec["id"];
  maxColors: number;
  dithering: boolean;
  pixelArtMode: boolean;
  backgroundMode: BackgroundMode;
  disabledColorIds: string[];
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type BeadCell = {
  colorId: string;
};

export type BeadMatrix = BeadCell[][];

export type BeadProject = {
  imageName: string;
  imageDataUrl: string;
  originalWidth: number;
  originalHeight: number;
  options: ConversionOptions;
  matrix: BeadMatrix;
  originalMatrix: BeadMatrix;
  updatedAt: string;
};

export type UsageRow = {
  color: PaletteColor;
  count: number;
};
