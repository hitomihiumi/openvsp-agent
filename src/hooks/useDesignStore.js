import { create } from 'zustand';

export const useDesignStore = create((set, get) => ({
  designs: {},
  selectedDesignId: null,
  report: null,

  addDesign: (designId, data) =>
    set((state) => ({
      designs: {
        ...state.designs,
        [designId]: { ...state.designs[designId], ...data },
      },
    })),

  updateDesign: (designId, data) =>
    set((state) => ({
      designs: {
        ...state.designs,
        [designId]: { ...state.designs[designId], ...data },
      },
    })),

  setSelectedDesign: (designId) => set({ selectedDesignId: designId }),

  setReport: (report) =>
    set({
      report,
      selectedDesignId: report?.selectedDesignId || null,
    }),

  clearDesigns: () => set({ designs: {}, selectedDesignId: null, report: null }),
}));
