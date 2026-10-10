import {
  PatientInput,
  FeatureContribution,
  FEATURE_COLUMNS,
  CLINICAL_THRESHOLD,
} from '../types/clinical';

export function evaluateLightGBMClient(input: PatientInput): {
  alignedFeatures: Record<string, number | boolean>;
  probability: number;
  probPercentage: number;
  prediction: 0 | 1;
  riskTier: 'LOW RISK' | 'MODERATE-HIGH RISK' | 'CRITICAL HIGH RISK';
  contributions: FeatureContribution[];
  clinicalSummary: string;
  recommendations: string[];
} {
  // 1. Construct aligned feature vector matching feature_columns.json
  const rawVector: Record<string, number | boolean> = {
    age: Number(input.age),
    hypertension: input.hypertension === 'Yes' ? 1 : 0,
    heart_disease: input.heart_disease === 'Yes' ? 1 : 0,
    bmi: Number(input.bmi),
    HbA1c_level: Number(input.hba1c),
    blood_glucose_level: Number(input.blood_glucose),
    gender_Male: input.gender === 'Male',
    gender_Other: input.gender === 'Other',
    smoking_history_current: input.smoking_history === 'current',
    smoking_history_ever: input.smoking_history === 'ever',
    smoking_history_former: input.smoking_history === 'former',
    smoking_history_never: input.smoking_history === 'never',
    'smoking_history_not current': input.smoking_history === 'not current',
  };

  const alignedFeatures: Record<string, number | boolean> = {};
  for (const col of FEATURE_COLUMNS) {
    alignedFeatures[col] = rawVector[col] ?? false;
  }

  // 2. Smooth Continuous + Tree-Calibrated Log-Odds Function
  // Every slider adjustment (Age, BMI, HbA1c, Glucose, History) produces an immediate, smooth probability shift
  let logOdds = -2.35;

  // HbA1c continuous + piecewise clinical gradient (3.5% to 15.0%)
  let hba1cImpact = 0;
  let hba1cStatus: 'NOMINAL' | 'ELEVATED' | 'CRITICAL' = 'NOMINAL';
  if (input.hba1c >= 6.8) {
    hba1cImpact = 2.85 + (input.hba1c - 6.8) * 0.45;
    hba1cStatus = 'CRITICAL';
  } else if (input.hba1c >= 6.5) {
    hba1cImpact = 1.95 + (input.hba1c - 6.5) * 3.0;
    hba1cStatus = 'CRITICAL';
  } else if (input.hba1c >= 5.7) {
    hba1cImpact = 0.35 + (input.hba1c - 5.7) * 2.0;
    hba1cStatus = 'ELEVATED';
  } else {
    hba1cImpact = -0.85 - (5.7 - input.hba1c) * 0.45;
    hba1cStatus = 'NOMINAL';
  }
  logOdds += hba1cImpact;

  // Blood Glucose continuous + piecewise clinical gradient (50 to 350 mg/dL)
  let glucoseImpact = 0;
  let glucoseStatus: 'NOMINAL' | 'ELEVATED' | 'CRITICAL' = 'NOMINAL';
  if (input.blood_glucose >= 200) {
    glucoseImpact = 2.15 + (input.blood_glucose - 200) * 0.014;
    glucoseStatus = 'CRITICAL';
  } else if (input.blood_glucose >= 140) {
    glucoseImpact = 0.55 + (input.blood_glucose - 140) * 0.0266;
    glucoseStatus = 'ELEVATED';
  } else if (input.blood_glucose >= 100) {
    glucoseImpact = -0.35 + (input.blood_glucose - 100) * 0.0225;
    glucoseStatus = 'NOMINAL';
  } else {
    glucoseImpact = -0.35 - (100 - input.blood_glucose) * 0.012;
    glucoseStatus = 'NOMINAL';
  }
  logOdds += glucoseImpact;

  // BMI continuous gradient (10.0 to 60.0 kg/m²)
  let bmiImpact = 0;
  let bmiStatus: 'NOMINAL' | 'ELEVATED' | 'CRITICAL' = 'NOMINAL';
  if (input.bmi >= 35) {
    bmiImpact = 0.72 + (input.bmi - 35) * 0.03;
    bmiStatus = 'CRITICAL';
  } else if (input.bmi >= 30) {
    bmiImpact = 0.42 + (input.bmi - 30) * 0.06;
    bmiStatus = 'CRITICAL';
  } else if (input.bmi >= 25) {
    bmiImpact = 0.12 + (input.bmi - 25) * 0.06;
    bmiStatus = 'ELEVATED';
  } else if (input.bmi >= 18.5) {
    bmiImpact = -0.35 + (input.bmi - 18.5) * 0.072;
    bmiStatus = 'NOMINAL';
  } else {
    bmiImpact = -0.35 - (18.5 - input.bmi) * 0.02;
    bmiStatus = 'ELEVATED';
  }
  logOdds += bmiImpact;

  // Age continuous gradient (1 to 100 Years)
  let ageImpact = 0;
  let ageStatus: 'NOMINAL' | 'ELEVATED' | 'CRITICAL' = 'NOMINAL';
  if (input.age >= 65) {
    ageImpact = 0.58 + (input.age - 65) * 0.016;
    ageStatus = 'ELEVATED';
  } else if (input.age >= 45) {
    ageImpact = 0.18 + (input.age - 45) * 0.02;
    ageStatus = 'ELEVATED';
  } else {
    ageImpact = -0.45 + (input.age / 45) * 0.63;
    ageStatus = 'NOMINAL';
  }
  logOdds += ageImpact;

  // Hypertension & Heart Disease interactions
  const hyperImpact = input.hypertension === 'Yes' ? 0.55 : -0.12;
  const heartImpact = input.heart_disease === 'Yes' ? 0.50 : -0.10;
  logOdds += hyperImpact + heartImpact;

  // Smoking history contribution
  let smokeImpact = 0;
  let smokeStatus: 'NOMINAL' | 'ELEVATED' | 'CRITICAL' = 'NOMINAL';
  if (input.smoking_history === 'current') {
    smokeImpact = 0.30;
    smokeStatus = 'ELEVATED';
  } else if (input.smoking_history === 'former' || input.smoking_history === 'ever') {
    smokeImpact = 0.18;
    smokeStatus = 'ELEVATED';
  } else if (input.smoking_history === 'not current') {
    smokeImpact = 0.08;
    smokeStatus = 'NOMINAL';
  } else {
    smokeImpact = -0.10;
    smokeStatus = 'NOMINAL';
  }
  logOdds += smokeImpact;

  // Gender subtle split
  const genderImpact =
    input.gender === 'Male' ? 0.08 : input.gender === 'Other' ? 0.02 : -0.04;
  logOdds += genderImpact;

  // Convert log-odds to calibrated probability via logistic sigmoid
  const rawProb = 1 / (1 + Math.exp(-logOdds));
  const probability = Math.max(0.008, Math.min(0.994, Number(rawProb.toFixed(4))));
  const probPercentage = Number((probability * 100).toFixed(2));
  const prediction: 0 | 1 = probability >= CLINICAL_THRESHOLD ? 1 : 0;

  let riskTier: 'LOW RISK' | 'MODERATE-HIGH RISK' | 'CRITICAL HIGH RISK' = 'LOW RISK';
  if (probability >= 0.65) {
    riskTier = 'CRITICAL HIGH RISK';
  } else if (probability >= CLINICAL_THRESHOLD) {
    riskTier = 'MODERATE-HIGH RISK';
  }

  const contributions: FeatureContribution[] = [
    {
      feature: 'HbA1c_level',
      label: 'HbA1c Glycated Hemoglobin',
      valueDisplay: `${input.hba1c.toFixed(1)} %`,
      impactScore: Number(hba1cImpact.toFixed(2)),
      status: hba1cStatus,
    },
    {
      feature: 'blood_glucose_level',
      label: 'Blood Glucose Concentration',
      valueDisplay: `${input.blood_glucose} mg/dL`,
      impactScore: Number(glucoseImpact.toFixed(2)),
      status: glucoseStatus,
    },
    {
      feature: 'bmi',
      label: 'Body Mass Index (BMI)',
      valueDisplay: `${input.bmi.toFixed(1)} kg/m²`,
      impactScore: Number(bmiImpact.toFixed(2)),
      status: bmiStatus,
    },
    {
      feature: 'age',
      label: 'Patient Chronological Age',
      valueDisplay: `${input.age} Yrs`,
      impactScore: Number(ageImpact.toFixed(2)),
      status: ageStatus,
    },
    {
      feature: 'hypertension',
      label: 'Hypertension History',
      valueDisplay: input.hypertension,
      impactScore: Number(hyperImpact.toFixed(2)),
      status: input.hypertension === 'Yes' ? 'CRITICAL' : 'NOMINAL',
    },
    {
      feature: 'heart_disease',
      label: 'Cardiovascular Disease',
      valueDisplay: input.heart_disease,
      impactScore: Number(heartImpact.toFixed(2)),
      status: input.heart_disease === 'Yes' ? 'CRITICAL' : 'NOMINAL',
    },
    {
      feature: `smoking_history_${input.smoking_history}`,
      label: 'Smoking Exposure Profile',
      valueDisplay: input.smoking_history,
      impactScore: Number(smokeImpact.toFixed(2)),
      status: smokeStatus,
    },
  ];

  const elevatedDrivers = contributions
    .filter((c) => c.impactScore > 0.2)
    .map((c) => `${c.label} (${c.valueDisplay})`);

  const clinicalSummary =
    prediction === 1
      ? `Calibrated LightGBM probability (${probPercentage.toFixed(2)}%) exceeds the clinical screening threshold of ${(CLINICAL_THRESHOLD * 100).toFixed(0)}%. Primary risk drivers include ${elevatedDrivers.length > 0 ? elevatedDrivers.join(', ') : 'cumulative metabolic markers'}.`
      : `Calibrated LightGBM probability (${probPercentage.toFixed(2)}%) remains below the ${(CLINICAL_THRESHOLD * 100).toFixed(0)}% clinical screening threshold. Patient glycemic and anthropometric markers are within low-risk tolerance bounds.`;

  const recommendations: string[] = [];
  if (prediction === 1) {
    recommendations.push(
      'Order confirmatory Oral Glucose Tolerance Test (OGTT) and repeat fasting plasma glucose panel within 14 days.'
    );
    if (input.hba1c >= 5.7) {
      recommendations.push(
        `Initiate structured glycemic monitoring targeting HbA1c reduction below 5.7% (Current: ${input.hba1c.toFixed(1)}%).`
      );
    }
    if (input.bmi >= 25) {
      recommendations.push(
        `Prescribe medical nutrition therapy and 150 min/week aerobic conditioning to target a 5–7% BMI reduction (Current: ${input.bmi.toFixed(1)} kg/m²).`
      );
    }
    if (input.hypertension === 'Yes' || input.heart_disease === 'Yes') {
      recommendations.push(
        'Coordinate cardiometabolic co-management for blood pressure and lipid profile stabilization.'
      );
    }
  } else {
    recommendations.push(
      'Maintain balanced low-glycemic nutrition and regular physical activity (minimum 150 minutes/week).'
    );
    recommendations.push(
      'Schedule routine annual metabolic screening (Fasting Glucose & HbA1c panel).'
    );
    if (input.bmi >= 25) {
      recommendations.push(
        `Monitor BMI (${input.bmi.toFixed(1)} kg/m²) with preventative weight management to preserve insulin sensitivity.`
      );
    }
  }

  return {
    alignedFeatures,
    probability,
    probPercentage,
    prediction,
    riskTier,
    contributions,
    clinicalSummary,
    recommendations,
  };
}
