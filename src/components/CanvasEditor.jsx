import React, { useEffect, useMemo, useRef, useState } from "react";
import { applyBoxHeadWarp } from "../effects/boxHeadWarp.js";
import { drawMeshOverlay } from "../effects/meshOverlay.js";

const PREVIEW_MAX_EDGE = 1200;
const MIN_BOX_SIZE = 80;
const HANDLE_SIZE = 18;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getPreviewSize(image) {
  if (!image) return { width: 900, height: 640, scale: 1 };
  const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(image.width, image.height));
  return {
    width: Math.max(1, Math.round(image.width * scale)),
    height: Math.max(1, Math.round(image.height * scale)),
    scale,
  };
}

export default function CanvasEditor({
  image,
  settings,
  warpBox,
  setWarpBox,
  showMesh,
  showWarpBox,
}) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const sourceCanvasRef = useRef(null);
  const interactionRef = useRef(null);
  const [previewSize, setPreviewSize] = useState(() => getPreviewSize(null));
  const scale = previewSize.scale || 1;

  useEffect(() => {
    setPreviewSize(getPreviewSize(image));
  }, [image]);

  useEffect(() => {
    if (!image) return;
    setWarpBox((current) => {
      const nextWidth = clamp(image.width * settings.warpWidth, MIN_BOX_SIZE, image.width);
      const nextHeight = clamp(image.height * settings.warpHeight, MIN_BOX_SIZE, image.height);
      const centerX = current ? current.x + current.width / 2 : image.width / 2;
      const centerY = current ? current.y + current.height / 2 : image.height / 2;
      return {
        x: clamp(centerX - nextWidth / 2, 0, image.width - nextWidth),
        y: clamp(centerY - nextHeight / 2, 0, image.height - nextHeight),
        width: nextWidth,
        height: nextHeight,
      };
    });
  }, [image, settings.warpHeight, settings.warpWidth, setWarpBox]);

  useEffect(() => {
    if (!image || !canvasRef.current || !warpBox) {
      const canvas = canvasRef.current;
      if (canvas) {
        const context = canvas.getContext("2d");
        canvas.width = previewSize.width;
        canvas.height = previewSize.height;
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const sourceCanvas =
      sourceCanvasRef.current || document.createElement("canvas");
    sourceCanvasRef.current = sourceCanvas;
    sourceCanvas.width = previewSize.width;
    sourceCanvas.height = previewSize.height;

    const sourceContext = sourceCanvas.getContext("2d");
    sourceContext.imageSmoothingEnabled = true;
    sourceContext.imageSmoothingQuality = "high";
    sourceContext.clearRect(0, 0, previewSize.width, previewSize.height);
    sourceContext.drawImage(image.element, 0, 0, previewSize.width, previewSize.height);

    const scaledWarpBox = {
      x: warpBox.x * scale,
      y: warpBox.y * scale,
      width: warpBox.width * scale,
      height: warpBox.height * scale,
    };

    applyBoxHeadWarp({
      sourceCanvas,
      targetCanvas: canvasRef.current,
      warpBox: scaledWarpBox,
      settings,
    });

    if (showMesh) {
      drawMeshOverlay(
        canvasRef.current.getContext("2d"),
        previewSize.width,
        previewSize.height,
        scaledWarpBox,
        settings,
      );
    }
  }, [image, previewSize, scale, settings, showMesh, warpBox]);

  const boxStyle = useMemo(() => {
    if (!warpBox) return null;
    return {
      left: `${warpBox.x * scale}px`,
      top: `${warpBox.y * scale}px`,
      width: `${warpBox.width * scale}px`,
      height: `${warpBox.height * scale}px`,
    };
  }, [scale, warpBox]);

  const pointToImage = (event) => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };

    const rect = stage.getBoundingClientRect();
    const cssScaleX = previewSize.width / rect.width;
    const cssScaleY = previewSize.height / rect.height;
    return {
      x: ((event.clientX - rect.left) * cssScaleX) / scale,
      y: ((event.clientY - rect.top) * cssScaleY) / scale,
    };
  };

  const beginInteraction = (event, mode) => {
    if (!image || !warpBox) return;
    event.preventDefault();
    stageRef.current?.setPointerCapture(event.pointerId);
    interactionRef.current = {
      pointerId: event.pointerId,
      mode,
      start: pointToImage(event),
      initial: { ...warpBox },
    };
  };

  const moveInteraction = (event) => {
    const active = interactionRef.current;
    if (!active || !image || !warpBox || event.pointerId !== active.pointerId) return;

    const point = pointToImage(event);
    const dx = point.x - active.start.x;
    const dy = point.y - active.start.y;
    const initial = active.initial;

    setWarpBox(() => {
      if (active.mode === "move") {
        return {
          ...initial,
          x: clamp(initial.x + dx, 0, image.width - initial.width),
          y: clamp(initial.y + dy, 0, image.height - initial.height),
        };
      }

      const next = { ...initial };
      const fromLeft = active.mode.includes("w");
      const fromRight = active.mode.includes("e");
      const fromTop = active.mode.includes("n");
      const fromBottom = active.mode.includes("s");

      if (fromLeft) {
        const right = initial.x + initial.width;
        next.x = clamp(initial.x + dx, 0, right - MIN_BOX_SIZE);
        next.width = right - next.x;
      }
      if (fromRight) {
        next.width = clamp(initial.width + dx, MIN_BOX_SIZE, image.width - initial.x);
      }
      if (fromTop) {
        const bottom = initial.y + initial.height;
        next.y = clamp(initial.y + dy, 0, bottom - MIN_BOX_SIZE);
        next.height = bottom - next.y;
      }
      if (fromBottom) {
        next.height = clamp(initial.height + dy, MIN_BOX_SIZE, image.height - initial.y);
      }

      return next;
    });
  };

  const endInteraction = (event) => {
    const active = interactionRef.current;
    if (!active || event.pointerId !== active.pointerId) return;
    interactionRef.current = null;
  };

  return (
    <div className="editor-frame">
      <div
        ref={stageRef}
        className={`canvas-stage ${image ? "" : "is-empty"}`}
        style={{ aspectRatio: `${previewSize.width} / ${previewSize.height}` }}
        onPointerMove={moveInteraction}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
      >
        <canvas
          ref={canvasRef}
          className="preview-canvas"
          width={previewSize.width}
          height={previewSize.height}
        />

        {!image && (
          <div className="empty-state">
            <h1>Box Head Studio</h1>
            <p>Upload an image to place a box-shaped warp field.</p>
          </div>
        )}

        {image && showWarpBox && boxStyle && (
          <div
            className="warp-box"
            style={boxStyle}
            onPointerDown={(event) => beginInteraction(event, "move")}
          >
            {["nw", "ne", "sw", "se"].map((handle) => (
              <button
                key={handle}
                className={`resize-handle handle-${handle}`}
                aria-label={`Resize ${handle}`}
                style={{ width: HANDLE_SIZE, height: HANDLE_SIZE }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  beginInteraction(event, handle);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
