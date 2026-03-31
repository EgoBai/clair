/**
 * Data Quality Engine
 *
 * Validates, cleans, and scores financial data quality.
 * Detects anomalies, missing data, and inconsistencies.
 */

export interface DataQualityCheck {
  name: string;
  passed: boolean;
  severity: 'error' | 'warning' | 'info';
  message: string;
  affectedRows: number[];
}

export interface DataQualityReport {
  score: number; // 0-100
  checks: DataQualityCheck[];
  completeness: number;
  accuracy: number;
  consistency: number;
  timeliness: number;
  anomalies: AnomalyRecord[];
}

export interface AnomalyRecord {
  index: number;
  field: string;
  value: number;
  expected: number;
  deviation: number;
  type: 'outlier' | 'missing' | 'invalid' | 'inconsistent';
}

export interface OHLCVRecord {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

/**
 * Validate OHLCV data integrity
 */
export function validateOHLCV(data: OHLCVRecord[]): DataQualityCheck[] {
  const checks: DataQualityCheck[] = [];

  // Check: High >= Low
  const highLowViolations: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i].high < data[i].low) highLowViolations.push(i);
  }
  checks.push({
    name: 'high_gte_low',
    passed: highLowViolations.length === 0,
    severity: 'error',
    message: `High < Low in ${highLowViolations.length} records`,
    affectedRows: highLowViolations,
  });

  // Check: High >= Open and High >= Close
  const highBoundViolations: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i].high < data[i].open || data[i].high < data[i].close) {
      highBoundViolations.push(i);
    }
  }
  checks.push({
    name: 'high_bounds',
    passed: highBoundViolations.length === 0,
    severity: 'error',
    message: `High not max of O/H/L/C in ${highBoundViolations.length} records`,
    affectedRows: highBoundViolations,
  });

  // Check: Low <= Open and Low <= Close
  const lowBoundViolations: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i].low > data[i].open || data[i].low > data[i].close) {
      lowBoundViolations.push(i);
    }
  }
  checks.push({
    name: 'low_bounds',
    passed: lowBoundViolations.length === 0,
    severity: 'error',
    message: `Low not min of O/H/L/C in ${lowBoundViolations.length} records`,
    affectedRows: lowBoundViolations,
  });

  // Check: Volume >= 0
  const negativeVolume: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i].volume < 0) negativeVolume.push(i);
  }
  checks.push({
    name: 'non_negative_volume',
    passed: negativeVolume.length === 0,
    severity: 'error',
    message: `Negative volume in ${negativeVolume.length} records`,
    affectedRows: negativeVolume,
  });

  // Check: No zero prices
  const zeroPrices: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i].open <= 0 || data[i].high <= 0 || data[i].low <= 0 || data[i].close <= 0) {
      zeroPrices.push(i);
    }
  }
  checks.push({
    name: 'positive_prices',
    passed: zeroPrices.length === 0,
    severity: 'error',
    message: `Zero/negative prices in ${zeroPrices.length} records`,
    affectedRows: zeroPrices,
  });

  // Check: Date ordering
  const dateOrderIssues: number[] = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i].date <= data[i - 1].date) dateOrderIssues.push(i);
  }
  checks.push({
    name: 'date_ordering',
    passed: dateOrderIssues.length === 0,
    severity: 'warning',
    message: `Date ordering issues in ${dateOrderIssues.length} records`,
    affectedRows: dateOrderIssues,
  });

  // Check: Price continuity (no >30% jumps)
  const priceJumps: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const change = Math.abs(data[i].close - data[i - 1].close) / data[i - 1].close;
    if (change > 0.30) priceJumps.push(i);
  }
  checks.push({
    name: 'price_continuity',
    passed: priceJumps.length === 0,
    severity: 'warning',
    message: `Large price jumps (>30%) in ${priceJumps.length} records`,
    affectedRows: priceJumps,
  });

  return checks;
}

/**
 * Detect outliers in numerical data
 */
export function detectOutliers(
  values: number[],
  threshold: number = 3
): AnomalyRecord[] {
  const m = mean(values);
  const s = std(values);
  const anomalies: AnomalyRecord[] = [];

  for (let i = 0; i < values.length; i++) {
    if (s === 0) continue;
    const zScore = Math.abs((values[i] - m) / s);
    if (zScore > threshold) {
      anomalies.push({
        index: i,
        field: 'value',
        value: values[i],
        expected: m,
        deviation: zScore,
        type: 'outlier',
      });
    }
  }

  return anomalies;
}

/**
 * Detect missing data gaps
 */
export function detectMissingData(
  dates: string[],
  expectedFrequency: 'daily' | 'weekly' = 'daily'
): { missingDates: string[]; gapCount: number; completeness: number } {
  if (dates.length < 2) return { missingDates: [], gapCount: 0, completeness: 1 };

  const dayMs = 24 * 60 * 60 * 1000;
  const expectedGap = expectedFrequency === 'daily' ? dayMs : dayMs * 7;
  const maxGap = expectedGap * 3; // Allow for weekends

  const missingDates: string[] = [];
  let gapCount = 0;

  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]).getTime();
    const curr = new Date(dates[i]).getTime();
    const gap = curr - prev;

    if (gap > maxGap) {
      gapCount++;
      // Generate missing dates
      let d = prev + expectedGap;
      while (d < curr) {
        missingDates.push(new Date(d).toISOString().split('T')[0]);
        d += expectedGap;
      }
    }
  }

  const totalExpected = Math.ceil(
    (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / expectedGap
  );
  const completeness = totalExpected === 0 ? 1 : dates.length / totalExpected;

  return { missingDates, gapCount, completeness: Math.min(1, completeness) };
}

/**
 * Generate data quality report
 */
export function generateQualityReport(data: OHLCVRecord[]): DataQualityReport {
  const checks = validateOHLCV(data);

  // Outliers on close prices
  const closes = data.map(d => d.close);
  const anomalies = detectOutliers(closes);

  // Metrics
  const passedChecks = checks.filter(c => c.passed).length;
  const completeness = detectMissingData(data.map(d => d.date)).completeness;
  const accuracy = passedChecks / Math.max(1, checks.length);

  // Consistency: check for duplicate dates
  const dates = data.map(d => d.date);
  const uniqueDates = new Set(dates);
  const consistency = dates.length === 0 ? 1 : uniqueDates.size / dates.length;

  // Timeliness: how recent is the data
  const latestDate = data.length > 0 ? new Date(data[data.length - 1].date).getTime() : 0;
  const daysSinceLatest = (Date.now() - latestDate) / (24 * 60 * 60 * 1000);
  const timeliness = Math.max(0, 1 - daysSinceLatest / 7);

  const score = Math.round((completeness * 25 + accuracy * 35 + consistency * 20 + timeliness * 20));

  return { score, checks, completeness, accuracy, consistency, timeliness, anomalies };
}

/**
 * Clean OHLCV data
 */
export function cleanOHLCV(data: OHLCVRecord[]): OHLCVRecord[] {
  return data
    .filter(d => d.open > 0 && d.high > 0 && d.low > 0 && d.close > 0 && d.volume >= 0)
    .map(d => ({
      ...d,
      high: Math.max(d.high, d.open, d.close),
      low: Math.min(d.low, d.open, d.close),
    }))
    .filter((d, i, arr) => i === 0 || d.date > arr[i - 1].date);
}
