/**
 * Plugin Vectorize Module Runtime
 *
 * Converts raster images to vector SVG format using color quantization and path tracing.
 * Based on Raster2Vector algorithms.
 */

import type { RuntimeContext, RuntimeModule } from '../../src/module-types';

// Module-level context reference
let ctx: RuntimeContext;

// ============================================
// Type Definitions
// ============================================

interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface Point {
  x: number;
  y: number;
}

interface ShapeData {
  path: string;
  color: Color;
  area: number;
  isBackground: boolean;
}

type QualityLevel = 'fast' | 'balanced' | 'high' | 'detailed';

interface ImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface ColorBox {
  colors: Color[];
  rMin: number;
  rMax: number;
  gMin: number;
  gMax: number;
  bMin: number;
  bMax: number;
}

// ============================================
// Color Quantization
// ============================================

function createColorBox(colors: Color[]): ColorBox {
  let rMin = 255, rMax = 0;
  let gMin = 255, gMax = 0;
  let bMin = 255, bMax = 0;

  for (const color of colors) {
    rMin = Math.min(rMin, color.r);
    rMax = Math.max(rMax, color.r);
    gMin = Math.min(gMin, color.g);
    gMax = Math.max(gMax, color.g);
    bMin = Math.min(bMin, color.b);
    bMax = Math.max(bMax, color.b);
  }

  return { colors, rMin, rMax, gMin, gMax, bMin, bMax };
}

function getLongestAxis(box: ColorBox): 'r' | 'g' | 'b' {
  const rRange = box.rMax - box.rMin;
  const gRange = box.gMax - box.gMin;
  const bRange = box.bMax - box.bMin;

  if (rRange >= gRange && rRange >= bRange) return 'r';
  if (gRange >= rRange && gRange >= bRange) return 'g';
  return 'b';
}

function splitBox(box: ColorBox): [ColorBox, ColorBox] {
  const axis = getLongestAxis(box);
  const sorted = [...box.colors].sort((a, b) => a[axis] - b[axis]);
  const mid = Math.floor(sorted.length / 2);

  return [
    createColorBox(sorted.slice(0, mid)),
    createColorBox(sorted.slice(mid))
  ];
}

function getAverageColor(box: ColorBox): Color {
  const count = box.colors.length;

  // Guard against empty box
  if (count === 0) {
    return { r: 0, g: 0, b: 0, a: 255 };
  }

  let r = 0, g = 0, b = 0, a = 0;

  for (const color of box.colors) {
    r += color.r;
    g += color.g;
    b += color.b;
    a += color.a;
  }

  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
    a: Math.round(a / count)
  };
}

function colorDistance(c1: Color, c2: Color): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function selectDiverseColors(candidates: Color[], count: number): Color[] {
  if (candidates.length <= count) return candidates;
  if (count <= 0) return [];

  const selected: Color[] = [];
  const used = new Set<number>();

  selected.push(candidates[0]);
  used.add(0);

  while (selected.length < count) {
    let bestIdx = -1;
    let bestMinDist = -1;

    for (let i = 0; i < candidates.length; i++) {
      if (used.has(i)) continue;

      let minDist = Infinity;
      for (const sel of selected) {
        const d = colorDistance(candidates[i], sel);
        if (d < minDist) minDist = d;
      }

      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;

    selected.push(candidates[bestIdx]);
    used.add(bestIdx);
  }

  return selected;
}

function medianCutQuantization(imageData: ImageData, colorCount: number): Color[] {
  const { data, width, height } = imageData;
  const colors: Color[] = [];

  // Sample pixels
  const totalPixels = data.length / 4;
  const step = Math.max(1, Math.floor(totalPixels / 50000));

  for (let i = 0; i < data.length; i += 4 * step) {
    if (data[i + 3] > 128) {
      colors.push({
        r: data[i],
        g: data[i + 1],
        b: data[i + 2],
        a: 255
      });
    }
  }

  // Boost edge colors for text preservation
  const edgeStep = Math.max(1, Math.floor(totalPixels / 30000));
  for (let y = 1; y < height - 1; y += Math.max(1, Math.floor(edgeStep / width))) {
    for (let x = 1; x < width - 1; x += 2) {
      const idx = (y * width + x) * 4;
      const idxLeft = idx - 4;
      const idxRight = idx + 4;
      const idxUp = idx - width * 4;
      const idxDown = idx + width * 4;

      const dr = Math.abs(data[idxRight] - data[idxLeft]) + Math.abs(data[idxDown] - data[idxUp]);
      const dg = Math.abs(data[idxRight + 1] - data[idxLeft + 1]) + Math.abs(data[idxDown + 1] - data[idxUp + 1]);
      const db = Math.abs(data[idxRight + 2] - data[idxLeft + 2]) + Math.abs(data[idxDown + 2] - data[idxUp + 2]);
      const gradient = dr + dg + db;

      if (gradient > 100 && data[idx + 3] > 128) {
        const edgeColor = {
          r: data[idx],
          g: data[idx + 1],
          b: data[idx + 2],
          a: 255
        };
        colors.push(edgeColor);
        colors.push(edgeColor);
      }
    }
  }

  if (colors.length === 0) {
    return [{ r: 0, g: 0, b: 0, a: 255 }];
  }

  const candidateCount = Math.min(colorCount * 3, colors.length);

  // Median cut algorithm
  let boxes: ColorBox[] = [createColorBox(colors)];

  while (boxes.length < candidateCount) {
    let maxIndex = 0;
    let maxCount = 0;

    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].colors.length > maxCount) {
        maxCount = boxes[i].colors.length;
        maxIndex = i;
      }
    }

    if (maxCount <= 1) break;

    const [box1, box2] = splitBox(boxes[maxIndex]);
    boxes.splice(maxIndex, 1, box1, box2);
  }

  const candidatePalette = boxes.map(getAverageColor);
  return selectDiverseColors(candidatePalette, colorCount);
}

function findClosestColor(color: Color, palette: Color[]): number {
  let minDist = Infinity;
  let closestIndex = 0;

  for (let i = 0; i < palette.length; i++) {
    const dist = colorDistance(color, palette[i]);
    if (dist < minDist) {
      minDist = dist;
      closestIndex = i;
    }
  }

  return closestIndex;
}

function quantizeImage(imageData: ImageData, palette: Color[]): Uint8Array {
  const data = imageData.data;
  const result = new Uint8Array(data.length / 4);

  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i / 4;
    const color: Color = {
      r: data[i],
      g: data[i + 1],
      b: data[i + 2],
      a: data[i + 3]
    };

    if (color.a < 128) {
      result[pixelIndex] = 255; // Transparent marker
    } else {
      result[pixelIndex] = findClosestColor(color, palette);
    }
  }

  return result;
}

function denoiseQuantized(
  quantized: Uint8Array,
  width: number,
  height: number,
  iterations: number = 1
): Uint8Array {
  let current = quantized;

  for (let i = 0; i < iterations; i++) {
    const next = new Uint8Array(current.length);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;

        const counts = new Map<number, number>();
        let maxCount = 0;
        let majorityColor = current[idx];

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy;
            const nx = x + dx;

            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = ny * width + nx;
              const color = current[nIdx];
              const newCount = (counts.get(color) || 0) + 1;
              counts.set(color, newCount);

              if (newCount > maxCount) {
                maxCount = newCount;
                majorityColor = color;
              }
            }
          }
        }

        next[idx] = majorityColor;
      }
    }
    current = next;
  }

  return current;
}

function cleanSpeckles(
  quantized: Uint8Array,
  width: number,
  height: number,
  minArea: number
): Uint8Array {
  if (minArea <= 0) return quantized;

  const visited = new Uint8Array(width * height);
  const result = new Uint8Array(quantized);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      if (visited[idx] === 1) continue;

      const color = result[idx];
      const regionIndices: number[] = [];
      const borderNeighborColors: number[] = [];
      const stack = [idx];
      visited[idx] = 1;
      regionIndices.push(idx);

      let ptr = 0;
      while (ptr < stack.length) {
        const currIdx = stack[ptr++];
        const cx = currIdx % width;
        const cy = Math.floor(currIdx / width);

        const neighbors = [
          { nx: cx + 1, ny: cy },
          { nx: cx - 1, ny: cy },
          { nx: cx, ny: cy + 1 },
          { nx: cx, ny: cy - 1 }
        ];

        for (const { nx, ny } of neighbors) {
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = ny * width + nx;
            const neighborColor = result[nIdx];

            if (visited[nIdx] === 0 && neighborColor === color) {
              visited[nIdx] = 1;
              stack.push(nIdx);
              regionIndices.push(nIdx);
            } else if (neighborColor !== color && neighborColor !== 255) {
              borderNeighborColors.push(neighborColor);
            }
          }
        }
      }

      if (regionIndices.length < minArea && borderNeighborColors.length > 0) {
        const colorCounts = new Map<number, number>();
        for (const nc of borderNeighborColors) {
          colorCounts.set(nc, (colorCounts.get(nc) || 0) + 1);
        }

        let maxCount = 0;
        let replacementColor = color;
        for (const [c, count] of colorCounts) {
          if (count > maxCount) {
            maxCount = count;
            replacementColor = c;
          }
        }

        if (replacementColor !== color) {
          for (const rIdx of regionIndices) {
            result[rIdx] = replacementColor;
          }
        }
      }
    }
  }

  return result;
}

function adaptiveClean(
  quantized: Uint8Array,
  width: number,
  height: number,
  colorCount: number,
  baseMinArea: number,
  qualityLevel: QualityLevel = 'balanced'
): Uint8Array {
  let result = quantized;

  if (qualityLevel === 'detailed') {
    result = denoiseQuantized(result, width, height, 2);
    const tinyArea = Math.max(3, Math.floor(baseMinArea * 0.3));
    result = cleanSpeckles(result, width, height, tinyArea);
    return result;
  }

  if (qualityLevel === 'fast') {
    result = denoiseQuantized(result, width, height, 2);
    result = cleanSpeckles(result, width, height, baseMinArea);
    return result;
  }

  if (qualityLevel === 'balanced') {
    const denoiseIterations = Math.min(4, Math.ceil(colorCount / 10) + 2);
    result = denoiseQuantized(result, width, height, denoiseIterations);
    const scaledMinArea = Math.ceil(baseMinArea * (1 + colorCount / 32));
    result = cleanSpeckles(result, width, height, scaledMinArea);
    result = denoiseQuantized(result, width, height, 1);
    return result;
  }

  // High quality
  const colorFactor = Math.pow(colorCount / 8, 1.5);
  const denoiseIterations = Math.min(8, Math.ceil(colorFactor * 2));
  const scaledMinArea = Math.ceil(baseMinArea * Math.max(1, colorFactor));

  result = denoiseQuantized(result, width, height, denoiseIterations);
  result = cleanSpeckles(result, width, height, scaledMinArea);
  result = denoiseQuantized(result, width, height, 2);

  return result;
}

// ============================================
// Path Tracing
// ============================================

const MOORE_NEIGHBORS = [
  { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
  { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 }
];

function traceMaskBoundary(
  mask: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number
): Point[] {
  const boundary: Point[] = [];
  let curX = startX;
  let curY = startY;

  boundary.push({ x: curX, y: curY });

  let prevX = curX - 1;
  let prevY = curY;

  let iter = 0;
  const maxIter = width * height * 2;

  const isInside = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    return mask[y * width + x] === 1;
  };

  while (iter < maxIter) {
    let startNeighborIdx = 0;
    const dx = prevX - curX;
    const dy = prevY - curY;

    for (let i = 0; i < 8; i++) {
      if (MOORE_NEIGHBORS[i].x === dx && MOORE_NEIGHBORS[i].y === dy) {
        startNeighborIdx = i;
        break;
      }
    }

    let nextX = -1, nextY = -1;
    let foundNext = false;

    for (let i = 1; i <= 8; i++) {
      const idx = (startNeighborIdx + i) % 8;
      const nx = curX + MOORE_NEIGHBORS[idx].x;
      const ny = curY + MOORE_NEIGHBORS[idx].y;

      if (isInside(nx, ny)) {
        nextX = nx;
        nextY = ny;
        foundNext = true;
        break;
      }
    }

    if (!foundNext) break;

    boundary.push({ x: nextX, y: nextY });

    if (nextX === startX && nextY === startY) break;

    prevX = curX;
    prevY = curY;
    curX = nextX;
    curY = nextY;
    iter++;
  }

  return boundary;
}

function getAngle(p1: Point, p2: Point, p3: Point): number {
  const v1x = p1.x - p2.x;
  const v1y = p1.y - p2.y;
  const v2x = p3.x - p2.x;
  const v2y = p3.y - p2.y;

  const dot = v1x * v2x + v1y * v2y;
  const cross = v1x * v2y - v1y * v2x;

  return Math.atan2(Math.abs(cross), dot);
}

function detectCorners(points: Point[], angleThreshold: number = Math.PI / 4): Set<number> {
  const corners = new Set<number>();
  if (points.length < 3) return corners;

  for (let i = 0; i < points.length; i++) {
    const p1 = points[(i - 1 + points.length) % points.length];
    const p2 = points[i];
    const p3 = points[(i + 1) % points.length];

    const angle = getAngle(p1, p2, p3);

    if (angle < Math.PI - angleThreshold) {
      corners.add(i);
    }
  }

  return corners;
}

function smoothPathPreservingCorners(
  points: Point[],
  corners: Set<number>,
  iterations: number = 2,
  weight: number = 0.25
): Point[] {
  if (points.length < 3) return points;

  let current = [...points];

  for (let iter = 0; iter < iterations; iter++) {
    const next: Point[] = [];

    for (let i = 0; i < current.length; i++) {
      if (corners.has(i)) {
        next.push(current[i]);
      } else {
        const prev = current[(i - 1 + current.length) % current.length];
        const curr = current[i];
        const nextP = current[(i + 1) % current.length];

        next.push({
          x: curr.x * (1 - 2 * weight) + prev.x * weight + nextP.x * weight,
          y: curr.y * (1 - 2 * weight) + prev.y * weight + nextP.y * weight
        });
      }
    }

    current = next;
  }

  return current;
}

function simplifyPath(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points;

  const sqDistToSegment = (p: Point, p1: Point, p2: Point): number => {
    let x = p1.x, y = p1.y;
    let dx = p2.x - x, dy = p2.y - y;

    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = p2.x;
        y = p2.y;
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }

    dx = p.x - x;
    dy = p.y - y;
    return dx * dx + dy * dy;
  };

  const simplifySection = (start: number, end: number): Point[] => {
    let maxDist = 0;
    let maxIdx = 0;

    for (let i = start + 1; i < end; i++) {
      const dist = sqDistToSegment(points[i], points[start], points[end]);
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }

    if (maxDist > tolerance * tolerance) {
      const left = simplifySection(start, maxIdx);
      const right = simplifySection(maxIdx, end);
      return [...left.slice(0, -1), ...right];
    }

    return [points[start], points[end]];
  };

  return simplifySection(0, points.length - 1);
}

function calculateSignedArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return area / 2;
}

function ensureClockwise(points: Point[]): Point[] {
  const area = calculateSignedArea(points);
  if (area < 0) {
    return [...points].reverse();
  }
  return points;
}

function refinePathMultiStage(
  rawPoints: Point[],
  smoothness: number,
  qualityLevel: QualityLevel = 'balanced'
): Point[] {
  if (rawPoints.length < 3) return rawPoints;

  let points = rawPoints;

  const cornerAngleThreshold = Math.PI / 3;
  const corners = detectCorners(points, cornerAngleThreshold);

  if (qualityLevel === 'fast') {
    const simplified = simplifyPath(points, Math.max(1.0, smoothness * 0.3));
    if (simplified.length < 3) return rawPoints;
    return simplified;
  }

  if (qualityLevel === 'detailed') {
    points = smoothPathPreservingCorners(points, corners, 1, 0.02);
    points = simplifyPath(points, Math.max(0.1, smoothness * 0.05));
    if (points.length < 3) return rawPoints;
    return points;
  }

  if (qualityLevel === 'balanced') {
    points = smoothPathPreservingCorners(points, corners, 1, 0.12);
    points = simplifyPath(points, Math.max(0.5, smoothness * 0.2));
    if (points.length < 3) return rawPoints;
    return points;
  }

  // High quality
  points = smoothPathPreservingCorners(points, corners, 1, 0.15);
  points = simplifyPath(points, Math.max(0.4, smoothness * 0.15));

  if (points.length < 3) return rawPoints;
  return points;
}

function pointsToSvgPathOptimized(points: Point[], corners: Set<number>): string {
  if (points.length < 2) return '';

  const r = Math.round;

  if (points.length < 3) {
    return `M${r(points[0].x)},${r(points[0].y)}L${r(points[1].x)},${r(points[1].y)}Z`;
  }

  if (points.length < 5) {
    let d = `M${r(points[0].x)},${r(points[0].y)}`;
    for (let i = 1; i < points.length; i++) {
      d += `L${r(points[i].x)},${r(points[i].y)}`;
    }
    return d + 'Z';
  }

  const distToSegmentSquared = (p: Point, v: Point, w: Point): number => {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return (p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2;
  };

  let d = `M${r(points[0].x)},${r(points[0].y)}`;

  for (let i = 0; i < points.length; i++) {
    const p0 = points[(i - 1 + points.length) % points.length];
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const p3 = points[(i + 2) % points.length];

    const isCorner1 = corners.has(i);
    const isCorner2 = corners.has((i + 1) % points.length);

    const tension1 = isCorner1 ? 0.1 : 0.17;
    const tension2 = isCorner2 ? 0.1 : 0.17;

    const cp1x = p1.x + (p2.x - p0.x) * tension1;
    const cp1y = p1.y + (p2.y - p0.y) * tension1;
    const cp2x = p2.x - (p3.x - p1.x) * tension2;
    const cp2y = p2.y - (p3.y - p1.y) * tension2;

    const cp1 = { x: cp1x, y: cp1y };
    const cp2 = { x: cp2x, y: cp2y };
    const errorThreshold = 0.5;

    if (distToSegmentSquared(cp1, p1, p2) < errorThreshold &&
        distToSegmentSquared(cp2, p1, p2) < errorThreshold) {
      d += `L${r(p2.x)},${r(p2.y)}`;
    } else {
      d += `C${r(cp1x)},${r(cp1y)} ${r(cp2x)},${r(cp2y)} ${r(p2.x)},${r(p2.y)}`;
    }
  }

  return d + 'Z';
}

function closeColorMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number = 2
): Uint8Array {
  // Dilate
  let result = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 1) {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              result[ny * width + nx] = 1;
            }
          }
        }
      }
    }
  }

  // Erode
  const dilated = result;
  result = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let allSet = true;
      outer: for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height || dilated[ny * width + nx] === 0) {
            allSet = false;
            break outer;
          }
        }
      }
      if (allSet) {
        result[y * width + x] = 1;
      }
    }
  }

  return result;
}

function traceAllColors(
  quantized: Uint8Array,
  width: number,
  height: number,
  palette: Color[],
  smoothness: number,
  minArea: number = 1,
  qualityLevel: QualityLevel = 'balanced',
  mergeNeighbors: boolean = true
): ShapeData[] {
  const result: ShapeData[] = [];

  const colorsToTrace = palette.map((_, i) => i);

  const mergeRadius = mergeNeighbors
    ? (qualityLevel === 'fast' ? 4 : qualityLevel === 'balanced' ? 2 : qualityLevel === 'high' ? 1 : 0)
    : 0;

  for (const colorIndex of colorsToTrace) {
    if (colorIndex >= palette.length || colorIndex === 255) continue;

    const colorMask = new Uint8Array(width * height);
    for (let i = 0; i < quantized.length; i++) {
      if (quantized[i] === colorIndex) {
        colorMask[i] = 1;
      }
    }

    const processedMask = mergeRadius > 0
      ? closeColorMask(colorMask, width, height, mergeRadius)
      : colorMask;

    const visited = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;

        if (visited[idx]) continue;

        if (processedMask[idx] === 1) {
          const boundary = traceMaskBoundary(processedMask, width, height, x, y);

          let pixelCount = 0;
          const stack = [idx];
          visited[idx] = 1;

          if (colorMask[idx] === 1) {
            pixelCount++;
          }

          while (stack.length > 0) {
            const pIdx = stack.pop()!;
            const px = pIdx % width;
            const py = Math.floor(pIdx / width);

            const neighbors = [
              { nx: px + 1, ny: py },
              { nx: px - 1, ny: py },
              { nx: px, ny: py + 1 },
              { nx: px, ny: py - 1 },
              { nx: px + 1, ny: py + 1 },
              { nx: px - 1, ny: py - 1 },
              { nx: px - 1, ny: py + 1 },
              { nx: px + 1, ny: py - 1 }
            ];

            for (const { nx, ny } of neighbors) {
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIdx = ny * width + nx;
                if (!visited[nIdx] && processedMask[nIdx] === 1) {
                  visited[nIdx] = 1;
                  if (colorMask[nIdx] === 1) {
                    pixelCount++;
                  }
                  stack.push(nIdx);
                }
              }
            }
          }

          let touchesEdge = false;
          const edgeMargin = 5;
          for (const p of boundary) {
            if (p.x <= edgeMargin || p.x >= width - edgeMargin - 1 ||
                p.y <= edgeMargin || p.y >= height - edgeMargin - 1) {
              touchesEdge = true;
              break;
            }
          }

          const isBackground = touchesEdge;

          if (pixelCount >= minArea && boundary.length > 2) {
            let refined = refinePathMultiStage(boundary, smoothness, qualityLevel);
            refined = ensureClockwise(refined);

            const corners = detectCorners(refined, Math.PI / 3);
            const pathStr = pointsToSvgPathOptimized(refined, corners);

            if (pathStr) {
              result.push({
                color: palette[colorIndex],
                path: pathStr,
                area: pixelCount,
                isBackground
              });
            }
          }
        }
      }
    }
  }

  return result;
}

// ============================================
// SVG Generation
// ============================================

function colorToHex(color: Color): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

interface ColorGroup {
  color: Color;
  foregroundPaths: string[];
  backgroundPaths: string[];
  foregroundArea: number;
  backgroundArea: number;
  totalArea: number;
}

function groupShapesByColor(shapes: ShapeData[]): Map<string, ColorGroup> {
  const groups = new Map<string, ColorGroup>();

  for (const shape of shapes) {
    const hex = colorToHex(shape.color);

    if (!groups.has(hex)) {
      groups.set(hex, {
        color: shape.color,
        foregroundPaths: [],
        backgroundPaths: [],
        foregroundArea: 0,
        backgroundArea: 0,
        totalArea: 0
      });
    }

    const group = groups.get(hex)!;

    if (shape.isBackground) {
      group.backgroundPaths.push(shape.path);
      group.backgroundArea += shape.area;
    } else {
      group.foregroundPaths.push(shape.path);
      group.foregroundArea += shape.area;
    }
    group.totalArea += shape.area;
  }

  return groups;
}

function generateSvg(
  shapes: ShapeData[],
  width: number,
  height: number,
  removeBackground: boolean = false
): string {
  const colorGroups = groupShapesByColor(shapes);

  let maxBackgroundArea = 0;
  let dominantHex = '#ffffff';

  for (const [hex, group] of colorGroups) {
    if (group.backgroundArea > maxBackgroundArea) {
      maxBackgroundArea = group.backgroundArea;
      dominantHex = hex;
    }
  }

  if (maxBackgroundArea === 0) {
    let maxArea = 0;
    for (const [hex, group] of colorGroups) {
      if (group.totalArea > maxArea) {
        maxArea = group.totalArea;
        dominantHex = hex;
      }
    }
  }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;
  svg += `  <title>Vectorized Image</title>\n`;
  svg += `  <desc>Generated with Zipp Vectorize - ${colorGroups.size} colors</desc>\n`;

  if (!removeBackground) {
    svg += `  <rect id="background" width="100%" height="100%" fill="${dominantHex}"/>\n`;
  }

  svg += `  <g id="content">\n`;

  if (removeBackground) {
    const allShapesFiltered: Array<{ hex: string; path: string; area: number }> = [];
    const smallShapeThreshold = width * height * 0.05;

    for (const shape of shapes) {
      const hex = colorToHex(shape.color);
      const isSmallBackground = shape.isBackground && shape.area < smallShapeThreshold;
      const isDominantBg = hex === dominantHex;

      if (!shape.isBackground || (isSmallBackground && !isDominantBg)) {
        allShapesFiltered.push({
          hex,
          path: shape.path,
          area: shape.area
        });
      }
    }

    if (allShapesFiltered.length === 0) {
      for (const shape of shapes) {
        const hex = colorToHex(shape.color);
        if (hex !== dominantHex) {
          allShapesFiltered.push({
            hex,
            path: shape.path,
            area: shape.area
          });
        }
      }
    }

    allShapesFiltered.sort((a, b) => b.area - a.area);

    svg += `    <g id="shapes-layer">\n`;
    for (const { hex, path } of allShapesFiltered) {
      svg += `      <path fill="${hex}" stroke="${hex}" stroke-width="2" stroke-linejoin="round" d="${path}"/>\n`;
    }
    svg += `    </g>\n`;

  } else {
    const allShapesFlat: Array<{ hex: string; path: string; area: number }> = [];

    for (const shape of shapes) {
      const hex = colorToHex(shape.color);
      allShapesFlat.push({
        hex,
        path: shape.path,
        area: shape.area
      });
    }

    allShapesFlat.sort((a, b) => b.area - a.area);

    svg += `    <g id="shapes-layer">\n`;
    for (const { hex, path } of allShapesFlat) {
      svg += `      <path fill="${hex}" stroke="${hex}" stroke-width="0.5" stroke-linejoin="round" d="${path}"/>\n`;
    }
    svg += `    </g>\n`;
  }

  svg += `  </g>\n`;
  svg += `</svg>`;
  return svg;
}

// ============================================
// SVG Optimizer
// ============================================

function optimizeSvg(svgContent: string): string {
  let result = svgContent;

  // Remove XML declaration
  result = result.replace(/<\?xml[^?]*\?>\s*/gi, '');

  // Remove comments
  result = result.replace(/<!--[\s\S]*?-->/g, '');

  // Optimize path data
  result = result.replace(/\bd="([^"]+)"/g, (_match, pathData) => {
    const optimizedPath = optimizePathData(pathData);
    return `d="${optimizedPath}"`;
  });

  // Remove unnecessary whitespace
  result = result.replace(/\s+>/g, '>');
  result = result.replace(/>\s+</g, '><');
  result = result.replace(/\n\s*/g, '');
  result = result.replace(/\s{2,}/g, ' ');

  return result.trim();
}

function optimizePathData(pathData: string): string {
  // If path contains curves (C, Q, S, T, A commands), skip optimization
  // as these require more complex handling
  if (/[CQSTAcqsta]/.test(pathData)) {
    // For curved paths, just do basic cleanup: remove extra spaces
    return pathData.replace(/\s+/g, ' ').replace(/,\s+/g, ',').trim();
  }

  const points: Array<{cmd: string, x: number, y: number}> = [];

  const moveMatch = pathData.match(/M(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (!moveMatch) return pathData;

  points.push({cmd: 'M', x: Math.round(parseFloat(moveMatch[1])), y: Math.round(parseFloat(moveMatch[2]))});

  const lineRegex = /L(-?\d+\.?\d*),(-?\d+\.?\d*)/g;
  let match;
  while ((match = lineRegex.exec(pathData)) !== null) {
    points.push({cmd: 'L', x: Math.round(parseFloat(match[1])), y: Math.round(parseFloat(match[2]))});
  }

  if (points.length < 2) return pathData;

  // Remove duplicate consecutive points
  const deduped: typeof points = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = deduped[deduped.length - 1];
    const curr = points[i];
    if (curr.x !== prev.x || curr.y !== prev.y) {
      deduped.push(curr);
    }
  }

  // Build optimized path using relative commands
  let result = `M${deduped[0].x},${deduped[0].y}`;
  let curX = deduped[0].x;
  let curY = deduped[0].y;

  for (let i = 1; i < deduped.length; i++) {
    const dx = deduped[i].x - curX;
    const dy = deduped[i].y - curY;

    if (dx === 0 && dy === 0) continue;

    if (dy === 0) {
      result += `h${dx}`;
    } else if (dx === 0) {
      result += `v${dy}`;
    } else {
      result += `l${dx},${dy}`;
    }

    curX = deduped[i].x;
    curY = deduped[i].y;
  }

  if (pathData.toUpperCase().includes('Z')) {
    result += 'Z';
  }

  return result;
}

// ============================================
// Image Loading Helper
// ============================================

async function loadImageData(imageInput: unknown): Promise<ImageData> {
  let imageDataUrl: string | null = null;

  ctx.log('info', `[Vectorize] loadImageData input type: ${typeof imageInput}`);
  if (typeof imageInput === 'string') {
    ctx.log('info', `[Vectorize] Input string length: ${imageInput.length}, starts with: ${imageInput.substring(0, 50)}`);
  }

  // Extract image source
  if (typeof imageInput === 'string') {
    const str = imageInput;
    if (str.startsWith('data:')) {
      ctx.log('info', '[Vectorize] Input is data URL');
      imageDataUrl = str;
    } else if (str.startsWith('http://') || str.startsWith('https://')) {
      // Fetch URL
      ctx.log('info', `[Vectorize] Fetching from URL: ${str}`);
      const response = await ctx.secureFetch(str, { purpose: 'Fetch image for vectorization' });
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let j = 0; j < bytes.length; j++) {
        binary += String.fromCharCode(bytes[j]);
      }
      const base64 = btoa(binary);
      const mime = blob.type || 'image/png';
      imageDataUrl = `data:${mime};base64,${base64}`;
    } else if (str.length > 0) {
      // Local file path
      ctx.log('info', `[Vectorize] Loading local file: ${str}`);
      if (ctx.tauri) {
        try {
          let normalizedPath = str;
          if (normalizedPath.startsWith('\\\\?\\')) {
            normalizedPath = normalizedPath.substring(4);
          }
          ctx.log('info', `[Vectorize] Invoking read_file with path: ${normalizedPath}`);

          // First try regular read_file
          const fileContent = await ctx.tauri.invoke<{
            content: string;
            size: number;
            isLargeFile: boolean;
          }>('plugin:zipp-filesystem|read_file', {
            path: normalizedPath,
            readAs: 'base64',
          });

          ctx.log('info', `[Vectorize] read_file returned, content length: ${fileContent?.content?.length || 0}, isLargeFile: ${fileContent?.isLargeFile}`);

          let dataUrl: string | null = null;

          // Check if file was too large (returns __FILE_REF__)
          if (fileContent?.content === '__FILE_REF__' || fileContent?.isLargeFile) {
            ctx.log('info', `[Vectorize] Large file detected (${fileContent?.size} bytes), reading in chunks...`);

            // Read the entire file using read_chunk_content in base64 mode
            const fileSize = fileContent.size;
            const chunkSize = 3 * 1024 * 1024; // 3MB chunks (multiple of 3 for clean base64)
            const byteArrays: Uint8Array[] = [];

            for (let offset = 0; offset < fileSize; offset += chunkSize) {
              const length = Math.min(chunkSize, fileSize - offset);
              ctx.log('info', `[Vectorize] Reading chunk at offset ${offset}, length ${length}`);
              const base64Chunk = await ctx.tauri.invoke<string>('plugin:zipp-filesystem|read_chunk_content', {
                path: normalizedPath,
                start: offset,
                length: length,
                readAs: 'base64',
              });

              // Decode base64 chunk to bytes
              const binaryString = atob(base64Chunk);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              byteArrays.push(bytes);
            }

            // Concatenate all byte arrays
            const totalLength = byteArrays.reduce((sum, arr) => sum + arr.length, 0);
            const fullBytes = new Uint8Array(totalLength);
            let position = 0;
            for (const arr of byteArrays) {
              fullBytes.set(arr, position);
              position += arr.length;
            }

            // Re-encode complete bytes to base64
            let binary = '';
            for (let i = 0; i < fullBytes.length; i++) {
              binary += String.fromCharCode(fullBytes[i]);
            }
            const fullBase64 = btoa(binary);
            ctx.log('info', `[Vectorize] Read ${byteArrays.length} chunks, total bytes: ${totalLength}, base64 length: ${fullBase64.length}`);

            const ext = str.toLowerCase().split('.').pop() || 'png';
            const mimeTypes: Record<string, string> = {
              'png': 'image/png',
              'jpg': 'image/jpeg',
              'jpeg': 'image/jpeg',
              'gif': 'image/gif',
              'webp': 'image/webp',
              'bmp': 'image/bmp',
            };
            const mime = mimeTypes[ext] || 'image/png';
            dataUrl = `data:${mime};base64,${fullBase64}`;
          } else if (fileContent?.content) {
            dataUrl = fileContent.content;
            // Ensure it's a data URL
            if (!dataUrl.startsWith('data:')) {
              const ext = str.toLowerCase().split('.').pop() || 'png';
              const mimeTypes: Record<string, string> = {
                'png': 'image/png',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'gif': 'image/gif',
                'webp': 'image/webp',
                'bmp': 'image/bmp',
              };
              const mime = mimeTypes[ext] || 'image/png';
              dataUrl = `data:${mime};base64,${dataUrl}`;
            }
          }

          if (dataUrl) {
            imageDataUrl = dataUrl;
          } else {
            ctx.log('error', '[Vectorize] read_file returned empty content');
          }
        } catch (err) {
          ctx.log('error', `[Vectorize] read_file error: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        ctx.log('error', '[Vectorize] ctx.tauri not available for local file loading');
      }
    } else {
      ctx.log('error', '[Vectorize] Empty string input');
    }
  } else if (typeof imageInput === 'object' && imageInput !== null) {
    const obj = imageInput as Record<string, unknown>;
    ctx.log('info', `[Vectorize] Input is object with keys: ${Object.keys(obj).join(', ')}`);
    if (typeof obj.dataUrl === 'string') {
      imageDataUrl = obj.dataUrl;
    } else if (typeof obj.path === 'string' && ctx.tauri) {
      try {
        let normalizedPath = obj.path;
        if (normalizedPath.startsWith('\\\\?\\')) {
          normalizedPath = normalizedPath.substring(4);
        }
        ctx.log('info', `[Vectorize] Loading from object.path: ${normalizedPath}`);
        const fileContent = await ctx.tauri.invoke<{ content: string; isLargeFile: boolean }>('plugin:zipp-filesystem|read_file', {
          path: normalizedPath,
          readAs: 'base64',
        });
        if (fileContent?.content) {
          let dataUrl = fileContent.content;
          if (!dataUrl.startsWith('data:')) {
            const ext = (obj.path as string).toLowerCase().split('.').pop() || 'png';
            const mimeTypes: Record<string, string> = {
              'png': 'image/png',
              'jpg': 'image/jpeg',
              'jpeg': 'image/jpeg',
              'gif': 'image/gif',
              'webp': 'image/webp',
              'bmp': 'image/bmp',
            };
            const mime = mimeTypes[ext] || 'image/png';
            dataUrl = `data:${mime};base64,${dataUrl}`;
          }
          imageDataUrl = dataUrl;
        }
      } catch (err) {
        ctx.log('error', `[Vectorize] read_file error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } else {
    ctx.log('error', `[Vectorize] Unexpected input type: ${typeof imageInput}`);
  }

  if (!imageDataUrl) {
    throw new Error('Could not load image data');
  }

  // Decode base64 to ImageData using canvas
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      context.drawImage(img, 0, 0);
      const imageData = context.getImageData(0, 0, img.width, img.height);
      resolve(imageData);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageDataUrl!;
  });
}

// ============================================
// Main Conversion Function
// ============================================

async function convert(
  imageInput: unknown,
  outputPath: string,
  colorCount: number,
  quality: string,
  smoothness: number,
  minArea: number,
  removeBackground: boolean,
  optimize: boolean,
  nodeId: string
): Promise<string> {
  // Check for abort before starting
  if (ctx.abortSignal?.aborted) {
    ctx.log('info', '[Vectorize] Aborted by user before starting conversion');
    throw new Error('Operation aborted by user');
  }

  ctx.onNodeStatus?.(nodeId, 'running');

  ctx.log('info', `[Vectorize] Starting conversion: ${colorCount} colors, ${quality} quality`);

  try {
    // Load image data
    ctx.log('info', '[Vectorize] Loading image...');
    const imageData = await loadImageData(imageInput);
    ctx.log('info', `[Vectorize] Image loaded: ${imageData.width}x${imageData.height}`);

    // Step 1: Color quantization
    ctx.log('info', '[Vectorize] Quantizing colors...');
    const palette = medianCutQuantization(imageData, colorCount);
    ctx.log('info', `[Vectorize] Generated palette with ${palette.length} colors`);

    // Step 2: Quantize image
    let quantized = quantizeImage(imageData, palette);

    // Step 3: Clean up quantized image
    ctx.log('info', '[Vectorize] Cleaning image...');
    const qualityLevel = quality as QualityLevel;
    quantized = adaptiveClean(quantized, imageData.width, imageData.height, colorCount, minArea, qualityLevel);

    // Step 4: Trace paths
    ctx.log('info', '[Vectorize] Tracing paths...');
    const shapes = traceAllColors(
      quantized,
      imageData.width,
      imageData.height,
      palette,
      smoothness,
      minArea,
      qualityLevel,
      true
    );
    ctx.log('info', `[Vectorize] Traced ${shapes.length} shapes`);

    // Step 5: Generate SVG
    ctx.log('info', '[Vectorize] Generating SVG...');
    let svg = generateSvg(shapes, imageData.width, imageData.height, removeBackground);

    // Step 6: Optimize if requested
    if (optimize) {
      ctx.log('info', '[Vectorize] Optimizing SVG...');
      svg = optimizeSvg(svg);
    }

    // Step 7: Save to file
    let finalOutputPath = outputPath;
    if (!finalOutputPath && ctx.tauri) {
      // Generate output path
      let filename = 'vectorized';
      if (typeof imageInput === 'string' && !imageInput.startsWith('data:') && !imageInput.startsWith('http')) {
        const parts = imageInput.replace(/\\/g, '/').split('/');
        const srcFilename = parts.pop() || 'image';
        filename = srcFilename.split('.')[0];
      } else {
        filename = `vectorized_${Date.now()}`;
      }

      const downloadsPath = await ctx.tauri.invoke<string>('plugin:zipp-filesystem|get_downloads_path').catch(() => '');
      if (downloadsPath) {
        finalOutputPath = `${downloadsPath}/${filename}.svg`;
      } else {
        finalOutputPath = `${filename}.svg`;
      }
    }

    if (!finalOutputPath.endsWith('.svg')) {
      finalOutputPath = `${finalOutputPath}.svg`;
    }

    ctx.log('info', `[Vectorize] Saving to: ${finalOutputPath}`);

    if (ctx.tauri) {
      await ctx.tauri.invoke<string>('plugin:zipp-filesystem|write_file', {
        path: finalOutputPath,
        content: svg,
        contentType: 'text',
        createDirs: true,
      });
    } else {
      // Browser fallback: trigger download
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = finalOutputPath.split('/').pop() || 'vectorized.svg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    ctx.onNodeStatus?.(nodeId, 'completed');
    ctx.log('success', `[Vectorize] Conversion complete: ${finalOutputPath}`);

    return finalOutputPath;

  } catch (error) {
    ctx.onNodeStatus?.(nodeId, 'error');
    const errMsg = error instanceof Error ? error.message : 'Unknown error';

    if (error instanceof Error && (error.name === 'AbortError' || errMsg.includes('aborted'))) {
      return '__ABORT__';
    }

    ctx.log('error', `[Vectorize] Error: ${errMsg}`);
    throw error;
  }
}

// ============================================
// Runtime Module Export
// ============================================

const PluginVectorizeRuntime: RuntimeModule = {
  name: 'Vectorize',

  async init(context: RuntimeContext): Promise<void> {
    ctx = context;
    ctx?.log?.('info', '[Plugin Vectorize] Module initialized');
  },

  methods: {
    convert,
  },

  async cleanup(): Promise<void> {
    ctx?.log?.('info', '[Plugin Vectorize] Module cleanup');
  },
};

export default PluginVectorizeRuntime;
