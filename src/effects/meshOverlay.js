import { buildWarpMesh } from "./boxHeadWarp.js";

export function drawMeshOverlay(context, width, height, warpBox, settings) {
  if (!warpBox) return;

  const mesh = buildWarpMesh(width, height, warpBox, settings);
  context.save();
  context.lineWidth = Math.max(0.75, width / 900);
  context.strokeStyle = "rgba(255, 255, 255, 0.68)";

  for (let row = 0; row <= mesh.rows; row += 1) {
    context.beginPath();
    for (let col = 0; col <= mesh.cols; col += 1) {
      const point = mesh.points[row][col];
      if (col === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.stroke();
  }

  context.strokeStyle = "rgba(12, 18, 25, 0.55)";
  for (let col = 0; col <= mesh.cols; col += 1) {
    context.beginPath();
    for (let row = 0; row <= mesh.rows; row += 1) {
      const point = mesh.points[row][col];
      if (row === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.stroke();
  }

  context.restore();
}
