import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CanvasEditor from "./components/CanvasEditor.jsx";
import Controls from "./components/Controls.jsx";
import { exportWarpedImage } from "./utils/imageExport.js";

const DEFAULT_SETTINGS = {
  strength: 0.78,
  horizontalStretch: 0.48,
  verticalCompression: 0.38,
  edgeSoftness: 0.34,
  warpWidth: 0.42,
  warpHeight: 0.42,
  meshResolution: 26,
};

function makeWarpRegion(image, settings, index = 0) {
  const width = Math.min(image.width * settings.warpWidth, image.width);
  const height = Math.min(image.height * settings.warpHeight, image.height);
  const offset = index * Math.min(image.width, image.height) * 0.04;
  const x = Math.max(0, Math.min(image.width - width, image.width / 2 - width / 2 + offset));
  const y = Math.max(0, Math.min(image.height - height, image.height / 2 - height / 2 + offset));
  return {
    id: crypto.randomUUID(),
    name: `Warp ${index + 1}`,
    x,
    y,
    width,
    height,
    mode: "box",
    shape: "rectangle",
    points: [
      { x, y },
      { x: x + width, y },
      { x, y: y + height },
      { x: x + width, y: y + height },
    ],
    meshPoints: makeTicTacToeMeshPoints({ x, y, width, height }),
  };
}

function makeTicTacToeMeshPoints(region) {
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

function getNextRegionIndex(regions) {
  return regions.reduce((maxIndex, region, index) => {
    const match = region.name?.match(/^Warp (\d+)$/);
    return Math.max(maxIndex, match ? Number(match[1]) : index + 1);
  }, 0);
}

export default function App() {
  const fileInputRef = useRef(null);
  const [image, setImage] = useState(null);
  const [warpRegions, setWarpRegions] = useState([]);
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [showMesh, setShowMesh] = useState(false);
  const [showWarpBox, setShowWarpBox] = useState(true);
  const [liveWarpPreview, setLiveWarpPreview] = useState(true);
  const [livePreviewQuality, setLivePreviewQuality] = useState("balanced");
  const [exportStatus, setExportStatus] = useState({
    state: "idle",
    message: "",
    progress: 0,
    downloadUrl: "",
    filename: "",
  });

  const hasImage = Boolean(image);

  const controlsDisabled = !hasImage;

  const uploadLabel = useMemo(
    () => (image ? "Change Image" : "Upload Image"),
    [image],
  );

  const handleUploadClick = () => fileInputRef.current?.click();
  const selectedRegion = warpRegions.find((region) => region.id === selectedRegionId) || null;

  useEffect(
    () => () => {
      if (exportStatus.downloadUrl) URL.revokeObjectURL(exportStatus.downloadUrl);
    },
    [exportStatus.downloadUrl],
  );

  const handleFileChange = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage((previous) => {
        if (previous?.url) URL.revokeObjectURL(previous.url);
        return {
          element: img,
          url: objectUrl,
          name: file.name,
          width: img.naturalWidth,
          height: img.naturalHeight,
        };
      });
      const firstRegion = makeWarpRegion(
        { width: img.naturalWidth, height: img.naturalHeight },
        DEFAULT_SETTINGS,
        0,
      );
      setWarpRegions([firstRegion]);
      setSelectedRegionId(firstRegion.id);
      event.target.value = "";
    };
    img.src = objectUrl;
  }, []);

  const resetWarp = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    if (!image) {
      setWarpRegions([]);
      setSelectedRegionId(null);
      return;
    }
    const firstRegion = makeWarpRegion(image, DEFAULT_SETTINGS, 0);
    setWarpRegions([firstRegion]);
    setSelectedRegionId(firstRegion.id);
  }, [image]);

  const addWarpRegion = useCallback(() => {
    if (!image) return;
    setWarpRegions((current) => {
      const next = makeWarpRegion(image, settings, getNextRegionIndex(current));
      setSelectedRegionId(next.id);
      return [...current, next];
    });
  }, [image, settings]);

  const removeSelectedRegion = useCallback(() => {
    if (!selectedRegionId) return;
    setWarpRegions((current) => {
      const next = current.filter((region) => region.id !== selectedRegionId);
      setSelectedRegionId(next[0]?.id || null);
      return next;
    });
  }, [selectedRegionId]);

  const updateSelectedRegion = useCallback(
    (updates) => {
      if (!selectedRegionId) return;
      setWarpRegions((current) =>
        current.map((region) =>
          region.id === selectedRegionId ? { ...region, ...updates } : region,
        ),
      );
    },
    [selectedRegionId],
  );

  const exportImage = useCallback(
    async (scale) => {
      if (!image || exportStatus.state === "exporting") return;
      if (exportStatus.downloadUrl) URL.revokeObjectURL(exportStatus.downloadUrl);

      setExportStatus({
        state: "exporting",
        message: `Preparing ${scale}x PNG...`,
        progress: 0,
        downloadUrl: "",
        filename: "",
      });

      try {
        const result = await exportWarpedImage({
          image,
          warpRegions,
          settings,
          scale,
          filename: `mesh-warp-larkin-${scale}x.png`,
          onProgress: (progress) => {
            setExportStatus({
              state: "exporting",
              message:
                progress < 0.9
                  ? `Rendering ${scale}x PNG...`
                  : `Packaging ${scale}x PNG...`,
              progress,
            });
          },
        });
        setExportStatus({
          state: "complete",
          message: `Exported ${scale}x PNG.`,
          progress: 1,
          downloadUrl: result.downloadUrl,
          filename: result.filename,
        });
      } catch (error) {
        setExportStatus({
          state: "error",
          message: error instanceof Error ? error.message : "Export failed.",
          progress: 0,
          downloadUrl: "",
          filename: "",
        });
      }
    },
    [exportStatus.state, image, settings, warpRegions],
  );

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="Image editor">
        <CanvasEditor
          image={image}
          settings={settings}
          warpRegions={warpRegions}
          setWarpRegions={setWarpRegions}
          selectedRegionId={selectedRegionId}
          setSelectedRegionId={setSelectedRegionId}
          showMesh={showMesh}
          showWarpBox={showWarpBox}
          liveWarpPreview={liveWarpPreview}
          livePreviewQuality={livePreviewQuality}
        />
      </section>

      <Controls
        settings={settings}
        setSettings={setSettings}
        showMesh={showMesh}
        setShowMesh={setShowMesh}
        showWarpBox={showWarpBox}
        setShowWarpBox={setShowWarpBox}
        liveWarpPreview={liveWarpPreview}
        setLiveWarpPreview={setLiveWarpPreview}
        livePreviewQuality={livePreviewQuality}
        setLivePreviewQuality={setLivePreviewQuality}
        disabled={controlsDisabled}
        exportStatus={exportStatus}
        image={image}
        warpRegions={warpRegions}
        selectedRegion={selectedRegion}
        selectedRegionId={selectedRegionId}
        setSelectedRegionId={setSelectedRegionId}
        onAddRegion={addWarpRegion}
        onRemoveRegion={removeSelectedRegion}
        onUpdateSelectedRegion={updateSelectedRegion}
        uploadLabel={uploadLabel}
        onUpload={handleUploadClick}
        onReset={resetWarp}
        onExport={exportImage}
      />

      <input
        ref={fileInputRef}
        className="hidden-input"
        type="file"
        accept="image/*"
        onChange={handleFileChange}
      />
      <footer className="app-credit">Created by Shabazz Larkin.</footer>
    </main>
  );
}
