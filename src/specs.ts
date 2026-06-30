import type { BeadSpec, BoardSpec } from "./types";

export const MINI_BEAD_SPEC: BeadSpec = {
  name: "2.6mm mini 融合豆",
  diameterMm: 2.6,
};

export const BOARD_SPECS: BoardSpec[] = [
  { id: "52", label: "52 x 52 格", cells: 52 },
  { id: "104", label: "104 x 104 格", cells: 104 },
];

export const getBoardSpec = (id: BoardSpec["id"]) =>
  BOARD_SPECS.find((board) => board.id === id) ?? BOARD_SPECS[0];

export const formatPhysicalSize = (width: number, height: number) => {
  const widthMm = width * MINI_BEAD_SPEC.diameterMm;
  const heightMm = height * MINI_BEAD_SPEC.diameterMm;
  return `${widthMm.toFixed(1)} x ${heightMm.toFixed(1)} mm`;
};
