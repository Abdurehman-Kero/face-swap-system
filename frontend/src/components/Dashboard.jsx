import React, { useState, useEffect } from "react";
import api, { buildAssetUrl } from "../services/api";
import "./Dashboard.css";

function Dashboard({ setIsAuthenticated }) {
  const [faces, setFaces] = useState([]);
  const [selectedFaceId, setSelectedFaceId] = useState(null);
  const [isSwapping, setIsSwapping] = useState(false);
  const [engineStatus, setEngineStatus] = useState({
    mode: "mock",
    available: true,
    message: "Mock mode active",
  });
  const [settings, setSettings] = useState({
    execution_provider: "cpu",
    frame_processor: "face_swapper",
    live_mirror: false,
  });
  const [uploading, setUploading] = useState(false);

  async function loadFaces() {
    try {
      const response = await api.get("/faces");
      setFaces(response.data);
      const activeFace = response.data.find((f) => f.is_active);
      if (activeFace) setSelectedFaceId(activeFace.id);
    } catch (error) {
      console.error("Failed to load faces:", error);
    }
  }

  async function loadSettings() {
    try {
      const response = await api.get("/auth/settings");
      setSettings(response.data);
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }

  async function checkSwapStatus() {
    try {
      const response = await api.get("/swap/status");
      setIsSwapping(response.data.isRunning);
      if (response.data.engine) {
        setEngineStatus(response.data.engine);
      }
    } catch (error) {
      console.error("Failed to check swap status:", error);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadFaces();
      loadSettings();
      checkSwapStatus();
    });
  }, []);

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("face", file);

    setUploading(true);
    try {
      await api.post("/faces/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await loadFaces();
    } catch (error) {
      alert(
        "Upload failed: " + (error.response?.data?.error || "Unknown error"),
      );
    } finally {
      setUploading(false);
    }
  };

  const startSwap = async () => {
    if (!selectedFaceId) {
      alert("Please select a face image first");
      return;
    }
    try {
      const response = await api.post("/swap/start", {
        faceImageId: selectedFaceId,
      });
      setIsSwapping(true);
      if (response.data.engine) {
        setEngineStatus(response.data.engine);
      }
      alert(
        "Face swap started! Open your video app and select OBS Virtual Camera.",
      );
    } catch (error) {
      alert(
        "Failed to start swap: " +
          (error.response?.data?.error || "Unknown error"),
      );
    }
  };

  const stopSwap = async () => {
    try {
      const response = await api.post("/swap/stop");
      setIsSwapping(false);
      if (response.data.engine) {
        setEngineStatus(response.data.engine);
      }
      alert("Face swap stopped.");
    } catch (error) {
      alert(
        "Failed to stop swap: " +
          (error.response?.data?.error || "Unknown error"),
      );
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setIsAuthenticated(false);
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Face Swap System</h1>
        <button onClick={logout} className="logout-btn">
          Logout
        </button>
      </header>

      <div className="dashboard-grid">
        {/* Left Panel - Face Images */}
        <div className="panel faces-panel">
          <h2>Your Faces</h2>
          <div className="upload-area">
            <input
              type="file"
              id="face-upload"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: "none" }}
            />
            <label htmlFor="face-upload" className="upload-btn">
              {uploading ? "Uploading..." : "+ Upload New Face"}
            </label>
          </div>
          <div className="faces-grid">
            {faces.map((face) => (
              <div
                key={face.id}
                className={`face-card ${selectedFaceId === face.id ? "selected" : ""}`}
                onClick={() => setSelectedFaceId(face.id)}
              >
                <img
                  src={buildAssetUrl(face.image_path)}
                  alt={face.original_filename}
                />
                <span>{face.original_filename}</span>
              </div>
            ))}
            {faces.length === 0 && (
              <p className="no-faces">
                No faces uploaded yet. Upload your first face image!
              </p>
            )}
          </div>
        </div>

        {/* Center Panel - Controls */}
        <div className="panel controls-panel">
          <h2>Control Panel</h2>
          <div className="status-indicator">
            <div
              className={`status-led ${isSwapping ? "active" : "inactive"}`}
            ></div>
            <span>Status: {isSwapping ? "SWAPPING ACTIVE" : "IDLE"}</span>
          </div>
          <p className="engine-status-text">
            Engine Mode: {engineStatus.mode?.toUpperCase() || "UNKNOWN"} |{" "}
            {engineStatus.available ? "Connected" : "Unavailable"}
          </p>
          {!isSwapping ? (
            <button
              onClick={startSwap}
              className="btn-start"
              disabled={!selectedFaceId}
            >
              Start Face Swap
            </button>
          ) : (
            <button onClick={stopSwap} className="btn-stop">
              Stop Face Swap
            </button>
          )}
          <div className="instructions">
            <h3>How to Use:</h3>
            <ol>
              <li>Upload a clear front-facing photo</li>
              <li>Select the face you want to use</li>
              <li>Click "Start Face Swap"</li>
              <li>Open WhatsApp, Telegram, or Zoom</li>
              <li>Select "OBS Virtual Camera" as your camera</li>
              <li>Your face is now swapped!</li>
            </ol>
          </div>
        </div>

        {/* Right Panel - Settings */}
        <div className="panel settings-panel">
          <h2>Performance Settings</h2>
          <div className="setting-group">
            <label>Execution Provider:</label>
            <select
              value={settings.execution_provider}
              onChange={(e) =>
                setSettings({ ...settings, execution_provider: e.target.value })
              }
            >
              <option value="cpu">CPU (Slower)</option>
              <option value="cuda">CUDA (NVIDIA GPU - Fastest)</option>
              <option value="directml">DirectML (AMD/Intel)</option>
            </select>
          </div>
          <div className="setting-group">
            <label>
              <input
                type="checkbox"
                checked={settings.live_mirror}
                onChange={(e) =>
                  setSettings({ ...settings, live_mirror: e.target.checked })
                }
              />
              Mirror Live View
            </label>
          </div>
          <button
            onClick={async () => {
              try {
                await api.post("/auth/settings", settings);
                alert("Settings saved!");
              } catch {
                alert("Failed to save settings");
              }
            }}
            className="save-btn"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
