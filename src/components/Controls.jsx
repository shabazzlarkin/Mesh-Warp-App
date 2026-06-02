import React from "react";

const SLIDERS = [
  ["strength", "Strength", 0, 1.35, 0.01],
  ["horizontalStretch", "Horizontal Stretch", 0, 1.1, 0.01],
  ["verticalCompression", "Vertical Compression", 0, 0.9, 0.01],
  ["edgeSoftness", "Edge Softness", 0.04, 0.85, 0.01],
  ["meshResolution", "Mesh Resolution", 8, 56, 1],
];

const SIZE_SLIDERS = [
  ["warpWidth", "Warp Width", 0.12, 0.95, 0.01],
  ["warpHeight", "Warp Height", 0.12, 0.95, 0.01],
];

function Slider({ id, label, min, max, step, value, disabled, onChange }) {
  return (
    <label className="slider-row" htmlFor={id}>
      <span>
        <span>{label}</span>
        <output>{id === "meshResolution" ? Math.round(value) : value.toFixed(2)}</output>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(id, Number(event.target.value))}
      />
    </label>
  );
}

function Toggle({ label, checked, disabled, onChange }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function makeDefaultMeshPoints(region) {
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

function resizeMeshPoints(region, nextBox) {
  const meshPoints =
    Array.isArray(region.meshPoints) && region.meshPoints.length === 4
      ? region.meshPoints
      : makeDefaultMeshPoints(region);

  return meshPoints.map((point) => ({
    x:
      nextBox.x +
      ((point.x - region.x) / Math.max(region.width, 1)) * nextBox.width,
    y:
      nextBox.y +
      ((point.y - region.y) / Math.max(region.height, 1)) * nextBox.height,
  }));
}

export default function Controls({
  settings,
  setSettings,
  showMesh,
  setShowMesh,
  showWarpBox,
  setShowWarpBox,
  liveWarpPreview,
  setLiveWarpPreview,
  livePreviewQuality,
  setLivePreviewQuality,
  disabled,
  exportStatus,
  image,
  warpRegions,
  selectedRegion,
  selectedRegionId,
  setSelectedRegionId,
  onAddRegion,
  onRemoveRegion,
  onUpdateSelectedRegion,
  uploadLabel,
  onUpload,
  onReset,
  onExport,
}) {
  const isExporting = exportStatus?.state === "exporting";
  const exportProgress = Math.round((exportStatus?.progress || 0) * 100);

  const updateSetting = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const updateSizeSetting = (key, value) => {
    updateSetting(key, value);
    if (!image || !selectedRegion) return;

    const nextWidth =
      key === "warpWidth" ? image.width * value : selectedRegion.width;
    const nextHeight =
      key === "warpHeight" ? image.height * value : selectedRegion.height;
    const centerX = selectedRegion.x + selectedRegion.width / 2;
    const centerY = selectedRegion.y + selectedRegion.height / 2;
    const width = Math.min(image.width, Math.max(40, nextWidth));
    const height = Math.min(image.height, Math.max(40, nextHeight));
    const x = Math.max(0, Math.min(image.width - width, centerX - width / 2));
    const y = Math.max(0, Math.min(image.height - height, centerY - height / 2));
    onUpdateSelectedRegion({
      x,
      y,
      width,
      height,
      points: [
        { x, y },
        { x: x + width, y },
        { x, y: y + height },
        { x: x + width, y: y + height },
      ],
      meshPoints: resizeMeshPoints(selectedRegion, { x, y, width, height }),
    });
  };

  const updateMode = (mode) => {
    if (!selectedRegion) return;
    const { x, y, width, height } = selectedRegion;
    onUpdateSelectedRegion({
      mode,
      points:
        mode === "box"
          ? [
              { x, y },
              { x: x + width, y },
              { x, y: y + height },
              { x: x + width, y: y + height },
            ]
          : selectedRegion.points,
    });
  };

  const updateShape = (shape) => {
    if (!selectedRegion) return;
    onUpdateSelectedRegion({
      shape,
      meshPoints:
        shape === "ticTacToe" &&
        (!Array.isArray(selectedRegion.meshPoints) ||
          selectedRegion.meshPoints.length !== 4)
          ? makeDefaultMeshPoints(selectedRegion)
          : selectedRegion.meshPoints,
    });
  };

  return (
    <aside className="control-panel" aria-label="MeshWarp controls">
      <div className="panel-header">
        <h2>MeshWarp</h2>
        <p>by Larkin Art & Co.</p>
        <p>{image ? `${image.width} x ${image.height}px` : "Local mesh-warp image tool"}</p>
      </div>

      <div className="button-grid">
        <button className="primary-button" type="button" onClick={onUpload}>
          {uploadLabel}
        </button>
        <button type="button" disabled={disabled} onClick={onReset}>
          Reset Warp
        </button>
      </div>

      <div className="region-tools">
        <div className="section-title">Warp Regions</div>
        <div className="button-grid">
          <button type="button" disabled={disabled} onClick={onAddRegion}>
            Add Warp Box
          </button>
          <button type="button" disabled={disabled || !selectedRegion} onClick={onRemoveRegion}>
            Remove Selected
          </button>
        </div>
        <label className="select-row" htmlFor="region-select">
          <span>Active Region</span>
          <select
            id="region-select"
            disabled={disabled || warpRegions.length === 0}
            value={selectedRegionId || ""}
            onChange={(event) => setSelectedRegionId(event.target.value)}
          >
            {warpRegions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </select>
        </label>
        <label className="select-row" htmlFor="shape-select">
          <span>Mesh Shape</span>
          <select
            id="shape-select"
            disabled={disabled || !selectedRegion}
            value={selectedRegion?.shape || "rectangle"}
            onChange={(event) => updateShape(event.target.value)}
          >
            <option value="rectangle">Rectangle</option>
            <option value="ellipse">Ellipse</option>
            <option value="diamond">Diamond</option>
            <option value="ticTacToe">Tic-Tac-Toe</option>
          </select>
        </label>
        <label className="select-row" htmlFor="mode-select">
          <span>Corner Mode</span>
          <select
            id="mode-select"
            disabled={disabled || !selectedRegion}
            value={selectedRegion?.mode || "box"}
            onChange={(event) => updateMode(event.target.value)}
          >
            <option value="box">Keep Box Shape</option>
            <option value="freeform">Freeform Corners</option>
          </select>
        </label>
      </div>

      <div className="toggle-group">
        <Toggle
          label="Show Warp Box"
          checked={showWarpBox}
          disabled={disabled}
          onChange={setShowWarpBox}
        />
        <Toggle
          label="Show Mesh"
          checked={showMesh}
          disabled={disabled}
          onChange={setShowMesh}
        />
        <Toggle
          label="Live Warp Preview"
          checked={liveWarpPreview}
          disabled={disabled}
          onChange={setLiveWarpPreview}
        />
        <label className="select-row" htmlFor="preview-quality-select">
          <span>Live Preview Quality</span>
          <select
            id="preview-quality-select"
            disabled={disabled || !liveWarpPreview}
            value={livePreviewQuality}
            onChange={(event) => setLivePreviewQuality(event.target.value)}
          >
            <option value="fast">Fast</option>
            <option value="balanced">Balanced</option>
            <option value="sharp">Sharp</option>
          </select>
        </label>
      </div>

      <div className="sliders">
        {SIZE_SLIDERS.map(([id, label, min, max, step]) => (
          <Slider
            key={id}
            id={id}
            label={label}
            min={min}
            max={max}
            step={step}
            value={settings[id]}
            disabled={disabled || !selectedRegion}
            onChange={updateSizeSetting}
          />
        ))}
        {SLIDERS.map(([id, label, min, max, step]) => (
          <Slider
            key={id}
            id={id}
            label={label}
            min={min}
            max={max}
            step={step}
            value={settings[id]}
            disabled={disabled}
            onChange={updateSetting}
          />
        ))}
      </div>

      <div className="export-group">
        <button type="button" disabled={disabled || isExporting} onClick={() => onExport(1)}>
          Export Original Size PNG
        </button>
        <button type="button" disabled={disabled || isExporting} onClick={() => onExport(2)}>
          Export 2x PNG
        </button>
        <button type="button" disabled={disabled || isExporting} onClick={() => onExport(4)}>
          Export 4x PNG
        </button>
        {exportStatus?.state !== "idle" && (
          <div className={`export-status is-${exportStatus.state}`} role="status" aria-live="polite">
            <div className="export-status-header">
              <span>{exportStatus.message}</span>
              <span>{exportProgress}%</span>
            </div>
            <div className="progress-track" aria-hidden="true">
              <div
                className="progress-fill"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
            {exportStatus.downloadUrl && (
              <a className="download-link" href={exportStatus.downloadUrl} download={exportStatus.filename}>
                Save PNG
              </a>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
