/**
 * Deterministic pseudo-random utilities using wave functions.
 *
 * Unlike Math.random(), these produce consistent, repeatable outputs
 * for the same inputs. This means:
 * - Tests are deterministic (no flaky failures)
 * - Financial analytics produce reproducible results
 * - Same input data always yields same output
 *
 * Wave functions (sin/cos) are used instead of Math.random()
 * because they produce smooth, bounded, and well-distributed values
 * while remaining fully deterministic.
 *
 * Bloomberg Terminal principle: every number has a traceable source.
 */

const WAVE_SEED = 0.618033988749895; // Golden ratio conjugate

/**
 * Generate a deterministic pseudo-random float in [0, 1).
 * Uses a sine wave indexed on a counter.
 *
 * @param index  - Position index (different values give different results)
 * @param offset - Phase offset for variation (e.g., 0.3, 0.7)
 * @returns A value in [0, 1) that's deterministic for the same inputs
 */
export function waveRandom(index: number, offset: number = 0): number {
  const raw = Math.sin((index + WAVE_SEED) * 12.9898 + offset * 7.831) * 43758.5453;
  return raw - Math.floor(raw);
}

/**
 * Generate a deterministic value in [min, max].
 * Uses superimposed sine waves for richer distribution.
 *
 * @param index - Position index
 * @param min   - Minimum value (inclusive)
 * @param max   - Maximum value (exclusive)
 * @param freq  - Frequency multiplier (higher = more variation between indices)
 * @returns A value in [min, max)
 */
export function waveRange(index: number, min: number, max: number, freq: number = 0.7): number {
  const range = max - min;
  const value = Math.sin((index + WAVE_SEED) * freq) * 0.5 + 0.5; // [0, 1]
  return min + value * range;
}

/**
 * Generate a deterministic integer in [min, max].
 */
export function waveInt(index: number, min: number, max: number): number {
  return Math.floor(waveRange(index, min, max + 1));
}

/**
 * Deterministic shuffle using Fisher-Yates with wave-based random.
 * Same input array + same seed = same shuffled output.
 */
export function deterministicShuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(waveRandom(i, 0.3) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Deterministic normal-ish approximation using Box-Muller with waveRandom.
 */
export function waveNormal(index: number, mean: number = 0, stdDev: number = 1): number {
  const u1 = waveRandom(index, 0.1);
  const u2 = waveRandom(index, 0.9);
  const z = Math.sqrt(-2 * Math.log(Math.max(u1, 0.0001))) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}
