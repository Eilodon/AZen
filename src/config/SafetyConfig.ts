
export const SafetyConfig = {
  clocks: {
    controlHz: 10,
    maxFrameDtSec: 0.1,
    maxControlStepsPerFrame: 3,
  },
  vitals: {
    hrHardMin: 30,
    hrHardMax: 220,
    hrSoftMin: 40,
    hrSoftMax: 200,
  },
  tempo: {
    min: 1.0,
    max: 1.3,
    upStep: 0.002,
    downStep: 0.001,
    lowAlign: 0.35,
    highAlign: 0.8,
    deadband: 0.01,
  },
  safety: {
    minSessionSecBeforeEmergency: 10,
  },
  persistence: {
    retentionMs: 7 * 24 * 60 * 60 * 1000,
  }
} as const;

export type SafetyConfigType = typeof SafetyConfig;
