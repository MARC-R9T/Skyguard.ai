import { Coordinate, DashboardState, Flight } from "../types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const DASHBOARD_REQUEST_TIMEOUT_MS = 15000;
const PREDICTION_REQUEST_TIMEOUT_MS = 20000;

const EMPTY_DASHBOARD_STATE: DashboardState = {
  states: [],
  conflicts: [],
  future_conflicts: [],
  analysis: null,
  timestamp: new Date().toISOString(),
  source: "unavailable",
};

const fetchWithTimeout = async (input: string, init: RequestInit = {}, timeoutMs: number) => {
  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), timeoutMs);
  const externalSignal = init.signal;
  const forwardAbort = () => timeoutController.abort();

  if (externalSignal) {
    if (externalSignal.aborted) {
      timeoutController.abort();
    } else {
      externalSignal.addEventListener("abort", forwardAbort, { once: true });
    }
  }

  try {
    return await fetch(input, {
      ...init,
      signal: timeoutController.signal,
    });
  } catch (error) {
    if (timeoutController.signal.aborted && !externalSignal?.aborted) {
      throw new Error("Request timed out");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", forwardAbort);
  }
};

export async function getDashboardState(signal?: AbortSignal): Promise<DashboardState> {
  try {
    const response = await fetchWithTimeout(
      `${BASE_URL}/dashboard`,
      {
        signal,
        cache: "no-store",
        headers: { Connection: "close" },
      },
      DASHBOARD_REQUEST_TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error(`Dashboard request failed with ${response.status}`);
    }

    const data = await response.json();
    return {
      ...EMPTY_DASHBOARD_STATE,
      ...data,
      analysis: data.analysis ?? null,
      states: data.states ?? [],
      conflicts: data.conflicts ?? [],
      future_conflicts: data.future_conflicts ?? [],
      error: data.error,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    console.error("Dashboard error:", error);
    return {
      ...EMPTY_DASHBOARD_STATE,
      error: error instanceof Error ? error.message : "Dashboard request failed",
      timestamp: new Date().toISOString(),
    };
  }
}

export async function getFlights(): Promise<Flight[]> {
  const data = await getDashboardState();
  return data.states;
}

export async function getConflicts() {
  const data = await getDashboardState();
  return {
    conflicts: data.conflicts,
    future_conflicts: data.future_conflicts,
  };
}

export async function getPrediction(input: { trajectory: number[][]; steps?: number }) {
  try {
    const response = await fetchWithTimeout(
      `${BASE_URL}/predict`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      },
      PREDICTION_REQUEST_TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error(`Prediction request failed with ${response.status}`);
    }

    return await response.json() as { result: Coordinate[]; error?: string };
  } catch (error) {
    console.error("Prediction error:", error);
    return null;
  }
}
