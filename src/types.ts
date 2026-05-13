export interface Coordinate {
  lat: number;
  lng: number;
  step?: number;
}

export interface FlightEndpoint {
  lat: number;
  lng: number;
  city: string;
  code: string;
  zone?: string;
  label?: string;
}

export interface Flight {
  id: string;
  callsign: string;
  origin: FlightEndpoint;
  destination: FlightEndpoint;
  status: 'on-time' | 'delayed' | 'conflict' | 'emergency';
  delayMinutes?: number;
  altitude: number;
  velocity: number;
  verticalRate?: number;
  lastUpdate: string;
  history?: Coordinate[];
  prediction?: Coordinate[];
  heading?: number;
  originCountry?: string;
  zone?: string;
  locationLabel?: string;
  futureConflict?: boolean;
  source?: 'live' | 'local' | 'unavailable';
}

export interface ConflictLocation extends Coordinate {
  place: string;
  zone: string;
  sector: string;
  label: string;
  macroRegion: string;
}

export interface Conflict {
  id: string;
  id1: string;
  id2: string;
  dist: number;
  riskLevel: 'high' | 'medium' | 'low';
  pathType?: 'current' | 'future';
  step?: number;
  location: ConflictLocation;
}

export interface DensityCell extends ConflictLocation {
  count: number;
  intensity: number;
  average_altitude?: number;
  average_velocity?: number;
  average_vertical_rate?: number;
  altitude_std?: number;
  velocity_std?: number;
}

export interface DensityHotspot extends DensityCell {}

export interface HazardZone extends ConflictLocation {
  id: string;
  kind: 'weather' | 'turbulence';
  radius_km: number;
  intensity: number;
  severity: 'high' | 'medium' | 'low';
  flight_count: number;
  average_altitude?: number;
  average_velocity?: number;
  average_vertical_rate?: number;
  summary: string;
  source?: string;
}

export interface BriefingDriver {
  label: string;
  value: string;
  impact: string;
}

export interface DashboardBriefing {
  headline: string;
  summary: string;
  zone_focus: string[];
  key_drivers: BriefingDriver[];
  recommended_actions: string[];
}

export interface DashboardAnalysis {
  total_flights: number;
  density_hotspots: DensityHotspot[];
  density_map: DensityCell[];
  weather_zones: HazardZone[];
  turbulence_zones: HazardZone[];
  briefing: DashboardBriefing;
  efficiency_score: number;
  average_velocity: number;
  average_altitude: number;
  conflict_ratio: number;
  future_conflict_ratio: number;
}

export interface DashboardState {
  states: Flight[];
  conflicts: Conflict[];
  future_conflicts: Conflict[];
  analysis: DashboardAnalysis | null;
  timestamp: string;
  source: 'live' | 'local' | 'unavailable';
  error?: string;
}

export type DelayDatasetMode = 'demo' | 'full';

export interface DelayModeOption {
  value: DelayDatasetMode;
  label: string;
}

export interface DelayTailOption {
  value: string;
  label: string;
}

export interface DelayScenarioDefaults {
  wind_speed_kmh: number;
  precipitation_mm: number;
  visibility_m: number;
}

export interface DelayMetadata {
  modes: DelayModeOption[];
  mode: DelayDatasetMode;
  tails: DelayTailOption[];
  default_tail: string | null;
}

export interface DelayDatesResponse {
  mode: DelayDatasetMode;
  tail: string | null;
  tail_label: string;
  dates: string[];
  default_date: string | null;
  defaults: DelayScenarioDefaults | null;
}

export interface DelayDriver {
  feature: string;
  label: string;
  impact: number;
  direction: 'increase' | 'decrease';
  value: string;
}

export interface DelaySummary {
  total_flights: number;
  cumulative_delay: number;
  max_delay: number;
  average_delay: number;
}

export interface DelayTimelineItem {
  id: string;
  label: string;
  route: string;
  scheduled_departure: string | null;
  scheduled_arrival: string | null;
  predicted_departure: string | null;
  predicted_arrival: string | null;
}

export interface DelayFlightBreakdown {
  id: string;
  sequence: number;
  route: string;
  origin: string;
  destination: string;
  scheduled_departure: string | null;
  scheduled_arrival: string | null;
  predicted_departure: string | null;
  predicted_arrival: string | null;
  base_delay: number;
  propagation_delay: number;
  spill_delay: number;
  final_delay: number;
  cumulative_delay: number;
  drivers: DelayDriver[];
}

export interface DelaySimulationResult {
  engine_mode?: 'ml' | 'fallback';
  mode: DelayDatasetMode;
  modes: DelayModeOption[];
  tail: string;
  tail_label: string;
  selected_date: string;
  available_dates: string[];
  defaults: DelayScenarioDefaults;
  summary: DelaySummary;
  timeline: DelayTimelineItem[];
  flights: DelayFlightBreakdown[];
}

export type MapLayer = 'traffic' | 'weather' | 'turbulence' | 'density';
