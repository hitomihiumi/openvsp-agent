const designStore = {};

export function getDesignStore() {
  return designStore;
}

export function getDesign(designId) {
  return designStore[designId] || null;
}

export function setDesign(designId, data) {
  designStore[designId] = { ...designStore[designId], ...data };
}

export function getAllDesigns() {
  return { ...designStore };
}
