import { applyBoxHeadWarp } from "../effects/boxHeadWarp.js";

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

export function exportWarpedImage({ image, warpBox, settings, scale, filename }) {
  const sourceCanvas = makeSourceCanvas(image, scale);
  const targetCanvas = document.createElement("canvas");
  const scaledWarpBox = warpBox
    ? {
        x: warpBox.x * scale,
        y: warpBox.y * scale,
        width: warpBox.width * scale,
        height: warpBox.height * scale,
      }
    : null;

  applyBoxHeadWarp({
    sourceCanvas,
    targetCanvas,
    warpBox: scaledWarpBox,
    settings,
  });

  targetCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
