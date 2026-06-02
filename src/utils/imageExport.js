import { applyBoxHeadWarpAsync } from "../effects/boxHeadWarp.js";

function makeSourceCanvas(image, scale) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image.element, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not create a PNG from this canvas."));
    }, "image/png");
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return url;
}

export async function exportWarpedImage({
  image,
  warpRegions,
  warpBox,
  settings,
  scale,
  filename,
  onProgress,
}) {
  onProgress?.(0.02);
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const sourceCanvas = makeSourceCanvas(image, scale);
  const targetCanvas = document.createElement("canvas");
  const regions = warpRegions || (warpBox ? [warpBox] : []);
  const scaledWarpRegions = regions.map((region) => ({
    ...region,
    x: region.x * scale,
    y: region.y * scale,
    width: region.width * scale,
    height: region.height * scale,
    points: region.points?.map((point) => ({
      x: point.x * scale,
      y: point.y * scale,
    })),
    meshPoints: region.meshPoints?.map((point) => ({
      x: point.x * scale,
      y: point.y * scale,
    })),
  }));

  await applyBoxHeadWarpAsync({
    sourceCanvas,
    targetCanvas,
    warpRegions: scaledWarpRegions,
    settings,
    onProgress,
  });

  onProgress?.(0.92);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const blob = await canvasToBlob(targetCanvas);
  onProgress?.(0.98);
  const downloadUrl = downloadBlob(blob, filename);
  onProgress?.(1);
  return { downloadUrl, filename };
}
