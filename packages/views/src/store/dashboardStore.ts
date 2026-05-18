"use client";

import { create } from "zustand";
import type { DateRange } from "../types";

interface DashboardStore {
  range: DateRange;
  setRange: (range: DateRange) => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  range: "14",
  setRange: (range) => set({ range }),
}));
