/**
 * 来源：vendor/infinite-canvas（tigerowo/infinite-canvas，AGPL-3.0）— D12 画布 v2 移植
 * persist key 换为 anygen 命名空间
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { CanvasColorTheme } from "@/lib/canvas-theme";

export type ThemeName = CanvasColorTheme;

type ThemeStore = {
    theme: ThemeName;
    setTheme: (theme: ThemeName) => void;
};

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            theme: "dark",
            setTheme: (theme) => set({ theme }),
        }),
        { name: "anygen:canvas:theme_store" },
    ),
);
