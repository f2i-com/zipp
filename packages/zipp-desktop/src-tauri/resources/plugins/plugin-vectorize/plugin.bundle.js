"use strict";
var __PLUGIN_EXPORTS__ = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // external-global:react
  var require_react = __commonJS({
    "external-global:react"(exports, module) {
      module.exports = __PLUGIN_GLOBALS__.React;
    }
  });

  // external-global:@xyflow/react
  var require_react2 = __commonJS({
    "external-global:@xyflow/react"(exports, module) {
      module.exports = __PLUGIN_GLOBALS__.ReactFlow;
    }
  });

  // external-global:zipp-ui-components
  var require_zipp_ui_components = __commonJS({
    "external-global:zipp-ui-components"(exports, module) {
      module.exports = __PLUGIN_GLOBALS__.ZippUIComponents;
    }
  });

  // external-global:react/jsx-runtime
  var require_jsx_runtime = __commonJS({
    "external-global:react/jsx-runtime"(exports, module) {
      module.exports = __PLUGIN_GLOBALS__.ReactJSXRuntime;
    }
  });

  // ../zipp-core/modules/plugin-vectorize/_plugin_entry.ts
  var plugin_entry_exports = {};
  __export(plugin_entry_exports, {
    compiler: () => compiler_default,
    components: () => components,
    runtime: () => runtime_default
  });

  // ../zipp-core/modules/plugin-vectorize/runtime.ts
  var ctx;
  function createColorBox(colors) {
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
  function getLongestAxis(box) {
    const rRange = box.rMax - box.rMin;
    const gRange = box.gMax - box.gMin;
    const bRange = box.bMax - box.bMin;
    if (rRange >= gRange && rRange >= bRange) return "r";
    if (gRange >= rRange && gRange >= bRange) return "g";
    return "b";
  }
  function splitBox(box) {
    const axis = getLongestAxis(box);
    const sorted = [...box.colors].sort((a, b) => a[axis] - b[axis]);
    const mid = Math.floor(sorted.length / 2);
    return [
      createColorBox(sorted.slice(0, mid)),
      createColorBox(sorted.slice(mid))
    ];
  }
  function getAverageColor(box) {
    const count = box.colors.length;
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
  function colorDistance(c1, c2) {
    const dr = c1.r - c2.r;
    const dg = c1.g - c2.g;
    const db = c1.b - c2.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }
  function selectDiverseColors(candidates, count) {
    if (candidates.length <= count) return candidates;
    if (count <= 0) return [];
    const selected = [];
    const used = /* @__PURE__ */ new Set();
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
  function medianCutQuantization(imageData, colorCount) {
    const { data, width, height } = imageData;
    const colors = [];
    const totalPixels = data.length / 4;
    const step = Math.max(1, Math.floor(totalPixels / 5e4));
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
    const edgeStep = Math.max(1, Math.floor(totalPixels / 3e4));
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
    let boxes = [createColorBox(colors)];
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
  function findClosestColor(color, palette) {
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
  function quantizeImage(imageData, palette) {
    const data = imageData.data;
    const result = new Uint8Array(data.length / 4);
    for (let i = 0; i < data.length; i += 4) {
      const pixelIndex = i / 4;
      const color = {
        r: data[i],
        g: data[i + 1],
        b: data[i + 2],
        a: data[i + 3]
      };
      if (color.a < 128) {
        result[pixelIndex] = 255;
      } else {
        result[pixelIndex] = findClosestColor(color, palette);
      }
    }
    return result;
  }
  function denoiseQuantized(quantized, width, height, iterations = 1) {
    let current = quantized;
    for (let i = 0; i < iterations; i++) {
      const next = new Uint8Array(current.length);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const counts = /* @__PURE__ */ new Map();
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
  function cleanSpeckles(quantized, width, height, minArea) {
    if (minArea <= 0) return quantized;
    const visited = new Uint8Array(width * height);
    const result = new Uint8Array(quantized);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (visited[idx] === 1) continue;
        const color = result[idx];
        const regionIndices = [];
        const borderNeighborColors = [];
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
          const colorCounts = /* @__PURE__ */ new Map();
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
  function adaptiveClean(quantized, width, height, colorCount, baseMinArea, qualityLevel = "balanced") {
    let result = quantized;
    if (qualityLevel === "detailed") {
      result = denoiseQuantized(result, width, height, 2);
      const tinyArea = Math.max(3, Math.floor(baseMinArea * 0.3));
      result = cleanSpeckles(result, width, height, tinyArea);
      return result;
    }
    if (qualityLevel === "fast") {
      result = denoiseQuantized(result, width, height, 2);
      result = cleanSpeckles(result, width, height, baseMinArea);
      return result;
    }
    if (qualityLevel === "balanced") {
      const denoiseIterations2 = Math.min(4, Math.ceil(colorCount / 10) + 2);
      result = denoiseQuantized(result, width, height, denoiseIterations2);
      const scaledMinArea2 = Math.ceil(baseMinArea * (1 + colorCount / 32));
      result = cleanSpeckles(result, width, height, scaledMinArea2);
      result = denoiseQuantized(result, width, height, 1);
      return result;
    }
    const colorFactor = Math.pow(colorCount / 8, 1.5);
    const denoiseIterations = Math.min(8, Math.ceil(colorFactor * 2));
    const scaledMinArea = Math.ceil(baseMinArea * Math.max(1, colorFactor));
    result = denoiseQuantized(result, width, height, denoiseIterations);
    result = cleanSpeckles(result, width, height, scaledMinArea);
    result = denoiseQuantized(result, width, height, 2);
    return result;
  }
  var MOORE_NEIGHBORS = [
    { x: 0, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
    { x: -1, y: 1 },
    { x: -1, y: 0 },
    { x: -1, y: -1 }
  ];
  function traceMaskBoundary(mask, width, height, startX, startY) {
    const boundary = [];
    let curX = startX;
    let curY = startY;
    boundary.push({ x: curX, y: curY });
    let prevX = curX - 1;
    let prevY = curY;
    let iter = 0;
    const maxIter = width * height * 2;
    const isInside = (x, y) => {
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
  function getAngle(p1, p2, p3) {
    const v1x = p1.x - p2.x;
    const v1y = p1.y - p2.y;
    const v2x = p3.x - p2.x;
    const v2y = p3.y - p2.y;
    const dot = v1x * v2x + v1y * v2y;
    const cross = v1x * v2y - v1y * v2x;
    return Math.atan2(Math.abs(cross), dot);
  }
  function detectCorners(points, angleThreshold = Math.PI / 4) {
    const corners = /* @__PURE__ */ new Set();
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
  function smoothPathPreservingCorners(points, corners, iterations = 2, weight = 0.25) {
    if (points.length < 3) return points;
    let current = [...points];
    for (let iter = 0; iter < iterations; iter++) {
      const next = [];
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
  function simplifyPath(points, tolerance) {
    if (points.length < 3) return points;
    const sqDistToSegment = (p, p1, p2) => {
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
    const simplifySection = (start, end) => {
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
  function calculateSignedArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return area / 2;
  }
  function ensureClockwise(points) {
    const area = calculateSignedArea(points);
    if (area < 0) {
      return [...points].reverse();
    }
    return points;
  }
  function refinePathMultiStage(rawPoints, smoothness, qualityLevel = "balanced") {
    if (rawPoints.length < 3) return rawPoints;
    let points = rawPoints;
    const cornerAngleThreshold = Math.PI / 3;
    const corners = detectCorners(points, cornerAngleThreshold);
    if (qualityLevel === "fast") {
      const simplified = simplifyPath(points, Math.max(1, smoothness * 0.3));
      if (simplified.length < 3) return rawPoints;
      return simplified;
    }
    if (qualityLevel === "detailed") {
      points = smoothPathPreservingCorners(points, corners, 1, 0.02);
      points = simplifyPath(points, Math.max(0.1, smoothness * 0.05));
      if (points.length < 3) return rawPoints;
      return points;
    }
    if (qualityLevel === "balanced") {
      points = smoothPathPreservingCorners(points, corners, 1, 0.12);
      points = simplifyPath(points, Math.max(0.5, smoothness * 0.2));
      if (points.length < 3) return rawPoints;
      return points;
    }
    points = smoothPathPreservingCorners(points, corners, 1, 0.15);
    points = simplifyPath(points, Math.max(0.4, smoothness * 0.15));
    if (points.length < 3) return rawPoints;
    return points;
  }
  function pointsToSvgPathOptimized(points, corners) {
    if (points.length < 2) return "";
    const r = Math.round;
    if (points.length < 3) {
      return `M${r(points[0].x)},${r(points[0].y)}L${r(points[1].x)},${r(points[1].y)}Z`;
    }
    if (points.length < 5) {
      let d2 = `M${r(points[0].x)},${r(points[0].y)}`;
      for (let i = 1; i < points.length; i++) {
        d2 += `L${r(points[i].x)},${r(points[i].y)}`;
      }
      return d2 + "Z";
    }
    const distToSegmentSquared = (p, v, w) => {
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
      if (distToSegmentSquared(cp1, p1, p2) < errorThreshold && distToSegmentSquared(cp2, p1, p2) < errorThreshold) {
        d += `L${r(p2.x)},${r(p2.y)}`;
      } else {
        d += `C${r(cp1x)},${r(cp1y)} ${r(cp2x)},${r(cp2y)} ${r(p2.x)},${r(p2.y)}`;
      }
    }
    return d + "Z";
  }
  function closeColorMask(mask, width, height, radius = 2) {
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
  function traceAllColors(quantized, width, height, palette, smoothness, minArea = 1, qualityLevel = "balanced", mergeNeighbors = true) {
    const result = [];
    const colorsToTrace = palette.map((_, i) => i);
    const mergeRadius = mergeNeighbors ? qualityLevel === "fast" ? 4 : qualityLevel === "balanced" ? 2 : qualityLevel === "high" ? 1 : 0 : 0;
    for (const colorIndex of colorsToTrace) {
      if (colorIndex >= palette.length || colorIndex === 255) continue;
      const colorMask = new Uint8Array(width * height);
      for (let i = 0; i < quantized.length; i++) {
        if (quantized[i] === colorIndex) {
          colorMask[i] = 1;
        }
      }
      const processedMask = mergeRadius > 0 ? closeColorMask(colorMask, width, height, mergeRadius) : colorMask;
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
              const pIdx = stack.pop();
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
              if (p.x <= edgeMargin || p.x >= width - edgeMargin - 1 || p.y <= edgeMargin || p.y >= height - edgeMargin - 1) {
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
  function colorToHex(color) {
    const toHex = (n) => n.toString(16).padStart(2, "0");
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
  }
  function groupShapesByColor(shapes) {
    const groups = /* @__PURE__ */ new Map();
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
      const group = groups.get(hex);
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
  function generateSvg(shapes, width, height, removeBackground = false) {
    const colorGroups = groupShapesByColor(shapes);
    let maxBackgroundArea = 0;
    let dominantHex = "#ffffff";
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
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
`;
    svg += `  <title>Vectorized Image</title>
`;
    svg += `  <desc>Generated with Zipp Vectorize - ${colorGroups.size} colors</desc>
`;
    if (!removeBackground) {
      svg += `  <rect id="background" width="100%" height="100%" fill="${dominantHex}"/>
`;
    }
    svg += `  <g id="content">
`;
    if (removeBackground) {
      const allShapesFiltered = [];
      const smallShapeThreshold = width * height * 0.05;
      for (const shape of shapes) {
        const hex = colorToHex(shape.color);
        const isSmallBackground = shape.isBackground && shape.area < smallShapeThreshold;
        const isDominantBg = hex === dominantHex;
        if (!shape.isBackground || isSmallBackground && !isDominantBg) {
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
      svg += `    <g id="shapes-layer">
`;
      for (const { hex, path } of allShapesFiltered) {
        svg += `      <path fill="${hex}" stroke="${hex}" stroke-width="2" stroke-linejoin="round" d="${path}"/>
`;
      }
      svg += `    </g>
`;
    } else {
      const allShapesFlat = [];
      for (const shape of shapes) {
        const hex = colorToHex(shape.color);
        allShapesFlat.push({
          hex,
          path: shape.path,
          area: shape.area
        });
      }
      allShapesFlat.sort((a, b) => b.area - a.area);
      svg += `    <g id="shapes-layer">
`;
      for (const { hex, path } of allShapesFlat) {
        svg += `      <path fill="${hex}" stroke="${hex}" stroke-width="0.5" stroke-linejoin="round" d="${path}"/>
`;
      }
      svg += `    </g>
`;
    }
    svg += `  </g>
`;
    svg += `</svg>`;
    return svg;
  }
  function optimizeSvg(svgContent) {
    let result = svgContent;
    result = result.replace(/<\?xml[^?]*\?>\s*/gi, "");
    result = result.replace(/<!--[\s\S]*?-->/g, "");
    result = result.replace(/\bd="([^"]+)"/g, (_match, pathData) => {
      const optimizedPath = optimizePathData(pathData);
      return `d="${optimizedPath}"`;
    });
    result = result.replace(/\s+>/g, ">");
    result = result.replace(/>\s+</g, "><");
    result = result.replace(/\n\s*/g, "");
    result = result.replace(/\s{2,}/g, " ");
    return result.trim();
  }
  function optimizePathData(pathData) {
    if (/[CQSTAcqsta]/.test(pathData)) {
      return pathData.replace(/\s+/g, " ").replace(/,\s+/g, ",").trim();
    }
    const points = [];
    const moveMatch = pathData.match(/M(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (!moveMatch) return pathData;
    points.push({ cmd: "M", x: Math.round(parseFloat(moveMatch[1])), y: Math.round(parseFloat(moveMatch[2])) });
    const lineRegex = /L(-?\d+\.?\d*),(-?\d+\.?\d*)/g;
    let match;
    while ((match = lineRegex.exec(pathData)) !== null) {
      points.push({ cmd: "L", x: Math.round(parseFloat(match[1])), y: Math.round(parseFloat(match[2])) });
    }
    if (points.length < 2) return pathData;
    const deduped = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const prev = deduped[deduped.length - 1];
      const curr = points[i];
      if (curr.x !== prev.x || curr.y !== prev.y) {
        deduped.push(curr);
      }
    }
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
    if (pathData.toUpperCase().includes("Z")) {
      result += "Z";
    }
    return result;
  }
  async function loadImageData(imageInput) {
    let imageDataUrl = null;
    ctx.log("info", `[Vectorize] loadImageData input type: ${typeof imageInput}`);
    if (typeof imageInput === "string") {
      ctx.log("info", `[Vectorize] Input string length: ${imageInput.length}, starts with: ${imageInput.substring(0, 50)}`);
    }
    if (typeof imageInput === "string") {
      const str = imageInput;
      if (str.startsWith("data:")) {
        ctx.log("info", "[Vectorize] Input is data URL");
        imageDataUrl = str;
      } else if (str.startsWith("http://") || str.startsWith("https://")) {
        ctx.log("info", `[Vectorize] Fetching from URL: ${str}`);
        const response = await ctx.secureFetch(str, { purpose: "Fetch image for vectorization" });
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let j = 0; j < bytes.length; j++) {
          binary += String.fromCharCode(bytes[j]);
        }
        const base64 = btoa(binary);
        const mime = blob.type || "image/png";
        imageDataUrl = `data:${mime};base64,${base64}`;
      } else if (str.length > 0) {
        ctx.log("info", `[Vectorize] Loading local file: ${str}`);
        if (ctx.tauri) {
          try {
            let normalizedPath = str;
            if (normalizedPath.startsWith("\\\\?\\")) {
              normalizedPath = normalizedPath.substring(4);
            }
            ctx.log("info", `[Vectorize] Invoking read_file with path: ${normalizedPath}`);
            const fileContent = await ctx.tauri.invoke("plugin:zipp-filesystem|read_file", {
              path: normalizedPath,
              readAs: "base64"
            });
            ctx.log("info", `[Vectorize] read_file returned, content length: ${fileContent?.content?.length || 0}, isLargeFile: ${fileContent?.isLargeFile}`);
            let dataUrl = null;
            if (fileContent?.content === "__FILE_REF__" || fileContent?.isLargeFile) {
              ctx.log("info", `[Vectorize] Large file detected (${fileContent?.size} bytes), reading in chunks...`);
              const fileSize = fileContent.size;
              const chunkSize = 3 * 1024 * 1024;
              const byteArrays = [];
              for (let offset = 0; offset < fileSize; offset += chunkSize) {
                const length = Math.min(chunkSize, fileSize - offset);
                ctx.log("info", `[Vectorize] Reading chunk at offset ${offset}, length ${length}`);
                const base64Chunk = await ctx.tauri.invoke("plugin:zipp-filesystem|read_chunk_content", {
                  path: normalizedPath,
                  start: offset,
                  length,
                  readAs: "base64"
                });
                const binaryString = atob(base64Chunk);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                byteArrays.push(bytes);
              }
              const totalLength = byteArrays.reduce((sum, arr) => sum + arr.length, 0);
              const fullBytes = new Uint8Array(totalLength);
              let position = 0;
              for (const arr of byteArrays) {
                fullBytes.set(arr, position);
                position += arr.length;
              }
              let binary = "";
              for (let i = 0; i < fullBytes.length; i++) {
                binary += String.fromCharCode(fullBytes[i]);
              }
              const fullBase64 = btoa(binary);
              ctx.log("info", `[Vectorize] Read ${byteArrays.length} chunks, total bytes: ${totalLength}, base64 length: ${fullBase64.length}`);
              const ext = str.toLowerCase().split(".").pop() || "png";
              const mimeTypes = {
                "png": "image/png",
                "jpg": "image/jpeg",
                "jpeg": "image/jpeg",
                "gif": "image/gif",
                "webp": "image/webp",
                "bmp": "image/bmp"
              };
              const mime = mimeTypes[ext] || "image/png";
              dataUrl = `data:${mime};base64,${fullBase64}`;
            } else if (fileContent?.content) {
              dataUrl = fileContent.content;
              if (!dataUrl.startsWith("data:")) {
                const ext = str.toLowerCase().split(".").pop() || "png";
                const mimeTypes = {
                  "png": "image/png",
                  "jpg": "image/jpeg",
                  "jpeg": "image/jpeg",
                  "gif": "image/gif",
                  "webp": "image/webp",
                  "bmp": "image/bmp"
                };
                const mime = mimeTypes[ext] || "image/png";
                dataUrl = `data:${mime};base64,${dataUrl}`;
              }
            }
            if (dataUrl) {
              imageDataUrl = dataUrl;
            } else {
              ctx.log("error", "[Vectorize] read_file returned empty content");
            }
          } catch (err) {
            ctx.log("error", `[Vectorize] read_file error: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else {
          ctx.log("error", "[Vectorize] ctx.tauri not available for local file loading");
        }
      } else {
        ctx.log("error", "[Vectorize] Empty string input");
      }
    } else if (typeof imageInput === "object" && imageInput !== null) {
      const obj = imageInput;
      ctx.log("info", `[Vectorize] Input is object with keys: ${Object.keys(obj).join(", ")}`);
      if (typeof obj.dataUrl === "string") {
        imageDataUrl = obj.dataUrl;
      } else if (typeof obj.path === "string" && ctx.tauri) {
        try {
          let normalizedPath = obj.path;
          if (normalizedPath.startsWith("\\\\?\\")) {
            normalizedPath = normalizedPath.substring(4);
          }
          ctx.log("info", `[Vectorize] Loading from object.path: ${normalizedPath}`);
          const fileContent = await ctx.tauri.invoke("plugin:zipp-filesystem|read_file", {
            path: normalizedPath,
            readAs: "base64"
          });
          if (fileContent?.content) {
            let dataUrl = fileContent.content;
            if (!dataUrl.startsWith("data:")) {
              const ext = obj.path.toLowerCase().split(".").pop() || "png";
              const mimeTypes = {
                "png": "image/png",
                "jpg": "image/jpeg",
                "jpeg": "image/jpeg",
                "gif": "image/gif",
                "webp": "image/webp",
                "bmp": "image/bmp"
              };
              const mime = mimeTypes[ext] || "image/png";
              dataUrl = `data:${mime};base64,${dataUrl}`;
            }
            imageDataUrl = dataUrl;
          }
        } catch (err) {
          ctx.log("error", `[Vectorize] read_file error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } else {
      ctx.log("error", `[Vectorize] Unexpected input type: ${typeof imageInput}`);
    }
    if (!imageDataUrl) {
      throw new Error("Could not load image data");
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Could not get canvas context"));
          return;
        }
        context.drawImage(img, 0, 0);
        const imageData = context.getImageData(0, 0, img.width, img.height);
        resolve(imageData);
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = imageDataUrl;
    });
  }
  async function convert(imageInput, outputPath, colorCount, quality, smoothness, minArea, removeBackground, optimize, nodeId) {
    if (ctx.abortSignal?.aborted) {
      ctx.log("info", "[Vectorize] Aborted by user before starting conversion");
      throw new Error("Operation aborted by user");
    }
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[Vectorize] Starting conversion: ${colorCount} colors, ${quality} quality`);
    try {
      ctx.log("info", "[Vectorize] Loading image...");
      const imageData = await loadImageData(imageInput);
      ctx.log("info", `[Vectorize] Image loaded: ${imageData.width}x${imageData.height}`);
      ctx.log("info", "[Vectorize] Quantizing colors...");
      const palette = medianCutQuantization(imageData, colorCount);
      ctx.log("info", `[Vectorize] Generated palette with ${palette.length} colors`);
      let quantized = quantizeImage(imageData, palette);
      ctx.log("info", "[Vectorize] Cleaning image...");
      const qualityLevel = quality;
      quantized = adaptiveClean(quantized, imageData.width, imageData.height, colorCount, minArea, qualityLevel);
      ctx.log("info", "[Vectorize] Tracing paths...");
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
      ctx.log("info", `[Vectorize] Traced ${shapes.length} shapes`);
      ctx.log("info", "[Vectorize] Generating SVG...");
      let svg = generateSvg(shapes, imageData.width, imageData.height, removeBackground);
      if (optimize) {
        ctx.log("info", "[Vectorize] Optimizing SVG...");
        svg = optimizeSvg(svg);
      }
      let finalOutputPath = outputPath;
      if (!finalOutputPath && ctx.tauri) {
        let filename = "vectorized";
        if (typeof imageInput === "string" && !imageInput.startsWith("data:") && !imageInput.startsWith("http")) {
          const parts = imageInput.replace(/\\/g, "/").split("/");
          const srcFilename = parts.pop() || "image";
          filename = srcFilename.split(".")[0];
        } else {
          filename = `vectorized_${Date.now()}`;
        }
        const downloadsPath = await ctx.tauri.invoke("plugin:zipp-filesystem|get_downloads_path").catch(() => "");
        if (downloadsPath) {
          finalOutputPath = `${downloadsPath}/${filename}.svg`;
        } else {
          finalOutputPath = `${filename}.svg`;
        }
      }
      if (!finalOutputPath.endsWith(".svg")) {
        finalOutputPath = `${finalOutputPath}.svg`;
      }
      ctx.log("info", `[Vectorize] Saving to: ${finalOutputPath}`);
      if (ctx.tauri) {
        await ctx.tauri.invoke("plugin:zipp-filesystem|write_file", {
          path: finalOutputPath,
          content: svg,
          contentType: "text",
          createDirs: true
        });
      } else {
        const blob = new Blob([svg], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = finalOutputPath.split("/").pop() || "vectorized.svg";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("success", `[Vectorize] Conversion complete: ${finalOutputPath}`);
      return finalOutputPath;
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      if (error instanceof Error && (error.name === "AbortError" || errMsg.includes("aborted"))) {
        return "__ABORT__";
      }
      ctx.log("error", `[Vectorize] Error: ${errMsg}`);
      throw error;
    }
  }
  var PluginVectorizeRuntime = {
    name: "Vectorize",
    async init(context) {
      ctx = context;
      ctx?.log?.("info", "[Plugin Vectorize] Module initialized");
    },
    methods: {
      convert
    },
    async cleanup() {
      ctx?.log?.("info", "[Plugin Vectorize] Module cleanup");
    }
  };
  var runtime_default = PluginVectorizeRuntime;

  // ../zipp-core/modules/plugin-vectorize/compiler.ts
  var PluginVectorizeCompiler = {
    name: "Vectorize",
    getNodeTypes() {
      return ["vectorize"];
    },
    compileNode(nodeType, ctx2) {
      const { node, inputs, outputVar, skipVarDeclaration, escapeString } = ctx2;
      const data = node.data;
      const letOrAssign = skipVarDeclaration ? "" : "let ";
      const inputVar = inputs.get("default") || inputs.get("input") || inputs.get("image") || "null";
      let code = `
  // --- Node: ${node.id} (${nodeType}) ---`;
      switch (nodeType) {
        case "vectorize": {
          const outputPath = escapeString(String(data.outputPath || ""));
          const colorCount = Number(data.colorCount) || 16;
          const quality = escapeString(String(data.quality || "balanced"));
          const smoothness = Number(data.smoothness) || 1;
          const minArea = Number(data.minArea) || 4;
          const removeBackground = data.removeBackground === true;
          const optimize = data.optimize !== false;
          code += `
  ${letOrAssign}${outputVar} = await Vectorize.convert(
    ${inputVar},
    "${outputPath}",
    ${colorCount},
    "${quality}",
    ${smoothness},
    ${minArea},
    ${removeBackground},
    ${optimize},
    "${node.id}"
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  workflow_context["${node.id}"] = ${outputVar};`;
          break;
        }
        default:
          return null;
      }
      return code;
    }
  };
  var compiler_default = PluginVectorizeCompiler;

  // ../zipp-core/modules/plugin-vectorize/ui/index.ts
  var ui_exports = {};
  __export(ui_exports, {
    VectorizeNode: () => VectorizeNode_default
  });

  // ../zipp-core/modules/plugin-vectorize/ui/VectorizeNode.tsx
  var import_react = __toESM(require_react(), 1);
  var import_react2 = __toESM(require_react2(), 1);
  var import_zipp_ui_components = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
  function useCallbackRefs(data) {
    const refs = {
      onOutputPathChange: (0, import_react.useRef)(data.onOutputPathChange),
      onColorCountChange: (0, import_react.useRef)(data.onColorCountChange),
      onQualityChange: (0, import_react.useRef)(data.onQualityChange),
      onSmoothnessChange: (0, import_react.useRef)(data.onSmoothnessChange),
      onMinAreaChange: (0, import_react.useRef)(data.onMinAreaChange),
      onRemoveBackgroundChange: (0, import_react.useRef)(data.onRemoveBackgroundChange),
      onOptimizeChange: (0, import_react.useRef)(data.onOptimizeChange),
      onCollapsedChange: (0, import_react.useRef)(data.onCollapsedChange)
    };
    (0, import_react.useEffect)(() => {
      refs.onOutputPathChange.current = data.onOutputPathChange;
      refs.onColorCountChange.current = data.onColorCountChange;
      refs.onQualityChange.current = data.onQualityChange;
      refs.onSmoothnessChange.current = data.onSmoothnessChange;
      refs.onMinAreaChange.current = data.onMinAreaChange;
      refs.onRemoveBackgroundChange.current = data.onRemoveBackgroundChange;
      refs.onOptimizeChange.current = data.onOptimizeChange;
      refs.onCollapsedChange.current = data.onCollapsedChange;
    });
    return refs;
  }
  var VectorizeIcon = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" }) });
  function VectorizeNode({ data }) {
    const callbackRefs = useCallbackRefs(data);
    const handleCollapsedChange = (0, import_react.useCallback)((collapsed) => {
      callbackRefs.onCollapsedChange.current?.(collapsed);
    }, []);
    const handleOutputPathChange = (0, import_react.useCallback)((e) => {
      callbackRefs.onOutputPathChange.current?.(e.target.value);
    }, []);
    const handleColorCountChange = (0, import_react.useCallback)((e) => {
      callbackRefs.onColorCountChange.current?.(parseInt(e.target.value));
    }, []);
    const handleQualityChange = (0, import_react.useCallback)((e) => {
      callbackRefs.onQualityChange.current?.(e.target.value);
    }, []);
    const handleSmoothnessChange = (0, import_react.useCallback)((e) => {
      callbackRefs.onSmoothnessChange.current?.(parseFloat(e.target.value));
    }, []);
    const handleMinAreaChange = (0, import_react.useCallback)((e) => {
      callbackRefs.onMinAreaChange.current?.(parseInt(e.target.value));
    }, []);
    const handleRemoveBackgroundChange = (0, import_react.useCallback)((e) => {
      callbackRefs.onRemoveBackgroundChange.current?.(e.target.checked);
    }, []);
    const handleOptimizeChange = (0, import_react.useCallback)((e) => {
      callbackRefs.onOptimizeChange.current?.(e.target.checked);
    }, []);
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "text-slate-600 dark:text-slate-400 text-[10px]", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-purple-400", children: data.colorCount || 16 }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mx-1", children: "colors" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-purple-400", children: data.quality || "balanced" })
    ] });
    const inputHandles = (0, import_react.useMemo)(() => [
      { id: "image", type: "target", position: import_react2.Position.Left, color: "!bg-blue-500", size: "lg", label: "image" }
    ], []);
    const outputHandles = (0, import_react.useMemo)(() => [
      { id: "svg", type: "source", position: import_react2.Position.Right, color: "!bg-purple-500", size: "lg" }
    ], []);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_zipp_ui_components.CollapsibleNodeWrapper,
      {
        title: "Vectorize",
        color: "purple",
        icon: VectorizeIcon,
        width: 280,
        collapsedWidth: 150,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Output Path" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                placeholder: "Auto (Downloads folder)",
                value: data.outputPath || "",
                onChange: handleOutputPathChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: [
              "Colors: ",
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-purple-400", children: data.colorCount || 16 })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "range",
                className: "nodrag nowheel w-full accent-purple-500",
                min: "2",
                max: "64",
                value: data.colorCount || 16,
                onChange: handleColorCountChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Quality" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                value: data.quality || "balanced",
                onChange: handleQualityChange,
                onMouseDown: (e) => e.stopPropagation(),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "fast", children: "Fast" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "balanced", children: "Balanced" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "high", children: "High Quality" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "detailed", children: "Detailed (Text/Lines)" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: [
              "Smoothness: ",
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-purple-400", children: (data.smoothness || 1).toFixed(1) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "range",
                className: "nodrag nowheel w-full accent-purple-500",
                min: "0.1",
                max: "5.0",
                step: "0.1",
                value: data.smoothness || 1,
                onChange: handleSmoothnessChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: [
              "Min Area: ",
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "text-purple-400", children: [
                data.minArea || 4,
                "px"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "range",
                className: "nodrag nowheel w-full accent-purple-500",
                min: "1",
                max: "100",
                value: data.minArea || 4,
                onChange: handleMinAreaChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex gap-4", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "flex items-center gap-2 text-xs text-slate-400 cursor-pointer", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "checkbox",
                  className: "nodrag nowheel accent-purple-500 w-4 h-4",
                  checked: data.removeBackground || false,
                  onChange: handleRemoveBackgroundChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              ),
              "Remove BG"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "flex items-center gap-2 text-xs text-slate-400 cursor-pointer", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "checkbox",
                  className: "nodrag nowheel accent-purple-500 w-4 h-4",
                  checked: data.optimize !== false,
                  onChange: handleOptimizeChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              ),
              "Optimize"
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-slate-100/50 dark:bg-slate-100/50 dark:bg-slate-900/50 rounded text-xs text-slate-600 dark:text-slate-400", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-4 h-4 text-purple-500 flex-shrink-0", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Converts raster images to SVG vectors" })
          ] })
        ] })
      }
    );
  }
  var VectorizeNode_default = (0, import_react.memo)(VectorizeNode);

  // ../zipp-core/modules/plugin-vectorize/_plugin_entry.ts
  var components = ui_exports;
  return __toCommonJS(plugin_entry_exports);
})();
