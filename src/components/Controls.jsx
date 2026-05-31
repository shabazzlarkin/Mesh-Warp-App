import React from "react";

const SLIDERS = [
  ["strength", "Strength", 0, 1.35, 0.01],
  ["horizontalStretch", "Horizontal Stretch", 0, 1.1, 0.01],
  ["verticalCompression", "Vertical Compression", 0, 0.9, 0.01],
  ["edgeSoftness", "Edge Softness", 0.04, 0.85, 0.01],
  ["warpWidth", "Warp Width", 0.12, 0.95, 0.01],
  ["warpHeight", "Warp Height", 0.12, 0.95, 0.01],
  ["meshResolution", "Mesh Resolution", 8, 56, 1],
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

export default function Controls({
  settings,
  setSettings,
  showMesh,
  setShowMesh,
  showWarpBox,
  setShowWarpBox,
  disabled,
  image,
  uploadLabel,
  onUpload,
  onReset,
  onExport,
}) {
  const updateSetting = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  return (
    <aside className="control-panel" aria-label="Box Head Warp controls">
      <div className="panel-header">
        <h2>Box Head Studio</h2>
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
      </div>

      <div className="sliders">
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
        <button type="button" disabled={disabled} onClick={() => onExport(1)}>
          Export Original Size PNG
        </button>
        <button type="button" disabled={disabled} onClick={() => onExport(2)}>
          Export 2x PNG
        </button>
        <button type="button" disabled={disabled} onClick={() => onExport(4)}>
          Export 4x PNG
        </button>
      </div>
    </aside>
  );
}
