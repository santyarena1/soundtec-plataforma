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
  wall: "#f3f2ef",
  wallAccent: "#e1dfda",
  glass: "#93c5fd",
  screen: "#0c1929",
  screenLit: "#1e3a5f",
  carpet: "#a19d97",
  carpetWarm: "#b8a99a",
  tile: "#d6d3d1",
  concrete: "#c5cdd6",
  outdoor: "#8a9a7b",
  black: "#0f172a",
  cream: "#f5f0e8",
  stage: "#1e293b",
} as const;

export type RoomEnvPreset =
  | "apartment"
  | "city"
  | "lobby"
  | "warehouse"
  | "sunset"
  | "night"
  | "studio";

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
  envPreset: RoomEnvPreset;
} {
  if (templateKey === "residential-outdoor-m") {
    return {
      floor: MAT.outdoor,
      wall: "#e8e2d8",
      wallFront: "#ddd5c8",
      ceiling: "#f2efe9",
      trim: MAT.woodDark,
      fog: "#c9d2c4",
      ambient: 0.55,
      outdoor: true,
      envPreset: "sunset",
    };
  }
  if (templateKey === "residential-cinema-m") {
    return {
      floor: MAT.carpet,
      wall: "#2b2f36",
      wallFront: "#1c1f24",
      ceiling: "#16181c",
      trim: "#3a3f47",
      fog: "#1c1f24",
      ambient: 0.22,
      envPreset: "night",
    };
  }
  if (templateKey === "restaurant-m") {
    return {
      floor: MAT.woodDark,
      wall: "#e9dfd1",
      wallFront: "#d9c9b4",
      ceiling: "#f3ede4",
      trim: MAT.woodDark,
      fog: "#d6cab8",
      ambient: 0.4,
      envPreset: "apartment",
    };
  }
  if (category === "commercial") {
    return {
      floor: MAT.concrete,
      wall: "#f4f2ee",
      wallFront: "#e4e0d9",
      ceiling: "#ffffff",
      trim: MAT.metalDark,
      fog: "#d4d8dc",
      ambient: 0.5,
      envPreset: "city",
    };
  }
  if (templateKey === "hotel-pool-bar-m") {
    return {
      floor: MAT.outdoor,
      wall: "#d7e0d2",
      wallFront: "#c5d4be",
      ceiling: "#eef2e8",
      trim: MAT.woodDark,
      fog: "#c5d0c0",
      ambient: 0.55,
      outdoor: true,
      envPreset: "sunset",
    };
  }
  if (category === "hotel") {
    return {
      floor: MAT.carpetWarm,
      wall: "#f2eee8",
      wallFront: "#ddd3c6",
      ceiling: "#faf7f2",
      trim: MAT.woodDark,
      fog: "#ddd5c8",
      ambient: 0.45,
      envPreset: "apartment",
    };
  }
  if (category === "classroom" || category === "training") {
    return {
      floor: MAT.tile,
      wall: "#f5f4f1",
      wallFront: "#dfe3e1",
      ceiling: "#ffffff",
      trim: MAT.metal,
      fog: "#d0d7e0",
      ambient: 0.5,
      envPreset: "city",
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
      ambient: 0.28,
      envPreset: "night",
    };
  }
  if (category === "lobby" || category === "signage") {
    return {
      floor: MAT.tile,
      wall: "#f3f1ec",
      wallFront: "#d8d2c8",
      ceiling: "#ffffff",
      trim: MAT.metalDark,
      fog: "#d6d3cd",
      ambient: 0.5,
      envPreset: "lobby",
    };
  }
  if (category === "residential") {
    return {
      floor: MAT.wood,
      wall: "#f3f0ea",
      wallFront: "#e2dbd0",
      ceiling: "#faf9f6",
      trim: MAT.woodDark,
      fog: "#d9d0c2",
      ambient: 0.42,
      envPreset: "apartment",
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
      ambient: 0.25,
      envPreset: "warehouse",
    };
  }
  return {
    floor: MAT.carpet,
    wall: MAT.wall,
    wallFront: MAT.wallAccent,
    ceiling: "#f8fafc",
    trim: MAT.woodDark,
    fog: "#c5d0dc",
    ambient: 0.48,
    envPreset: "studio",
  };
}
