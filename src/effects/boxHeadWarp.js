const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (edge0, edge1, value) => {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const smoothSign = (value) => value / (Math.abs(value) + 0.35);

export function distortPoint(x, y, warpBox, settings) {
  const cx = warpBox.x + warpBox.width / 2;
  const cy = warpBox.y + warpBox.height / 2;
  const halfW = Math.max(1, warpBox.width / 2);
  const halfH = Math.max(1, warpBox.height / 2);
  const softness = Math.max(0.04, settings.edgeSoftness);
  const influenceX = halfW * (1 + softness * 1.45);
  const influenceY = halfH * (1 + softness * 1.45);

  const nx = (x - cx) / halfW;
  const ny = (y - cy) / halfH;
  const rectangularDistance = Math.max(
    Math.abs(x - cx) / influenceX,
    Math.abs(y - cy) / influenceY,
  );
  const falloff = 1 - smoothstep(0.62, 1, rectangularDistance);
  if (falloff <= 0) return { x, y, influence: 0 };

  const strength = settings.strength * falloff;
  const insideWeight = 1 - smoothstep(0.75, 1.08, Math.max(Math.abs(nx), Math.abs(ny)));
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

  dx += sidePush + boxPullX;
  dy -= flatten;
  dy += boxPullY;

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

function inverseWarpPoint(x, y, warpBox, settings) {
  let sx = x;
  let sy = y;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const distorted = distortPoint(sx, sy, warpBox, settings);
    sx += x - distorted.x;
    sy += y - distorted.y;
  }

  return { x: sx, y: sy };
}

export function applyBoxHeadWarp({
  sourceCanvas,
  targetCanvas,
  warpBox,
  settings,
}) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  targetCanvas.width = width;
  targetCanvas.height = height;

  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const targetContext = targetCanvas.getContext("2d");

  if (!warpBox || warpBox.width <= 0 || warpBox.height <= 0) {
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
      const sourcePoint = inverseWarpPoint(x, y, warpBox, settings);
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

export function buildWarpMesh(width, height, warpBox, settings) {
  const resolution = clamp(Math.round(settings.meshResolution), 8, 56);
  const cols = resolution;
  const rows = Math.max(8, Math.round(resolution * (height / Math.max(width, 1))));
  const points = [];

  for (let row = 0; row <= rows; row += 1) {
    const y = (row / rows) * height;
    const line = [];
    for (let col = 0; col <= cols; col += 1) {
      const x = (col / cols) * width;
      line.push(distortPoint(x, y, warpBox, settings));
    }
    points.push(line);
  }

  return { points, rows, cols };
}
