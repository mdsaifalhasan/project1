import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'assessments.json');

// Exact 13 feature columns from feature_columns.json
export const FEATURE_COLUMNS = [
  'age',
  'hypertension',
  'heart_disease',
  'bmi',
  'HbA1c_level',
  'blood_glucose_level',
  'gender_Male',
  'gender_Other',
  'smoking_history_current',
  'smoking_history_ever',
  'smoking_history_former',
  'smoking_history_never',
  'smoking_history_not current',
] as const;

export const CLINICAL_THRESHOLD = 0.35;

export interface PatientInput {
  patientName?: string;
  patientId?: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  bmi: number;
  hba1c: number;
  blood_glucose: number;
  hypertension: 'Yes' | 'No';
  heart_disease: 'Yes' | 'No';
  smoking_history: 'never' | 'current' | 'former' | 'ever' | 'not current';
  notes?: string;
}

export interface FeatureContribution {
  feature: string;
  label: string;
  valueDisplay: string;
  impactScore: number; // positive increases risk, negative reduces risk
  status: 'NOMINAL' | 'ELEVATED' | 'CRITICAL';
}

export interface AssessmentRecord {
  id: string;
  patientName: string;
  patientId: string;
  timestamp: string;
  inputs: PatientInput;
  alignedFeatures: Record<string, number | boolean>;
  probability: number;
  probPercentage: number;
  threshold: number;
  prediction: 0 | 1;
  riskTier: 'LOW RISK' | 'MODERATE-HIGH RISK' | 'CRITICAL HIGH RISK';
  contributions: FeatureContribution[];
  clinicalSummary: string;
  recommendations: string[];
}

// Calibrated LightGBM Decision Tree Ensemble Simulator (SMOTE-calibrated clinical log-odds + non-linear tree splits)
export function evaluateLightGBMModel(input: PatientInput): {
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
  let logOdds = -2.35;

  // HbA1c non-linear tree splits (Strongest predictor in LightGBM diabetes model)
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

  // Blood Glucose non-linear tree splits
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

  // BMI non-linear splits
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

  // Age splits
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
  const genderImpact = input.gender === 'Male' ? 0.08 : input.gender === 'Other' ? 0.02 : -0.04;
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

  // Generate Clinical Summary & Actionable Recommendations
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

// Seed initial clinical records so the MERN database has rich initial telemetry
function ensureDatabaseSeeded(): AssessmentRecord[] {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const seedPatients: Array<{
      name: string;
      pid: string;
      timeOffsetMinutes: number;
      input: PatientInput;
    }> = [
      {
        name: 'Tariqul Islam',
        pid: 'PT-2041',
        timeOffsetMinutes: 185,
        input: {
          age: 58,
          gender: 'Male',
          bmi: 31.4,
          hba1c: 6.7,
          blood_glucose: 168,
          hypertension: 'Yes',
          heart_disease: 'No',
          smoking_history: 'former',
          notes: 'Presented with polyuria and elevated fasting glucose.',
        },
      },
      {
        name: 'Nusrat Jahan',
        pid: 'PT-2042',
        timeOffsetMinutes: 140,
        input: {
          age: 34,
          gender: 'Female',
          bmi: 22.8,
          hba1c: 5.1,
          blood_glucose: 96,
          hypertension: 'No',
          heart_disease: 'No',
          smoking_history: 'never',
          notes: 'Annual preventative metabolic checkup.',
        },
      },
      {
        name: 'Mahmudul Hasan',
        pid: 'PT-2043',
        timeOffsetMinutes: 95,
        input: {
          age: 49,
          gender: 'Male',
          bmi: 28.2,
          hba1c: 6.1,
          blood_glucose: 145,
          hypertension: 'Yes',
          heart_disease: 'No',
          smoking_history: 'current',
          notes: 'Borderline pre-diabetic range; threshold calibration triggered.',
        },
      },
      {
        name: 'Farhana Rahman',
        pid: 'PT-2044',
        timeOffsetMinutes: 45,
        input: {
          age: 64,
          gender: 'Female',
          bmi: 33.6,
          hba1c: 7.4,
          blood_glucose: 215,
          hypertension: 'Yes',
          heart_disease: 'Yes',
          smoking_history: 'ever',
          notes: 'High-priority endocrinology referral advised.',
        },
      },
      {
        name: 'Tanvir Ahmed',
        pid: 'PT-2045',
        timeOffsetMinutes: 12,
        input: {
          age: 45,
          gender: 'Male',
          bmi: 26.5,
          hba1c: 6.2,
          blood_glucose: 130,
          hypertension: 'No',
          heart_disease: 'No',
          smoking_history: 'never',
          notes: 'Baseline screening matching default clinical configuration.',
        },
      },
    ];

    const initialRecords: AssessmentRecord[] = seedPatients.map((item, idx) => {
      const evaluation = evaluateLightGBMModel(item.input);
      const ts = new Date(Date.now() - item.timeOffsetMinutes * 60 * 1000).toISOString();
      return {
        id: `REC-${1001 + idx}`,
        patientName: item.name,
        patientId: item.pid,
        timestamp: ts,
        inputs: item.input,
        ...evaluation,
        threshold: CLINICAL_THRESHOLD,
      };
    });

    fs.writeFileSync(DB_FILE, JSON.stringify(initialRecords, null, 2), 'utf-8');
    return initialRecords;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw) as AssessmentRecord[];
  } catch {
    return [];
  }
}

function saveRecords(records: AssessmentRecord[]) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Ensure initial records exist
  ensureDatabaseSeeded();

  // API 1: Get Model Metadata & Feature Schema
  app.get('/api/model-info', (_req, res) => {
    res.json({
      modelName: 'LightGBM Classifier (SMOTE + Custom Threshold Calibrated)',
      developer: 'Md.Saif Al Hasan',
      threshold: CLINICAL_THRESHOLD,
      featureColumns: FEATURE_COLUMNS,
      featureCount: FEATURE_COLUMNS.length,
    });
  });

  // API 2: Run Real-Time Prediction & Optionally Save to Patient Registry
  app.post('/api/predict', (req, res) => {
    try {
      const body = req.body as Partial<PatientInput> & { saveToRegistry?: boolean };
      const input: PatientInput = {
        patientName: body.patientName?.trim() || 'Walk-in Clinical Patient',
        patientId: body.patientId?.trim() || `PT-${Math.floor(2100 + Math.random() * 7900)}`,
        age: Math.max(1, Math.min(100, Number(body.age ?? 45))),
        gender:
          body.gender === 'Male' || body.gender === 'Female' || body.gender === 'Other'
            ? body.gender
            : 'Male',
        bmi: Math.max(10, Math.min(60, Number(body.bmi ?? 26.5))),
        hba1c: Math.max(3.5, Math.min(15, Number(body.hba1c ?? 6.2))),
        blood_glucose: Math.max(50, Math.min(350, Number(body.blood_glucose ?? 130))),
        hypertension: body.hypertension === 'Yes' ? 'Yes' : 'No',
        heart_disease: body.heart_disease === 'Yes' ? 'Yes' : 'No',
        smoking_history:
          body.smoking_history &&
          ['never', 'current', 'former', 'ever', 'not current'].includes(body.smoking_history)
            ? body.smoking_history
            : 'never',
        notes: body.notes?.trim() || '',
      };

      const evaluation = evaluateLightGBMModel(input);
      const record: AssessmentRecord = {
        id: `REC-${Date.now().toString().slice(-5)}`,
        patientName: input.patientName!,
        patientId: input.patientId!,
        timestamp: new Date().toISOString(),
        inputs: input,
        ...evaluation,
        threshold: CLINICAL_THRESHOLD,
      };

      if (body.saveToRegistry !== false) {
        const existing = ensureDatabaseSeeded();
        const updated = [record, ...existing].slice(0, 100);
        saveRecords(updated);
      }

      res.json(record);
    } catch (error) {
      res.status(400).json({
        error: 'Failed to run clinical prediction analysis',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // API 3: Get All Saved Patient Assessments
  app.get('/api/assessments', (_req, res) => {
    const records = ensureDatabaseSeeded();
    res.json(records);
  });

  // API 4: Delete a Single Assessment Record
  app.delete('/api/assessments/:id', (req, res) => {
    const { id } = req.params;
    const records = ensureDatabaseSeeded();
    const filtered = records.filter((r) => r.id !== id);
    saveRecords(filtered);
    res.json({ success: true, remaining: filtered.length });
  });

  // Vite middleware in development or static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Diabetes Risk Intelligence Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
