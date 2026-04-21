const MODE = (process.env.SWAP_ENGINE_MODE || "mock").toLowerCase();
const BASE_URL = process.env.SWAP_ENGINE_URL || "http://127.0.0.1:8765";
const REQUEST_TIMEOUT_MS = Number(process.env.SWAP_ENGINE_TIMEOUT_MS || 5000);

const isEngineMode = () => MODE === "engine";

const request = async (method, endpoint, body) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = data.error || `${response.status} ${response.statusText}`;
      const error = new Error(message);
      error.statusCode = response.status;
      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
};

const health = async () => {
  if (!isEngineMode()) {
    return { available: true, mode: "mock", message: "Mock mode active" };
  }

  try {
    const data = await request("GET", "/health");
    return {
      available: true,
      mode: "engine",
      details: data,
      message: "Engine connected",
    };
  } catch (error) {
    return {
      available: false,
      mode: "engine",
      message: error.message || "Engine unavailable",
    };
  }
};

const startSession = async (payload) => {
  if (!isEngineMode()) {
    return { success: true, isRunning: true, mode: "mock" };
  }

  return request("POST", "/session/start", payload);
};

const stopSession = async (payload) => {
  if (!isEngineMode()) {
    return { success: true, isRunning: false, mode: "mock" };
  }

  return request("POST", "/session/stop", payload);
};

const getSessionStatus = async (payload) => {
  if (!isEngineMode()) {
    return { success: true, isRunning: false, mode: "mock" };
  }

  return request("POST", "/session/status", payload);
};

module.exports = {
  isEngineMode,
  health,
  startSession,
  stopSession,
  getSessionStatus,
};
