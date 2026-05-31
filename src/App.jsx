import React, { useCallback, useMemo, useRef, useState } from "react";
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

export default function App() {
  const fileInputRef = useRef(null);
  const [image, setImage] = useState(null);
  const [warpBox, setWarpBox] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [showMesh, setShowMesh] = useState(false);
  const [showWarpBox, setShowWarpBox] = useState(true);

  const hasImage = Boolean(image);

  const controlsDisabled = !hasImage;

  const uploadLabel = useMemo(
    () => (image ? "Change Image" : "Upload Image"),
    [image],
  );

  const handleUploadClick = () => fileInputRef.current?.click();

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
      setWarpBox(null);
      event.target.value = "";
    };
    img.src = objectUrl;
  }, []);

  const resetWarp = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    setWarpBox(null);
  }, []);

  const exportImage = useCallback(
    (scale) => {
      if (!image) return;
      exportWarpedImage({
        image,
        warpBox,
        settings,
        scale,
        filename: `box-head-studio-${scale}x.png`,
      });
    },
    [image, settings, warpBox],
  );

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="Image editor">
        <CanvasEditor
          image={image}
          settings={settings}
          warpBox={warpBox}
          setWarpBox={setWarpBox}
          showMesh={showMesh}
          showWarpBox={showWarpBox}
        />
      </section>

      <Controls
        settings={settings}
        setSettings={setSettings}
        showMesh={showMesh}
        setShowMesh={setShowMesh}
        showWarpBox={showWarpBox}
        setShowWarpBox={setShowWarpBox}
        disabled={controlsDisabled}
        image={image}
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
    </main>
  );
}
