import {
  DelayDatesResponse,
  DelayDatasetMode,
  DelayMetadata,
  DelayScenarioDefaults,
  DelaySimulationResult,
} from "../types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

const fetchDelayJson = async <T>(input: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, {
    cache: "no-store",
    ...init,
  });

  if (!response.ok) {
    let detail = `Request failed with ${response.status}`;
    try {
      const payload = await response.json();
      detail = payload.detail ?? detail;
    } catch {
      // Ignore JSON parsing failures and keep the status message.
    }
    throw new Error(detail);
  }

  return await response.json() as T;
};

export const getDelayMetadata = async (mode: DelayDatasetMode = "demo") =>
  fetchDelayJson<DelayMetadata>(`${BASE_URL}/delay-propagation/meta?mode=${mode}`);

export const getDelayDates = async (mode: DelayDatasetMode, tail: string) =>
  fetchDelayJson<DelayDatesResponse>(
    `${BASE_URL}/delay-propagation/dates?mode=${mode}&tail=${encodeURIComponent(tail)}`,
  );

export const runDelaySimulation = async (input: {
  mode: DelayDatasetMode;
  tail: string;
  date: string;
  overrides?: Partial<DelayScenarioDefaults>;
}) =>
  fetchDelayJson<DelaySimulationResult>(`${BASE_URL}/delay-propagation/simulate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
