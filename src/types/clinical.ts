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
  impactScore: number;
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

export interface ClinicalPreset {
  id: string;
  title: string;
  subtitle: string;
  input: PatientInput;
}

export const CLINICAL_PRESETS: ClinicalPreset[] = [
  {
    id: 'default-baseline',
    title: 'Default Clinical Profile',
    subtitle: '45y Male · HbA1c 6.2% · Glucose 130 mg/dL',
    input: {
      patientName: 'Tanvir Ahmed',
      patientId: 'PT-2045',
      age: 45,
      gender: 'Male',
      bmi: 26.5,
      hba1c: 6.2,
      blood_glucose: 130,
      hypertension: 'No',
      heart_disease: 'No',
      smoking_history: 'never',
      notes: 'Baseline screening profile matching initial Streamlit clinical parameters.',
    },
  },
  {
    id: 'optimal-metabolic',
    title: 'Optimal Metabolic Control',
    subtitle: '32y Female · HbA1c 5.0% · Glucose 92 mg/dL',
    input: {
      patientName: 'Nusrat Jahan',
      patientId: 'PT-2042',
      age: 32,
      gender: 'Female',
      bmi: 21.8,
      hba1c: 5.0,
      blood_glucose: 92,
      hypertension: 'No',
      heart_disease: 'No',
      smoking_history: 'never',
      notes: 'Normoglycemic routine screening.',
    },
  },
  {
    id: 'borderline-threshold',
    title: 'Pre-Diabetic Threshold Case',
    subtitle: '51y Male · HbA1c 6.0% · Glucose 144 mg/dL',
    input: {
      patientName: 'Mahmudul Hasan',
      patientId: 'PT-2043',
      age: 51,
      gender: 'Male',
      bmi: 28.4,
      hba1c: 6.0,
      blood_glucose: 144,
      hypertension: 'Yes',
      heart_disease: 'No',
      smoking_history: 'former',
      notes: 'Demonstrates 35% custom threshold sensitivity for early intervention.',
    },
  },
  {
    id: 'acute-hyperglycemic',
    title: 'High-Risk Hyperglycemic',
    subtitle: '63y Female · HbA1c 7.3% · Glucose 210 mg/dL',
    input: {
      patientName: 'Farhana Rahman',
      patientId: 'PT-2044',
      age: 63,
      gender: 'Female',
      bmi: 33.2,
      hba1c: 7.3,
      blood_glucose: 210,
      hypertension: 'Yes',
      heart_disease: 'Yes',
      smoking_history: 'current',
      notes: 'Elevated cardiometabolic and glycemic markers requiring OGTT confirmation.',
    },
  },
];
