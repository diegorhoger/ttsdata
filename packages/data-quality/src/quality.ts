/**
 * Data quality dimensions and SLIs.
 * 
 * Quality is a prerequisite for rankings. Rankings must be blocked when
 * freshness or completeness falls below thresholds.
 */

export interface QualityDimension {
  name: string;
  description: string;
  unit: string;
  threshold: number;
  currentValue: number;
  status: 'pass' | 'warn' | 'fail';
}

export interface QualityReport {
  entityType: string;
  entityId: string;
  timestamp: string;
  dimensions: QualityDimension[];
  overallStatus: 'pass' | 'warn' | 'fail';
}

export interface QualityConfig {
  /** Maximum age in hours before data is considered stale */
  maxAgeHours: number;
  /** Minimum completeness ratio (0-1) */
  minCompleteness: number;
  /** Minimum accuracy ratio (0-1) */
  minAccuracy: number;
}

export const DEFAULT_QUALITY_CONFIG: QualityConfig = {
  maxAgeHours: 24,
  minCompleteness: 0.8,
  minAccuracy: 0.9,
};

/**
 * Calculate freshness dimension.
 */
export function calculateFreshness(
  lastUpdated: Date,
  config: QualityConfig = DEFAULT_QUALITY_CONFIG
): QualityDimension {
  const ageHours = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60);
  const status = ageHours <= config.maxAgeHours ? 'pass' : 
                 ageHours <= config.maxAgeHours * 1.5 ? 'warn' : 'fail';
  return {
    name: 'freshness',
    description: 'Age of the data',
    unit: 'hours',
    threshold: config.maxAgeHours,
    currentValue: ageHours,
    status,
  };
}

/**
 * Calculate completeness dimension.
 */
export function calculateCompleteness(
  fieldsPresent: number,
  fieldsTotal: number,
  config: QualityConfig = DEFAULT_QUALITY_CONFIG
): QualityDimension {
  const ratio = fieldsTotal > 0 ? fieldsPresent / fieldsTotal : 0;
  const status = ratio >= config.minCompleteness ? 'pass' : 
                 ratio >= config.minCompleteness * 0.8 ? 'warn' : 'fail';
  return {
    name: 'completeness',
    description: 'Percentage of expected fields present',
    unit: 'ratio',
    threshold: config.minCompleteness,
    currentValue: ratio,
    status,
  };
}

/**
 * Calculate accuracy dimension.
 */
export function calculateAccuracy(
  validatedCount: number,
  totalCount: number,
  config: QualityConfig = DEFAULT_QUALITY_CONFIG
): QualityDimension {
  const ratio = totalCount > 0 ? validatedCount / totalCount : 0;
  const status = ratio >= config.minAccuracy ? 'pass' : 
                 ratio >= config.minAccuracy * 0.9 ? 'warn' : 'fail';
  return {
    name: 'accuracy',
    description: 'Percentage of data passing validation',
    unit: 'ratio',
    threshold: config.minAccuracy,
    currentValue: ratio,
    status,
  };
}

/**
 * Generate a quality report for an entity.
 */
export function generateQualityReport(
  entityType: string,
  entityId: string,
  lastUpdated: Date,
  fieldsPresent: number,
  fieldsTotal: number,
  validatedCount: number,
  config: QualityConfig = DEFAULT_QUALITY_CONFIG
): QualityReport {
  const dimensions = [
    calculateFreshness(lastUpdated, config),
    calculateCompleteness(fieldsPresent, fieldsTotal, config),
    calculateAccuracy(validatedCount, fieldsTotal, config),
  ];
  
  const overallStatus = dimensions.some(d => d.status === 'fail') ? 'fail' :
                        dimensions.some(d => d.status === 'warn') ? 'warn' : 'pass';
  
  return {
    entityType,
    entityId,
    timestamp: new Date().toISOString(),
    dimensions,
    overallStatus,
  };
}

/**
 * Check if quality is sufficient for ranking.
 */
export function isQualitySufficientForRanking(report: QualityReport): boolean {
  return report.overallStatus !== 'fail';
}
