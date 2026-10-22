/**
 * Types shared with the native module (`modules/gps-tracker`).
 *
 * Phase 0 surface only: capabilities plus the tick probe. The real recording
 * contract (meta, fix log, state machine) lands in Phases 1–2 of
 * `docs/recording-plan.md`.
 */

export interface GpsTrackerCapabilities {
  /** False on iOS, where the module is a compiled stub (D6/D7). */
  canRecord: boolean;
  hasBarometer: boolean;
  canExemptBattery: boolean;
}

/** A service heartbeat. Display only — canonical numbers are replayed in TS. */
export interface GpsTrackerTick {
  count: number;
  elapsedMs: number;
}

/**
 * A type alias, not an interface: the event map must satisfy
 * `Record<string, (...args: any[]) => void>`, and an interface (which stays open
 * to declaration merging) is not assignable to an index signature.
 */
export type GpsTrackerEventMap = {
  onTick: (tick: GpsTrackerTick) => void;
};
