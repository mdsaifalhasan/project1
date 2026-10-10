import { PatientInput } from '../types/clinical';

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Converts polar coordinates (centerX, centerY, radius, angleRadians)
 * into standard screen/SVG/Canvas 2D coordinates where:
 *   angle = -PI      -> far left   (x = centerX - radius, y = centerY)
 *   angle = -PI / 2  -> top center (x = centerX,          y = centerY - radius)
 *   angle = 0        -> far right  (x = centerX + radius, y = centerY)
 */
export function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleRadians: number
): Point2D {
  return {
    x: centerX + radius * Math.cos(angleRadians),
    y: centerY + radius * Math.sin(angleRadians),
  };
}

/**
 * Converts a gauge percentage (0% to 100%) to its exact semicircular angle in radians:
 *   0%   -> -PI     (-180 deg, far-left endpoint)
 *   25%  -> -3*PI/4 (-135 deg, upper-left)
 *   35%  -> -0.65*PI (-117 deg, exact 35% threshold position)
 *   37.1%-> -0.629*PI (-113.22 deg, slightly right of 35% threshold)
 *   50%  -> -PI/2   (-90 deg, straight upward top-center)
 *   75%  -> -PI/4   (-45 deg, upper-right)
 *   100% -> 0       (0 deg, far-right endpoint)
 */
export function gaugePercentageToAngle(percentage: number): number {
  const clamped = Math.max(0, Math.min(100, Number(percentage) || 0));
  return -Math.PI + (clamped / 100) * Math.PI;
}

/**
 * Builds an SVG semicircular arc path from startPct (0..100) to endPct (0..100)
 * using the exact same polarToCartesian and gaugePercentageToAngle coordinate system.
 */
export function describeGaugeArc(
  centerX: number,
  centerY: number,
  radius: number,
  startPct: number,
  endPct: number
): string {
  const s = Math.max(0, Math.min(100, startPct));
  const e = Math.max(s, Math.min(100, endPct));
  if (e - s <= 0.001) {
    return '';
  }
  const startPt = polarToCartesian(centerX, centerY, radius, gaugePercentageToAngle(s));
  const endPt = polarToCartesian(centerX, centerY, radius, gaugePercentageToAngle(e));
  // Since the full span is at most 180 degrees (PI radians), large-arc-flag is always 0,
  // and sweep-flag is 1 (clockwise from left through top to right).
  return `M ${startPt.x} ${startPt.y} A ${radius} ${radius} 0 0 1 ${endPt.x} ${endPt.y}`;
}

/**
 * Calculates the angle in radians for a 5-axis radar chart (equally spaced at 72 degrees = 2*PI/5)
 * starting at the top vertical axis (-PI/2) and proceeding clockwise:
 *   index 0 (HbA1c)            -> -90 deg (-PI/2)
 *   index 1 (Glucose)          -> -18 deg (-PI/10)
 *   index 2 (BMI)              -> +54 deg (3*PI/10)
 *   index 3 (Age)              -> +126 deg (7*PI/10)
 *   index 4 (Cardio-Metabolic) -> +198 deg (11*PI/10 or -162 deg)
 */
export function getRadarAxisAngle(index: number, totalAxes: number = 5): number {
  return -Math.PI / 2 + (index * 2 * Math.PI) / totalAxes;
}

/**
 * Calculates the 2D point on a specific radar axis for a normalized value in [0, 1]
 * (or > 1 for axis label placement along the exact same ray).
 */
export function getRadarAxisPoint(
  centerX: number,
  centerY: number,
  maxRadius: number,
  axisIndex: number,
  normalizedValue: number,
  totalAxes: number = 5
): Point2D {
  const angle = getRadarAxisAngle(axisIndex, totalAxes);
  const r = maxRadius * normalizedValue;
  return polarToCartesian(centerX, centerY, r, angle);
}

/**
 * Linearly normalizes a raw clinical value within [minValue, maxValue] to [0, 1].
 */
export function normalizeBiomarkerValue(
  value: number,
  minValue: number,
  maxValue: number,
  minVisualFloor: number = 0.08
): number {
  const rawRatio = (value - minValue) / (maxValue - minValue);
  return Math.max(minVisualFloor, Math.min(1, rawRatio));
}

export interface RadarBiomarkerAxis {
  index: number;
  key: 'hba1c' | 'glucose' | 'bmi' | 'age' | 'cardio';
  label: string;
  valueDisplay: string;
  referenceLabel: string;
  normalizedValue: number;
  referenceNormalized: number;
  isElevated: boolean;
}

/**
 * Computes the normalized values and reference bounds for all 5 radar axes
 * using a unified clinical reference scale so that when every biomarker is at its
 * normal upper threshold (HbA1c 5.7%, Glucose 140 mg/dL, BMI 24.9, Age 45 Yrs, Cardio Clear),
 * the reference boundary forms a symmetric, mathematically centered regular pentagon
 * at referenceNormalized = 0.42 (42% of maxRadius).
 */
export function computeRadarBiomarkerAxes(inputs: PatientInput): RadarBiomarkerAxis[] {
  const REF_RING_RATIO = 0.42;

  //Piecewise-linear normalization helper that maps:
  //  minValue       -> 0.10
  //  referenceBound -> REF_RING_RATIO (0.42)
  //  maxValue       -> 1.00
  const normalizeWithReferenceAnchor = (
    val: number,
    minVal: number,
    refVal: number,
    maxVal: number
  ): number => {
    const clamped = Math.max(minVal, Math.min(maxVal, val));
    if (clamped <= refVal) {
      const t = (clamped - minVal) / Math.max(0.0001, refVal - minVal);
      return 0.1 + t * (REF_RING_RATIO - 0.1);
    } else {
      const t = (clamped - refVal) / Math.max(0.0001, maxVal - refVal);
      return REF_RING_RATIO + t * (1.0 - REF_RING_RATIO);
    }
  };

  // 1. HbA1c (Slider range: 3.5% to 15.0%, Normal threshold: 5.7%)
  const hba1cNorm = normalizeWithReferenceAnchor(inputs.hba1c, 3.5, 5.7, 15.0);

  // 2. Glucose (Slider range: 50 to 350 mg/dL, Normal threshold: 140 mg/dL)
  const glucoseNorm = normalizeWithReferenceAnchor(inputs.blood_glucose, 50, 140, 350);

  // 3. BMI (Slider range: 10.0 to 60.0, Normal upper threshold: 24.9)
  const bmiNorm = normalizeWithReferenceAnchor(inputs.bmi, 10.0, 24.9, 60.0);

  // 4. Age (Slider range: 1 to 100 Yrs, Clinical baseline threshold: 45 Yrs)
  const ageNorm = normalizeWithReferenceAnchor(inputs.age, 1, 45, 100);

  // 5. Cardio-Metabolic (Hypertension, Heart Disease, Smoking History)
  // When Clear (No Hypertension, No Heart Disease, never/not current): sits within reference bound (0.28)
  const hasHypertension = inputs.hypertension === 'Yes';
  const hasHeartDisease = inputs.heart_disease === 'Yes';
  const isCurrentSmoker = inputs.smoking_history === 'current';
  const isPastSmoker =
    inputs.smoking_history === 'former' || inputs.smoking_history === 'ever';

  let cardioScore = 0.28; // "Clear" baseline inside the 0.42 normal reference pentagon
  if (hasHypertension) cardioScore += 0.28;
  if (hasHeartDisease) cardioScore += 0.28;
  if (isCurrentSmoker) cardioScore += 0.16;
  else if (isPastSmoker) cardioScore += 0.08;
  const cardioNorm = Math.min(1.0, cardioScore);

  let cardioDisplay = 'Clear';
  if (hasHypertension && hasHeartDisease) {
    cardioDisplay = 'Dual History';
  } else if (hasHypertension || hasHeartDisease) {
    cardioDisplay = '1 Risk Factor';
  } else if (isCurrentSmoker) {
    cardioDisplay = 'Smoker';
  }

  return [
    {
      index: 0,
      key: 'hba1c',
      label: 'HbA1c',
      valueDisplay: `${inputs.hba1c.toFixed(1)}%`,
      referenceLabel: 'Normal < 5.7%',
      normalizedValue: hba1cNorm,
      referenceNormalized: REF_RING_RATIO,
      isElevated: inputs.hba1c >= 5.7,
    },
    {
      index: 1,
      key: 'glucose',
      label: 'Glucose',
      valueDisplay: `${inputs.blood_glucose} mg/dL`,
      referenceLabel: 'Normal < 140 mg/dL',
      normalizedValue: glucoseNorm,
      referenceNormalized: REF_RING_RATIO,
      isElevated: inputs.blood_glucose >= 140,
    },
    {
      index: 2,
      key: 'bmi',
      label: 'BMI',
      valueDisplay: `${inputs.bmi.toFixed(1)}`,
      referenceLabel: 'Normal 18.5–24.9',
      normalizedValue: bmiNorm,
      referenceNormalized: REF_RING_RATIO,
      isElevated: inputs.bmi > 24.9 || inputs.bmi < 18.5,
    },
    {
      index: 3,
      key: 'age',
      label: 'Age',
      valueDisplay: `${inputs.age} Yrs`,
      referenceLabel: 'Baseline ≤ 45 Yrs',
      normalizedValue: ageNorm,
      referenceNormalized: REF_RING_RATIO,
      isElevated: inputs.age > 45,
    },
    {
      index: 4,
      key: 'cardio',
      label: 'Cardio-Metabolic',
      valueDisplay: cardioDisplay,
      referenceLabel: 'No BP / Heart Risk',
      normalizedValue: cardioNorm,
      referenceNormalized: REF_RING_RATIO,
      isElevated: hasHypertension || hasHeartDisease || isCurrentSmoker,
    },
  ];
}
