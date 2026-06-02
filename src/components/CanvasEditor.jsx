import React, { useEffect, useMemo, useRef, useState } from "react";
import { applyBoxHeadWarp } from "../effects/boxHeadWarp.js";
import { drawMeshOverlay } from "../effects/meshOverlay.js";

const PREVIEW_MAX_EDGE = 860;
const MIN_BOX_SIZE = 80;
const HANDLE_SIZE = 18;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const LIVE_PREVIEW_SCALES = {
  fast: 0.25,
  balanced: 0.4,
  sharp: 0.62,
};

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

function getViewportSize() {
  if (typeof window === "undefined") return { width: 1200, height: 800 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function getFitZoom(previewSize, viewportSize) {
  const sidePanelWidth = viewportSize.width > 900 ? 430 : 24;
  const availableWidth = Math.max(280, viewportSize.width - sidePanelWidth);
  const availableHeight = Math.max(320, viewportSize.height - 48);
  return clamp(
    Math.min(1, availableWidth / previewSize.width, availableHeight / previewSize.height),
    MIN_ZOOM,
    1,
  );
}

function getPolygonPoints(points) {
  if (points.length !== 4) return points;
  return [points[0], points[1], points[3], points[2]];
}

function getDefaultMeshPoints(region) {
  return [
    { x: region.x + region.width / 3, y: region.y + region.height / 3 },
    { x: region.x + (region.width * 2) / 3, y: region.y + region.height / 3 },
    { x: region.x + region.width / 3, y: region.y + (region.height * 2) / 3 },
    {
      x: region.x + (region.width * 2) / 3,
      y: region.y + (region.height * 2) / 3,
    },
  ];
}

function getMeshPoints(region) {
  return Array.isArray(region.meshPoints) && region.meshPoints.length === 4
    ? region.meshPoints
    : getDefaultMeshPoints(region);
}

function resizeMeshPoints(initial, next) {
  return getMeshPoints(initial).map((point) => ({
    x: next.x + ((point.x - initial.x) / Math.max(initial.width, 1)) * next.width,
    y: next.y + ((point.y - initial.y) / Math.max(initial.height, 1)) * next.height,
  }));
}

function toLocalPoint(point, region, scale) {
  return {
    x: (point.x - region.x) * scale,
    y: (point.y - region.y) * scale,
  };
}

function useDebouncedValue(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debouncedValue;
}

export default function CanvasEditor({
  image,
  settings,
  warpRegions,
  setWarpRegions,
  selectedRegionId,
  setSelectedRegionId,
  showMesh,
  showWarpBox,
  liveWarpPreview,
  livePreviewQuality,
}) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const sourceCanvasRef = useRef(null);
  const interactionRef = useRef(null);
  const [previewSize, setPreviewSize] = useState(() => getPreviewSize(null));
  const [isInteracting, setIsInteracting] = useState(false);
  const [viewportSize, setViewportSize] = useState(() => getViewportSize());
  const [zoom, setZoom] = useState(1);
  const renderSettings = useDebouncedValue(settings, 120);
  const renderWarpRegions = useDebouncedValue(
    warpRegions,
    isInteracting && liveWarpPreview ? 28 : 90,
  );
  const scale = previewSize.scale || 1;
  const visualScale = scale * zoom;
  const fitZoom = getFitZoom(previewSize, viewportSize);
  const livePreviewScale =
    LIVE_PREVIEW_SCALES[livePreviewQuality] || LIVE_PREVIEW_SCALES.balanced;
  const renderResolutionScale = isInteracting && liveWarpPreview ? livePreviewScale : 1;
  const renderWidth = Math.max(1, Math.round(previewSize.width * renderResolutionScale));
  const renderHeight = Math.max(1, Math.round(previewSize.height * renderResolutionScale));
  const renderScale = scale * renderResolutionScale;
  const activeWarpRegions = isInteracting ? renderWarpRegions : warpRegions;

  useEffect(() => {
    setPreviewSize(getPreviewSize(image));
  }, [image]);

  useEffect(() => {
    const updateViewportSize = () => setViewportSize(getViewportSize());
    window.addEventListener("resize", updateViewportSize);
    return () => window.removeEventListener("resize", updateViewportSize);
  }, []);

  useEffect(() => {
    setZoom(getFitZoom(getPreviewSize(image), getViewportSize()));
  }, [image]);

  useEffect(() => {
    if (isInteracting && !liveWarpPreview) return;

    if (!image || !canvasRef.current || activeWarpRegions.length === 0) {
      const canvas = canvasRef.current;
      if (canvas) {
        const context = canvas.getContext("2d");
        canvas.width = renderWidth;
        canvas.height = renderHeight;
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (image) context.drawImage(image.element, 0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const sourceCanvas =
      sourceCanvasRef.current || document.createElement("canvas");
    sourceCanvasRef.current = sourceCanvas;
    sourceCanvas.width = renderWidth;
    sourceCanvas.height = renderHeight;

    const sourceContext = sourceCanvas.getContext("2d");
    sourceContext.imageSmoothingEnabled = true;
    sourceContext.imageSmoothingQuality = "high";
    sourceContext.clearRect(0, 0, renderWidth, renderHeight);
    sourceContext.drawImage(image.element, 0, 0, renderWidth, renderHeight);

    const scaledWarpRegions = activeWarpRegions.map((region) => ({
      ...region,
      x: region.x * renderScale,
      y: region.y * renderScale,
      width: region.width * renderScale,
      height: region.height * renderScale,
      points: region.points.map((point) => ({
        x: point.x * renderScale,
        y: point.y * renderScale,
      })),
      meshPoints: getMeshPoints(region).map((point) => ({
        x: point.x * renderScale,
        y: point.y * renderScale,
      })),
    }));

    applyBoxHeadWarp({
      sourceCanvas,
      targetCanvas: canvasRef.current,
      warpRegions: scaledWarpRegions,
      settings: renderSettings,
    });

    if (showMesh) {
      drawMeshOverlay(
        canvasRef.current.getContext("2d"),
        renderWidth,
        renderHeight,
        scaledWarpRegions,
        renderSettings,
      );
    }
  }, [
    image,
    activeWarpRegions,
    isInteracting,
    liveWarpPreview,
    renderHeight,
    renderScale,
    renderSettings,
    renderWidth,
    showMesh,
  ]);

  const regionOverlays = useMemo(
    () =>
      warpRegions.map((region) => ({
        ...region,
        style: {
          left: `${region.x * visualScale}px`,
          top: `${region.y * visualScale}px`,
          width: `${region.width * visualScale}px`,
          height: `${region.height * visualScale}px`,
        },
        scaledPoints: region.points.map((point) => ({
          x: (point.x - region.x) * visualScale,
          y: (point.y - region.y) * visualScale,
        })),
        scaledMeshPoints: getMeshPoints(region).map((point) =>
          toLocalPoint(point, region, visualScale),
        ),
      })),
    [visualScale, warpRegions],
  );

  const setNextZoom = (nextZoom) => {
    setZoom(clamp(nextZoom, MIN_ZOOM, MAX_ZOOM));
  };

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

  const beginInteraction = (event, mode, regionId, pointIndex = null) => {
    if (!image) return;
    event.preventDefault();
    stageRef.current?.setPointerCapture(event.pointerId);
    const region = warpRegions.find((item) => item.id === regionId);
    if (!region) return;
    setSelectedRegionId(regionId);
    setIsInteracting(true);
    interactionRef.current = {
      pointerId: event.pointerId,
      mode,
      regionId,
      pointIndex,
      start: pointToImage(event),
      initial: {
        ...region,
        points: region.points.map((point) => ({ ...point })),
        meshPoints: getMeshPoints(region).map((point) => ({ ...point })),
      },
    };
  };

  const moveInteraction = (event) => {
    const active = interactionRef.current;
    if (!active || !image || event.pointerId !== active.pointerId) return;

    const point = pointToImage(event);
    const dx = point.x - active.start.x;
    const dy = point.y - active.start.y;
    const initial = active.initial;

    setWarpRegions((current) => current.map((region) => {
      if (region.id !== active.regionId) return region;

      if (active.mode === "move") {
        const x = clamp(initial.x + dx, 0, image.width - initial.width);
        const y = clamp(initial.y + dy, 0, image.height - initial.height);
        return {
          ...initial,
          x,
          y,
          points: initial.points.map((sourcePoint) => ({
            x: sourcePoint.x + (x - initial.x),
            y: sourcePoint.y + (y - initial.y),
          })),
          meshPoints: initial.meshPoints.map((sourcePoint) => ({
            x: sourcePoint.x + (x - initial.x),
            y: sourcePoint.y + (y - initial.y),
          })),
        };
      }

      if (active.mode === "meshPoint") {
        return {
          ...initial,
          meshPoints: initial.meshPoints.map((sourcePoint, index) =>
            index === active.pointIndex
              ? {
                  x: clamp(sourcePoint.x + dx, initial.x, initial.x + initial.width),
                  y: clamp(sourcePoint.y + dy, initial.y, initial.y + initial.height),
                }
              : sourcePoint,
          ),
        };
      }

      if (active.mode === "point") {
        const points = initial.points.map((sourcePoint, index) =>
          index === active.pointIndex
            ? {
                x: clamp(sourcePoint.x + dx, 0, image.width),
                y: clamp(sourcePoint.y + dy, 0, image.height),
              }
            : sourcePoint,
        );
        const xs = points.map((sourcePoint) => sourcePoint.x);
        const ys = points.map((sourcePoint) => sourcePoint.y);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        const width = Math.max(MIN_BOX_SIZE, Math.max(...xs) - x);
        const height = Math.max(MIN_BOX_SIZE, Math.max(...ys) - y);
        return {
          ...initial,
          x,
          y,
          width,
          height,
          points,
          meshPoints: resizeMeshPoints(initial, { x, y, width, height }),
        };
      }

      const next = { ...initial, points: initial.points.map((sourcePoint) => ({ ...sourcePoint })) };
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
      next.points = [
        { x: next.x, y: next.y },
        { x: next.x + next.width, y: next.y },
        { x: next.x, y: next.y + next.height },
        { x: next.x + next.width, y: next.y + next.height },
      ];
      next.meshPoints = resizeMeshPoints(initial, next);

      return next;
    }));
  };

  const endInteraction = (event) => {
    const active = interactionRef.current;
    if (!active || event.pointerId !== active.pointerId) return;
    interactionRef.current = null;
    setIsInteracting(false);
  };

  return (
    <div className="editor-frame">
      {image && (
        <div className="zoom-toolbar" aria-label="Canvas zoom controls">
          <button type="button" onClick={() => setNextZoom(fitZoom)}>
            Fit
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => setNextZoom(zoom - 0.15)}>
            -
          </button>
          <output>{Math.round(zoom * 100)}%</output>
          <button type="button" aria-label="Zoom in" onClick={() => setNextZoom(zoom + 0.15)}>
            +
          </button>
        </div>
      )}
      <div
        ref={stageRef}
        className={`canvas-stage ${image ? "" : "is-empty"}`}
        style={{
          aspectRatio: `${previewSize.width} / ${previewSize.height}`,
          width: image ? `${previewSize.width * zoom}px` : undefined,
          maxWidth: image ? "none" : undefined,
        }}
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
            <h1>MeshWarp</h1>
            <p>by Larkin Art & Co.</p>
            <p>Upload an image to place a box-shaped warp field.</p>
          </div>
        )}

        {image &&
          showWarpBox &&
          regionOverlays.map((region) => (
            <div
              key={region.id}
              className={`warp-box ${region.id === selectedRegionId ? "is-selected" : ""} shape-${region.shape} mode-${region.mode}`}
              style={region.style}
              onPointerDown={(event) => beginInteraction(event, "move", region.id)}
            >
              {region.mode === "freeform" && (
                <svg className="freeform-outline" viewBox={`0 0 ${region.width * visualScale} ${region.height * visualScale}`}>
                  <polygon
                    points={getPolygonPoints(region.scaledPoints)
                      .map((point) => `${point.x},${point.y}`)
                      .join(" ")}
                  />
                </svg>
              )}
              {region.shape === "ticTacToe" && (
                <svg
                  className="tic-tac-toe-grid"
                  viewBox={`0 0 ${region.width * visualScale} ${region.height * visualScale}`}
                  aria-hidden="true"
                >
                  <polyline
                    points={`${region.scaledMeshPoints[0].x},0 ${region.scaledMeshPoints[0].x},${region.scaledMeshPoints[0].y} ${region.scaledMeshPoints[2].x},${region.scaledMeshPoints[2].y} ${region.scaledMeshPoints[2].x},${region.height * visualScale}`}
                  />
                  <polyline
                    points={`${region.scaledMeshPoints[1].x},0 ${region.scaledMeshPoints[1].x},${region.scaledMeshPoints[1].y} ${region.scaledMeshPoints[3].x},${region.scaledMeshPoints[3].y} ${region.scaledMeshPoints[3].x},${region.height * visualScale}`}
                  />
                  <polyline
                    points={`0,${region.scaledMeshPoints[0].y} ${region.scaledMeshPoints[0].x},${region.scaledMeshPoints[0].y} ${region.scaledMeshPoints[1].x},${region.scaledMeshPoints[1].y} ${region.width * visualScale},${region.scaledMeshPoints[1].y}`}
                  />
                  <polyline
                    points={`0,${region.scaledMeshPoints[2].y} ${region.scaledMeshPoints[2].x},${region.scaledMeshPoints[2].y} ${region.scaledMeshPoints[3].x},${region.scaledMeshPoints[3].y} ${region.width * visualScale},${region.scaledMeshPoints[3].y}`}
                  />
                </svg>
              )}
              <span className="warp-label">{region.name}</span>
              {region.mode === "box"
                ? ["nw", "ne", "sw", "se"].map((handle) => (
                    <button
                      key={handle}
                      className={`resize-handle handle-${handle}`}
                      aria-label={`Resize ${handle}`}
                      style={{ width: HANDLE_SIZE, height: HANDLE_SIZE }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        beginInteraction(event, handle, region.id);
                      }}
                    />
                  ))
                : region.scaledPoints.map((point, index) => (
                    <button
                      key={index}
                      className="mesh-point-handle"
                      aria-label={`Move mesh point ${index + 1}`}
                      style={{
                        left: `${point.x}px`,
                        top: `${point.y}px`,
                        width: HANDLE_SIZE,
                        height: HANDLE_SIZE,
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        beginInteraction(event, "point", region.id, index);
                      }}
                    />
                  ))}
              {region.shape === "ticTacToe" &&
                region.scaledMeshPoints.map((point, index) => (
                  <button
                    key={`mesh-${index}`}
                    className="inner-mesh-point-handle"
                    aria-label={`Move inner mesh point ${index + 1}`}
                    style={{
                      left: `${point.x}px`,
                      top: `${point.y}px`,
                      width: HANDLE_SIZE,
                      height: HANDLE_SIZE,
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      beginInteraction(event, "meshPoint", region.id, index);
                    }}
                  />
                ))}
            </div>
          ))}
      </div>
    </div>
  );
}
