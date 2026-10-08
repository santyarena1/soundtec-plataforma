/** Paleta y atmósfera por tipología (sin JSX). */

export const MAT = {
  wood: "#8b7355",
  woodDark: "#5c4a38",
  woodLight: "#c4a882",
  fabric: "#4a5568",
  fabricLight: "#94a3b8",
  fabricWarm: "#7c6a5a",
  metal: "#64748b",
  metalDark: "#334155",
  white: "#f1f5f9",
  wall: "#eef2f6",
  wallAccent: "#dbe4ee",
  glass: "#93c5fd",
  screen: "#0c1929",
  screenLit: "#1e3a5f",
  carpet: "#9aa3b2",
  carpetWarm: "#b8a99a",
  tile: "#d6d3d1",
  concrete: "#c5cdd6",
  outdoor: "#8a9a7b",
  black: "#0f172a",
  cream: "#f5f0e8",
  stage: "#1e293b",
} as const;

export function roomTheme(
  category: string,
  templateKey: string,
): {
  floor: string;
  wall: string;
  wallFront: string;
  ceiling: string;
  trim: string;
  fog: string;
  ambient: number;
  outdoor?: boolean;
} {
  if (templateKey === "hotel-pool-bar-m") {
    return {
      floor: MAT.outdoor,
      wall: "#d7e0d2",
      wallFront: "#c5d4be",
      ceiling: "#eef2e8",
      trim: MAT.woodDark,
      fog: "#c5d0c0",
      ambient: 0.75,
      outdoor: true,
    };
  }
  if (category === "hotel") {
    return {
      floor: MAT.carpetWarm,
      wall: "#f3ece3",
      wallFront: "#ebe2d6",
      ceiling: "#faf7f2",
      trim: MAT.woodDark,
      fog: "#ddd5c8",
      ambient: 0.62,
    };
  }
  if (category === "classroom" || category === "training") {
    return {
      floor: MAT.tile,
      wall: "#f8fafc",
      wallFront: "#e2e8f0",
      ceiling: "#ffffff",
      trim: MAT.metal,
      fog: "#d0d7e0",
      ambient: 0.7,
    };
  }
  if (category === "event") {
    return {
      floor: "#3f4654",
      wall: "#1f2937",
      wallFront: "#111827",
      ceiling: "#0f172a",
      trim: "#64748b",
      fog: "#1e293b",
      ambient: 0.45,
    };
  }
  if (category === "lobby" || category === "signage") {
    return {
      floor: MAT.tile,
      wall: "#f1f5f9",
      wallFront: "#e2e8f0",
      ceiling: "#ffffff",
      trim: MAT.metalDark,
      fog: "#c8d0da",
      ambient: 0.72,
    };
  }
  if (category === "residential") {
    return {
      floor: MAT.wood,
      wall: "#f5f0e8",
      wallFront: "#ebe4d8",
      ceiling: "#faf8f4",
      trim: MAT.woodDark,
      fog: "#d9d0c2",
      ambient: 0.6,
    };
  }
  if (category === "control-room") {
    return {
      floor: MAT.concrete,
      wall: "#1e293b",
      wallFront: "#0f172a",
      ceiling: "#111827",
      trim: "#475569",
      fog: "#1e293b",
      ambient: 0.4,
    };
  }
  return {
    floor: MAT.carpet,
    wall: MAT.wall,
    wallFront: MAT.wallAccent,
    ceiling: "#f8fafc",
    trim: MAT.woodDark,
    fog: "#c5d0dc",
    ambient: 0.65,
  };
}
