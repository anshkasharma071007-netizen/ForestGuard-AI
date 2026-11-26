export type ImageSize = { width: number; height: number };
export type ImageBox = readonly [left: number, top: number, right: number, bottom: number];
export type IdentificationCandidate = { speciesId: string; score?: number };

export type AnimalPrediction = {
  id: string;
  speciesId: string | null;
  certainty: 'detected' | 'uncertain' | 'unsupported';
  box: ImageBox | null;
  score?: number;
  alternatives: readonly IdentificationCandidate[];
};

export type IdentificationResult = {
  // Boxes use pixels in the upright original, before any display scaling.
  image: ImageSize;
  animals: readonly AnimalPrediction[];
  annotatedImageUri?: string;
};

export type IdentificationState =
  | { kind: 'idle' }
  | { kind: 'analyzing' }
  | { kind: 'detected' | 'uncertain'; result: IdentificationResult }
  | { kind: 'no-detection' }
  | { kind: 'error' };

export function containImage(image: ImageSize, frame: ImageSize) {
  if (![image.width, image.height, frame.width, frame.height].every((size) => Number.isFinite(size) && size > 0)) return null;
  const scale = Math.min(frame.width / image.width, frame.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { left: (frame.width - width) / 2, top: (frame.height - height) / 2, width, height, scale };
}

export function projectBox(box: ImageBox, image: ImageSize, frame: ImageSize) {
  const fit = containImage(image, frame);
  if (!fit || !box.every(Number.isFinite)) return null;
  const [x1, y1, x2, y2] = box;
  const left = Math.max(0, x1);
  const top = Math.max(0, y1);
  const right = Math.min(image.width, x2);
  const bottom = Math.min(image.height, y2);
  if (right <= left || bottom <= top) return null;
  return {
    left: fit.left + left * fit.scale,
    top: fit.top + top * fit.scale,
    width: (right - left) * fit.scale,
    height: (bottom - top) * fit.scale,
  };
}
