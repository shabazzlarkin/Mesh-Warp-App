const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (edge0, edge1, value) => {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const smoothSign = (value) => value / (Math.abs(value) + 0.35);

export function getRegionBox(region) {
  if (!region) return null;
  if (Array.isArray(region.points) && region.points.length === 4) {
    const xs = region.points.map((point) => point.x);
    const ys = region.points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
  }
  return region;
}

function shapeFalloff(nx, ny, region) {
  const shape = region.shape || "rectangle";
  if (shape === "ellipse") {
    return Math.sqrt(nx * nx + ny * ny);
  }
  if (shape === "diamond") {
    return Math.abs(nx) + Math.abs(ny);
  }
  return Math.max(Math.abs(nx), Math.abs(ny));
}

function remapTicTacToeAxis(normalizedPosition, expansion) {
  const t = clamp((normalizedPosition + 1) / 2, 0, 1);
  const sourceA = 1 / 3;
  const sourceB = 2 / 3;
  const targetA = sourceA - expansion;
  const targetB = sourceB + expansion;

  if (t < sourceA) {
    return ((t / sourceA) * targetA) * 2 - 1;
  }

  if (t < sourceB) {
    const local = (t - sourceA) / (sourceB - sourceA);
    return (targetA + local * (targetB - targetA)) * 2 - 1;
  }

  const local = (t - sourceB) / (1 - sourceB);
  return (targetB + local * (1 - targetB)) * 2 - 1;
}

function ticTacToeOffset(nx, ny, halfW, halfH, settings, strength) {
  const innerWeight =
    1 - smoothstep(0.72, 0.98, Math.max(Math.abs(nx), Math.abs(ny)));
  if (innerWeight <= 0) return { x: 0, y: 0 };

  const xExpansion = clamp(
    settings.horizontalStretch * strength * innerWeight * 0.16,
    0,
    0.18,
  );
  const yExpansion = clamp(
    (settings.horizontalStretch * 0.45 + settings.verticalCompression * 0.55) *
      strength *
      innerWeight *
      0.12,
    0,
    0.14,
  );
  const remappedX = remapTicTacToeAxis(nx, xExpansion);
  const remappedY = remapTicTacToeAxis(ny, yExpansion);

  return {
    x: (remappedX - nx) * halfW,
    y: (remappedY - ny) * halfH,
  };
}

function getDefaultTicTacToeMeshPoints(warpBox) {
  return [
    { x: warpBox.x + warpBox.width / 3, y: warpBox.y + warpBox.height / 3 },
    {
      x: warpBox.x + (warpBox.width * 2) / 3,
      y: warpBox.y + warpBox.height / 3,
    },
    {
      x: warpBox.x + warpBox.width / 3,
      y: warpBox.y + (warpBox.height * 2) / 3,
    },
    {
      x: warpBox.x + (warpBox.width * 2) / 3,
      y: warpBox.y + (warpBox.height * 2) / 3,
    },
  ];
}

function ticTacToeMeshPointOffset(nx, ny, region, warpBox, halfW, halfH, strength) {
  if (
    region.shape !== "ticTacToe" ||
    !Array.isArray(region.meshPoints) ||
    region.meshPoints.length !== 4
  ) {
    return { x: 0, y: 0 };
  }

  const cx = warpBox.x + warpBox.width / 2;
  const cy = warpBox.y + warpBox.height / 2;
  const defaults = getDefaultTicTacToeMeshPoints(warpBox);
  const edgeGuard =
    1 - smoothstep(0.74, 0.98, Math.max(Math.abs(nx), Math.abs(ny)));
  if (edgeGuard <= 0) return { x: 0, y: 0 };

  return region.meshPoints.reduce(
    (offset, point, index) => {
      const base = defaults[index];
      const baseNx = (base.x - cx) / halfW;
      const baseNy = (base.y - cy) / halfH;
      const weightX = 1 - smoothstep(0, 0.78, Math.abs(nx - baseNx));
      const weightY = 1 - smoothstep(0, 0.78, Math.abs(ny - baseNy));
      const weight = weightX * weightY * strength * edgeGuard;

      return {
        x: offset.x + (point.x - base.x) * weight,
        y: offset.y + (point.y - base.y) * weight,
      };
    },
    { x: 0, y: 0 },
  );
}

function freeformOffset(nx, ny, region, strength) {
  if (region.mode !== "freeform" || !Array.isArray(region.points)) {
    return { x: 0, y: 0 };
  }

  const box = getRegionBox(region);
  const ideal = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x, y: box.y + box.height },
    { x: box.x + box.width, y: box.y + box.height },
  ];
  const u = clamp((nx + 1) / 2, 0, 1);
  const v = clamp((ny + 1) / 2, 0, 1);
  const weights = [
    (1 - u) * (1 - v),
    u * (1 - v),
    (1 - u) * v,
    u * v,
  ];

  return region.points.reduce(
    (offset, point, index) => ({
      x: offset.x + (point.x - ideal[index].x) * weights[index] * strength,
      y: offset.y + (point.y - ideal[index].y) * weights[index] * strength,
    }),
    { x: 0, y: 0 },
  );
}

export function distortPoint(x, y, region, settings) {
  const warpBox = getRegionBox(region);
  if (!warpBox) return { x, y, influence: 0 };
  const cx = warpBox.x + warpBox.width / 2;
  const cy = warpBox.y + warpBox.height / 2;
  const halfW = Math.max(1, warpBox.width / 2);
  const halfH = Math.max(1, warpBox.height / 2);
  const softness = Math.max(0.04, settings.edgeSoftness);
  const influenceX = halfW * (1 + softness * 1.45);
  const influenceY = halfH * (1 + softness * 1.45);

  const nx = (x - cx) / halfW;
  const ny = (y - cy) / halfH;
  const distanceX = (x - cx) / influenceX;
  const distanceY = (y - cy) / influenceY;
  const falloff = 1 - smoothstep(0.62, 1, shapeFalloff(distanceX, distanceY, region));
  if (falloff <= 0) return { x, y, influence: 0 };

  const strength = settings.strength * falloff;
  const insideWeight = 1 - smoothstep(0.75, 1.08, shapeFalloff(nx, ny, region));
  const edgeWeight = smoothstep(0.15, 1, Math.abs(nx));
  const capWeight = smoothstep(0.15, 1, Math.abs(ny));

  const horizontalScale =
    1 + settings.horizontalStretch * strength * (0.72 + insideWeight * 0.5);
  const verticalScale =
    1 - settings.verticalCompression * strength * (0.68 + insideWeight * 0.32);

  let dx = (x - cx) * horizontalScale;
  let dy = (y - cy) * verticalScale;

  const signedX = smoothSign(nx);
  const signedY = smoothSign(ny);
  const centerXWeight = smoothstep(0, 0.28, Math.abs(nx));
  const centerYWeight = smoothstep(0, 0.28, Math.abs(ny));

  const sidePush =
    signedX * halfW * 0.14 * settings.horizontalStretch * strength * edgeWeight;
  const flatten =
    signedY * halfH * 0.1 * settings.verticalCompression * strength * capWeight;
  const boxPullX =
    signedX *
    halfW *
    0.055 *
    strength *
    insideWeight *
    centerXWeight *
    (1 - Math.abs(ny) * 0.35);
  const boxPullY =
    -signedY *
    halfH *
    0.04 *
    strength *
    insideWeight *
    centerYWeight *
    (1 - Math.abs(nx) * 0.3);
  const gridOffset =
    region.shape === "ticTacToe"
      ? ticTacToeOffset(nx, ny, halfW, halfH, settings, strength)
      : { x: 0, y: 0 };
  const meshPointOffset = ticTacToeMeshPointOffset(
    nx,
    ny,
    region,
    warpBox,
    halfW,
    halfH,
    strength * 1.15,
  );
  const bend = freeformOffset(nx, ny, region, strength * 0.9);

  dx += sidePush + boxPullX + gridOffset.x + meshPointOffset.x + bend.x;
  dy -= flatten;
  dy += boxPullY + gridOffset.y + meshPointOffset.y + bend.y;

  return {
    x: cx + dx,
    y: cy + dy,
    influence: falloff,
  };
}

function sampleBilinear(sourceData, width, height, x, y) {
  const sx = clamp(x, 0, width - 1);
  const sy = clamp(y, 0, height - 1);
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = sx - x0;
  const ty = sy - y0;

  const topLeft = (y0 * width + x0) * 4;
  const topRight = (y0 * width + x1) * 4;
  const bottomLeft = (y1 * width + x0) * 4;
  const bottomRight = (y1 * width + x1) * 4;
  const rgba = [0, 0, 0, 0];

  for (let channel = 0; channel < 4; channel += 1) {
    const top =
      sourceData[topLeft + channel] * (1 - tx) +
      sourceData[topRight + channel] * tx;
    const bottom =
      sourceData[bottomLeft + channel] * (1 - tx) +
      sourceData[bottomRight + channel] * tx;
    rgba[channel] = top * (1 - ty) + bottom * ty;
  }

  return rgba;
}

function inverseWarpPoint(x, y, region, settings) {
  let sx = x;
  let sy = y;

  for (let iteration = 0; iteration < 5; iteration += 1) {
    const distorted = distortPoint(sx, sy, region, settings);
    sx += (x - distorted.x) * 0.72;
    sy += (y - distorted.y) * 0.72;
  }

  return { x: sx, y: sy };
}

function getSafeSourcePoint(sourcePoint, targetX, targetY, width, height) {
  if (
    sourcePoint.x < 0 ||
    sourcePoint.x > width - 1 ||
    sourcePoint.y < 0 ||
    sourcePoint.y > height - 1
  ) {
    return { x: targetX, y: targetY };
  }

  return sourcePoint;
}

export function applyBoxHeadWarp({
  sourceCanvas,
  targetCanvas,
  warpBox,
  warpRegions,
  settings,
}) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  targetCanvas.width = width;
  targetCanvas.height = height;

  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const targetContext = targetCanvas.getContext("2d");

  const regions = warpRegions || (warpBox ? [warpBox] : []);

  if (regions.length === 0) {
    targetContext.clearRect(0, 0, width, height);
    targetContext.drawImage(sourceCanvas, 0, 0);
    return;
  }

  const sourceImageData = sourceContext.getImageData(0, 0, width, height);
  const output = targetContext.createImageData(width, height);
  const src = sourceImageData.data;
  const dst = output.data;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sourcePoint = { x, y };
      for (let index = regions.length - 1; index >= 0; index -= 1) {
        sourcePoint = inverseWarpPoint(sourcePoint.x, sourcePoint.y, regions[index], settings);
      }
      sourcePoint = getSafeSourcePoint(sourcePoint, x, y, width, height);
      const rgba = sampleBilinear(src, width, height, sourcePoint.x, sourcePoint.y);
      const index = (y * width + x) * 4;
      dst[index] = rgba[0];
      dst[index + 1] = rgba[1];
      dst[index + 2] = rgba[2];
      dst[index + 3] = rgba[3];
    }
  }

  targetContext.putImageData(output, 0, 0);
}

export async function applyBoxHeadWarpAsync({
  sourceCanvas,
  targetCanvas,
  warpBox,
  warpRegions,
  settings,
  onProgress,
}) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  targetCanvas.width = width;
  targetCanvas.height = height;

  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const targetContext = targetCanvas.getContext("2d");
  const regions = warpRegions || (warpBox ? [warpBox] : []);

  onProgress?.(0.08);
  await new Promise((resolve) => requestAnimationFrame(resolve));

  if (regions.length === 0) {
    targetContext.clearRect(0, 0, width, height);
    targetContext.drawImage(sourceCanvas, 0, 0);
    onProgress?.(0.86);
    return;
  }

  const sourceImageData = sourceContext.getImageData(0, 0, width, height);
  const output = targetContext.createImageData(width, height);
  const src = sourceImageData.data;
  const dst = output.data;
  const chunkRows = Math.max(8, Math.floor(280000 / Math.max(width, 1)));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sourcePoint = { x, y };
      for (let index = regions.length - 1; index >= 0; index -= 1) {
        sourcePoint = inverseWarpPoint(sourcePoint.x, sourcePoint.y, regions[index], settings);
      }
      sourcePoint = getSafeSourcePoint(sourcePoint, x, y, width, height);
      const rgba = sampleBilinear(src, width, height, sourcePoint.x, sourcePoint.y);
      const index = (y * width + x) * 4;
      dst[index] = rgba[0];
      dst[index + 1] = rgba[1];
      dst[index + 2] = rgba[2];
      dst[index + 3] = rgba[3];
    }

    if (y % chunkRows === chunkRows - 1 || y === height - 1) {
      onProgress?.(0.08 + ((y + 1) / height) * 0.78);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  targetContext.putImageData(output, 0, 0);
  onProgress?.(0.88);
}

export function buildWarpMesh(width, height, region, settings) {
  const resolution = clamp(Math.round(settings.meshResolution), 8, 56);
  const cols = resolution;
  const rows = Math.max(8, Math.round(resolution * (height / Math.max(width, 1))));
  const points = [];

  for (let row = 0; row <= rows; row += 1) {
    const y = (row / rows) * height;
    const line = [];
    for (let col = 0; col <= cols; col += 1) {
      const x = (col / cols) * width;
      let point = { x, y };
      if (Array.isArray(region)) {
        for (const item of region) {
          point = distortPoint(point.x, point.y, item, settings);
        }
      } else {
        point = distortPoint(x, y, region, settings);
      }
      line.push(point);
    }
    points.push(line);
  }

  return { points, rows, cols };
}
