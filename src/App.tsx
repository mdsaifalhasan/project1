import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  RotateCcw,
  Download,
  Trash2,
  Search,
  Play,
  FileSpreadsheet,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Database,
  Code2,
  Printer,
  Sun,
  Moon,
} from 'lucide-react';
import {
  PatientInput,
  AssessmentRecord,
  CLINICAL_PRESETS,
  CLINICAL_THRESHOLD,
  FEATURE_COLUMNS,
} from './types/clinical';
import { RiskGaugeChart } from './components/RiskGaugeChart';
import { RadarBiomarkerChart } from './components/RadarBiomarkerChart';
import { ClinicalReportModal } from './components/ClinicalReportModal';
import { generateClinicalReportPDF } from './utils/pdfReportGenerator';
import { evaluateLightGBMClient } from './utils/clinicalInference';

function buildLocalAssessmentRecord(payload: PatientInput, existingId?: string): AssessmentRecord {
  const evaluation = evaluateLightGBMClient(payload);
  return {
    id: existingId || `REC-${Date.now().toString().slice(-5)}`,
    patientName: payload.patientName?.trim() || 'Walk-in Clinical Patient',
    patientId: payload.patientId?.trim() || 'PT-2045',
    timestamp: new Date().toISOString(),
    inputs: payload,
    ...evaluation,
    threshold: CLINICAL_THRESHOLD,
  };
}

export default function App() {
  // Active View Tab
  const [activeTab, setActiveTab] = useState<'workbench' | 'registry' | 'pipeline'>('workbench');

  // Theme State (Dark / Light Mode)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('clinical_theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
    }
    try {
      localStorage.setItem('clinical_theme', theme);
    } catch {
      // Ignore storage error
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Patient Input State (Initialized to exact defaults from user's Streamlit code)
  const [inputs, setInputs] = useState<PatientInput>({
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
    notes: 'Baseline screening profile matching initial clinical configuration.',
  });

  // Current Prediction Result (Initialized synchronously so the gauge needle is immediately active)
  const [currentResult, setCurrentResult] = useState<AssessmentRecord>(() =>
    buildLocalAssessmentRecord({
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
      notes: 'Baseline screening profile matching initial clinical configuration.',
    })
  );

  // Saved Registry Records from Express Backend (with seed fallback)
  const [registry, setRegistry] = useState<AssessmentRecord[]>(() =>
    CLINICAL_PRESETS.map((preset, idx) =>
      buildLocalAssessmentRecord(preset.input, `REC-${1001 + idx}`)
    )
  );
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [autoSync, setAutoSync] = useState<boolean>(true);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);

  // Registry Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'HIGH' | 'LOW'>('ALL');

  // Fetch initial assessments from backend
  const fetchRegistry = useCallback(async () => {
    try {
      const res = await fetch('/api/assessments');
      if (res.ok) {
        const data = (await res.json()) as AssessmentRecord[];
        if (Array.isArray(data) && data.length > 0) {
          setRegistry(data);
        }
      }
    } catch {
      // Uses local seeded registry if backend is unreachable
    }
  }, []);

  // Run Prediction (Instant local computation + Backend API sync)
  const runPrediction = useCallback(
    async (payload: PatientInput, saveToRegistry: boolean) => {
      // 1. Immediately compute and update state so gauge needle moves with zero latency
      const instantRecord = buildLocalAssessmentRecord(payload);
      setCurrentResult(instantRecord);

      if (!saveToRegistry) {
        return;
      }

      setIsAnalyzing(true);
      try {
        const res = await fetch('/api/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, saveToRegistry: true }),
        });
        if (res.ok) {
          const serverRecord = (await res.json()) as AssessmentRecord;
          setCurrentResult(serverRecord);
          setStatusBanner(
            `Saved assessment ${serverRecord.id} for ${serverRecord.patientName} (${serverRecord.probPercentage.toFixed(2)}% risk)`
          );
          setTimeout(() => setStatusBanner(null), 4000);
          fetchRegistry();
        } else {
          // Fallback local registry save
          setRegistry((prev) => [instantRecord, ...prev]);
          setStatusBanner(
            `Saved assessment ${instantRecord.id} for ${instantRecord.patientName} (${instantRecord.probPercentage.toFixed(2)}% risk)`
          );
          setTimeout(() => setStatusBanner(null), 4000);
        }
      } catch {
        setRegistry((prev) => [instantRecord, ...prev]);
        setStatusBanner(
          `Saved assessment ${instantRecord.id} for ${instantRecord.patientName} (${instantRecord.probPercentage.toFixed(2)}% risk)`
        );
        setTimeout(() => setStatusBanner(null), 4000);
      } finally {
        setIsAnalyzing(false);
      }
    },
    [fetchRegistry]
  );

  // Initial load
  useEffect(() => {
    fetchRegistry();
  }, [fetchRegistry]);

  // Live instant inference when sliders change if autoSync is enabled
  const handleInputChange = <K extends keyof PatientInput>(key: K, value: PatientInput[K]) => {
    setInputs((prev) => {
      const next = { ...prev, [key]: value };
      if (autoSync) {
        setCurrentResult(buildLocalAssessmentRecord(next));
      }
      return next;
    });
  };

  const handleLoadPreset = (presetInput: PatientInput) => {
    const nextInput: PatientInput = { ...presetInput };
    setInputs(nextInput);
    setCurrentResult(buildLocalAssessmentRecord(nextInput));
    setStatusBanner(
      `Loaded clinical preset: ${nextInput.patientName} (Age ${nextInput.age}, HbA1c ${nextInput.hba1c.toFixed(1)}%, Glucose ${nextInput.blood_glucose} mg/dL)`
    );
    setTimeout(() => setStatusBanner(null), 3500);
  };

  const handleResetDefaults = () => {
    const defaultInput: PatientInput = {
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
      notes: 'Baseline screening profile matching initial clinical configuration.',
    };
    setInputs(defaultInput);
    setAutoSync(true);
    setSearchQuery('');
    setRiskFilter('ALL');
    const resetRecord = buildLocalAssessmentRecord(defaultInput);
    setCurrentResult(resetRecord);
    setStatusBanner(
      `Reset all patient vitals to baseline defaults (45 Yrs, BMI 26.5, HbA1c 6.2%, Glucose 130 mg/dL → ${resetRecord.probPercentage.toFixed(1)}% Risk)`
    );
    setTimeout(() => setStatusBanner(null), 4000);
  };

  const handleDeleteRecord = async (id: string) => {
    try {
      const res = await fetch(`/api/assessments/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setRegistry((prev) => prev.filter((r) => r.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete record:', err);
    }
  };

  const handleExportCSV = () => {
    if (registry.length === 0) return;
    const headers = [
      'Record_ID',
      'Timestamp',
      'Patient_ID',
      'Patient_Name',
      'Age',
      'Gender',
      'BMI',
      'HbA1c_Level',
      'Blood_Glucose_mg_dL',
      'Hypertension',
      'Heart_Disease',
      'Smoking_History',
      'Probability_Pct',
      'Prediction_Label',
    ];
    const rows = registry.map((r) => [
      r.id,
      r.timestamp,
      r.patientId,
      `"${r.patientName.replace(/"/g, '""')}"`,
      r.inputs.age,
      r.inputs.gender,
      r.inputs.bmi,
      r.inputs.hba1c,
      r.inputs.blood_glucose,
      r.inputs.hypertension,
      r.inputs.heart_disease,
      r.inputs.smoking_history,
      r.probPercentage.toFixed(2),
      r.prediction === 1 ? 'HIGH_RISK' : 'LOW_RISK',
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `diabetes_clinical_registry_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadCurrentJSON = () => {
    if (!currentResult) return;
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(currentResult, null, 2));
    const link = document.createElement('a');
    link.setAttribute('href', dataStr);
    link.setAttribute('download', `${currentResult.patientId}_diagnostic_report.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintClinicalReport = () => {
    if (!currentResult) return;
    generateClinicalReportPDF(currentResult);
    setIsReportModalOpen(true);
    setStatusBanner(
      `Generated printer-friendly Clinical PDF Report (${currentResult.patientId}_Clinical_Report.pdf)`
    );
    setTimeout(() => setStatusBanner(null), 4500);
  };

  // Filtered Registry
  const filteredRegistry = registry.filter((item) => {
    const matchesSearch =
      item.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.patientId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRisk =
      riskFilter === 'ALL' ||
      (riskFilter === 'HIGH' && item.prediction === 1) ||
      (riskFilter === 'LOW' && item.prediction === 0);
    return matchesSearch && matchesRisk;
  });

  // Derived BMI / HbA1c / Glucose clinical status strings
  const bmiHealthy = inputs.bmi >= 18.5 && inputs.bmi <= 24.9;
  const hba1cElevated = inputs.hba1c >= 5.7;
  const glucoseElevated = inputs.blood_glucose >= 140;

  return (
    <div className="theme-root min-h-screen flex flex-col bg-[#07090E] text-[#F8FAFC]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-3.5 bg-[#07090E]/95 backdrop-blur border-b border-slate-800">
        {/* Zone 1: Single Text Element Brand Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('workbench');
          }}
          className="text-base font-bold tracking-tight text-slate-50 whitespace-nowrap"
        >
          Diabetes Risk Intelligence
        </a>

        {/* Zone 2: Clean Text Navigation Links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('workbench')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'workbench'
                ? 'text-cyan-400 underline underline-offset-8 decoration-2 decoration-cyan-400'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Diagnostic Workbench
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('registry')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'registry'
                ? 'text-cyan-400 underline underline-offset-8 decoration-2 decoration-cyan-400'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Patient Registry ({registry.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pipeline')}
            className={`py-1 transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'pipeline'
                ? 'text-cyan-400 underline underline-offset-8 decoration-2 decoration-cyan-400'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            LightGBM Schema
          </button>
        </nav>

        {/* Zone 3: Primary Actions (Theme Toggle + Log Clinical Assessment) */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={toggleTheme}
            className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-cyan-400" />
                <span>Dark Mode</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => runPrediction(inputs, true)}
            disabled={isAnalyzing}
            className="px-4 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 rounded-lg hover:bg-cyan-300 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Log Clinical Assessment</span>
          </button>
        </div>
      </header>

      {/* Mobile Navigation Selector */}
      <div className="md:hidden flex items-center gap-1 px-4 py-2 bg-[#111827] border-b border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('workbench')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
            activeTab === 'workbench' ? 'bg-slate-800 text-cyan-400' : 'text-slate-400'
          }`}
        >
          Workbench
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('registry')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
            activeTab === 'registry' ? 'bg-slate-800 text-cyan-400' : 'text-slate-400'
          }`}
        >
          Registry ({registry.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('pipeline')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
            activeTab === 'pipeline' ? 'bg-slate-800 text-cyan-400' : 'text-slate-400'
          }`}
        >
          LightGBM Schema
        </button>
      </div>

      {/* Main Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Clinical Header Banner with Developer Attribution */}
        <section className="bg-[#111827] border border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-cyan-400">
              <span>Developed by Md.Saif Al Hasan</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-slate-400">MERN Clinical Decision Support System</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-slate-400">Threshold 0.35 Calibrated</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-50">
              Medical AI: Diabetes Risk Intelligence
            </h1>
            <p className="text-sm text-slate-400 max-w-3xl">
              Powered by LightGBM Classifier with SMOTE class-balancing and custom 35% probability
              threshold calibration for high-sensitivity clinical screening.
            </p>
          </div>

          {/* Preset Selector Controls */}
          <div className="flex flex-col sm:items-end gap-2 shrink-0">
            <span className="text-xs font-mono text-slate-400">
              LOAD CLINICAL COHORT PRESET
            </span>
            <div className="flex flex-wrap items-center gap-1.5 bg-[#07090E] p-1.5 rounded-lg border border-slate-800">
              {CLINICAL_PRESETS.map((preset) => {
                const isSelected =
                  inputs.age === preset.input.age &&
                  inputs.hba1c === preset.input.hba1c &&
                  inputs.blood_glucose === preset.input.blood_glucose;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleLoadPreset(preset.input)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                    title={preset.subtitle}
                  >
                    {preset.title.split(' ')[0]}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleResetDefaults}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-md transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1"
                title="Reset to default parameters"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>
          </div>
        </section>

        {/* Live Feedback Notification Banner */}
        {statusBanner && (
          <div className="bg-emerald-950/60 border border-emerald-700/60 text-emerald-200 px-4 py-2.5 rounded-lg text-xs font-mono flex items-center justify-between">
            <span>● {statusBanner}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-emerald-400 hover:text-emerald-200 underline ml-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 4 Patient Vitals Summary Metric Cards (Matching Streamlit Top Summary Banner) */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Metric 1: Age & Gender */}
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <span className="text-xs font-mono text-slate-400">AGE &amp; DEMOGRAPHICS</span>
            <div className="mt-2 flex items-baseline">
              <span className="text-2xl font-mono font-bold text-slate-50 tabular-nums">
                {inputs.age}
              </span>
              <span className="text-xs font-mono text-slate-400 ml-1.5">YRS</span>
            </div>
            <div className="mt-2 text-xs font-mono text-cyan-400">
              <span>● {inputs.gender}</span>
              <span aria-hidden="true" className="mx-1.5 text-slate-600">·</span>
              <span className="text-slate-400">Smoke: {inputs.smoking_history}</span>
            </div>
          </div>

          {/* Metric 2: BMI Indicator */}
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <span className="text-xs font-mono text-slate-400">BMI INDICATOR</span>
            <div className="mt-2 flex items-baseline">
              <span className="text-2xl font-mono font-bold text-slate-50 tabular-nums">
                {inputs.bmi.toFixed(1)}
              </span>
              <span className="text-xs font-mono text-slate-400 ml-1.5">KG/M²</span>
            </div>
            <div
              className={`mt-2 text-xs font-mono ${
                bmiHealthy ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {bmiHealthy ? '● Normal (18.5–24.9)' : '▲ Overweight / Obese'}
            </div>
          </div>

          {/* Metric 3: HbA1c Index */}
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <span className="text-xs font-mono text-slate-400">HBA1C GLYCATED INDEX</span>
            <div className="mt-2 flex items-baseline">
              <span className="text-2xl font-mono font-bold text-slate-50 tabular-nums">
                {inputs.hba1c.toFixed(1)}
              </span>
              <span className="text-xs font-mono text-slate-400 ml-1.5">%</span>
            </div>
            <div
              className={`mt-2 text-xs font-mono ${
                hba1cElevated ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {hba1cElevated ? '✖ Elevated (≥ 5.7%)' : '● Normal (< 5.7%)'}
            </div>
          </div>

          {/* Metric 4: Blood Glucose Level */}
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
            <span className="text-xs font-mono text-slate-400">BLOOD GLUCOSE LEVEL</span>
            <div className="mt-2 flex items-baseline">
              <span className="text-2xl font-mono font-bold text-slate-50 tabular-nums">
                {inputs.blood_glucose}
              </span>
              <span className="text-xs font-mono text-slate-400 ml-1.5">MG/DL</span>
            </div>
            <div
              className={`mt-2 text-xs font-mono ${
                glucoseElevated ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {glucoseElevated ? '✖ High (≥ 140 mg/dL)' : '● Normal (< 140 mg/dL)'}
            </div>
          </div>
        </section>

        {/* TAB 1: DIAGNOSTIC WORKBENCH (Asymmetric Split Console) */}
        {activeTab === 'workbench' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Parameter Control Column (4 cols on desktop ~ 380px) */}
            <aside className="lg:col-span-4 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-base font-semibold text-slate-100">
                    Patient Vitals &amp; Inputs
                  </h2>
                </div>
                <label className="flex items-center gap-1.5 text-xs font-mono text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSync}
                    onChange={(e) => setAutoSync(e.target.checked)}
                    className="accent-cyan-400 rounded cursor-pointer"
                  />
                  <span>LIVE SYNC</span>
                </label>
              </div>

              {/* Patient Identification */}
              <div className="space-y-3">
                <span className="text-xs font-mono text-slate-400 block">
                  01. PATIENT IDENTIFICATION
                </span>
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="col-span-2">
                    <label className="text-xs text-slate-400 block mb-1">Patient Full Name</label>
                    <input
                      type="text"
                      value={inputs.patientName || ''}
                      onChange={(e) => handleInputChange('patientName', e.target.value)}
                      placeholder="e.g. Tanvir Ahmed"
                      className="w-full px-3 py-2 text-sm bg-[#07090E] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Patient ID</label>
                    <input
                      type="text"
                      value={inputs.patientId || ''}
                      onChange={(e) => handleInputChange('patientId', e.target.value)}
                      placeholder="PT-2045"
                      className="w-full px-2.5 py-2 text-sm font-mono bg-[#07090E] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>
              </div>

              {/* Group 1: Demographics & Vitals */}
              <div className="space-y-4 pt-3 border-t border-slate-800/80">
                <span className="text-xs font-mono text-slate-400 block">
                  02. DEMOGRAPHICS &amp; ANTHROPOMETRICS
                </span>

                {/* Age Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="age-slider" className="text-slate-300 font-medium">
                      Age (Years)
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={inputs.age}
                        onChange={(e) =>
                          handleInputChange(
                            'age',
                            Math.max(1, Math.min(100, Number(e.target.value) || 1))
                          )
                        }
                        className="w-16 px-2 py-0.5 text-right font-mono text-xs bg-[#07090E] border border-slate-800 rounded text-cyan-400"
                      />
                      <span className="font-mono text-slate-500">Yrs</span>
                    </div>
                  </div>
                  <input
                    id="age-slider"
                    type="range"
                    min={1}
                    max={100}
                    step={1}
                    value={inputs.age}
                    onChange={(e) => handleInputChange('age', Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-500">
                    <span>1 Yr</span>
                    <span>45 Yrs</span>
                    <span>100 Yrs</span>
                  </div>
                </div>

                {/* Gender Segmented Control */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-300 font-medium block">
                    Biological Gender
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#07090E] border border-slate-800 rounded-lg">
                    {(['Male', 'Female', 'Other'] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => handleInputChange('gender', g)}
                        className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                          inputs.gender === g
                            ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                {/* BMI Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="bmi-slider" className="text-slate-300 font-medium">
                      BMI (Body Mass Index)
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={10.0}
                        max={60.0}
                        step={0.1}
                        value={inputs.bmi}
                        onChange={(e) =>
                          handleInputChange(
                            'bmi',
                            Math.max(10, Math.min(60, Number(e.target.value) || 10))
                          )
                        }
                        className="w-16 px-2 py-0.5 text-right font-mono text-xs bg-[#07090E] border border-slate-800 rounded text-cyan-400"
                      />
                      <span className="font-mono text-slate-500">kg/m²</span>
                    </div>
                  </div>
                  <input
                    id="bmi-slider"
                    type="range"
                    min={10.0}
                    max={60.0}
                    step={0.1}
                    value={inputs.bmi}
                    onChange={(e) => handleInputChange('bmi', Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-500">
                    <span>10.0</span>
                    <span>Normal: 18.5–24.9</span>
                    <span>60.0</span>
                  </div>
                </div>
              </div>

              {/* Group 2: Lab Tests */}
              <div className="space-y-4 pt-3 border-t border-slate-800/80">
                <span className="text-xs font-mono text-slate-400 block">
                  03. GLYCEMIC LABORATORY PANEL
                </span>

                {/* HbA1c Level */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="hba1c-slider" className="text-slate-300 font-medium">
                      HbA1c Level (%)
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={3.5}
                        max={15.0}
                        step={0.1}
                        value={inputs.hba1c}
                        onChange={(e) =>
                          handleInputChange(
                            'hba1c',
                            Math.max(3.5, Math.min(15.0, Number(e.target.value) || 3.5))
                          )
                        }
                        className="w-16 px-2 py-0.5 text-right font-mono text-xs bg-[#07090E] border border-slate-800 rounded text-cyan-400"
                      />
                      <span className="font-mono text-slate-500">%</span>
                    </div>
                  </div>
                  <input
                    id="hba1c-slider"
                    type="range"
                    min={3.5}
                    max={15.0}
                    step={0.1}
                    value={inputs.hba1c}
                    onChange={(e) => handleInputChange('hba1c', Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-500">
                    <span>3.5%</span>
                    <span>Pre-Diabetic ≥ 5.7%</span>
                    <span>15.0%</span>
                  </div>
                </div>

                {/* Blood Glucose Level */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="glucose-slider" className="text-slate-300 font-medium">
                      Blood Glucose Level (mg/dL)
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={50}
                        max={350}
                        step={1}
                        value={inputs.blood_glucose}
                        onChange={(e) =>
                          handleInputChange(
                            'blood_glucose',
                            Math.max(50, Math.min(350, Number(e.target.value) || 50))
                          )
                        }
                        className="w-16 px-2 py-0.5 text-right font-mono text-xs bg-[#07090E] border border-slate-800 rounded text-cyan-400"
                      />
                      <span className="font-mono text-slate-500">mg/dL</span>
                    </div>
                  </div>
                  <input
                    id="glucose-slider"
                    type="range"
                    min={50}
                    max={350}
                    step={1}
                    value={inputs.blood_glucose}
                    onChange={(e) => handleInputChange('blood_glucose', Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-500">
                    <span>50 mg/dL</span>
                    <span>Elevated ≥ 140</span>
                    <span>350 mg/dL</span>
                  </div>
                </div>
              </div>

              {/* Group 3: Medical History */}
              <div className="space-y-4 pt-3 border-t border-slate-800/80">
                <span className="text-xs font-mono text-slate-400 block">
                  04. CLINICAL &amp; CARDIOVASCULAR HISTORY
                </span>

                <div className="grid grid-cols-2 gap-3">
                  {/* Hypertension */}
                  <div>
                    <label className="text-xs text-slate-300 font-medium block mb-1.5">
                      Hypertension (High BP)
                    </label>
                    <div className="grid grid-cols-2 gap-1 p-1 bg-[#07090E] border border-slate-800 rounded-lg">
                      {(['No', 'Yes'] as const).map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => handleInputChange('hypertension', val)}
                          className={`py-1.5 text-xs font-mono rounded transition-colors cursor-pointer ${
                            inputs.hypertension === val
                              ? val === 'Yes'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : 'bg-slate-800 text-cyan-400'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Heart Disease */}
                  <div>
                    <label className="text-xs text-slate-300 font-medium block mb-1.5">
                      Heart Disease
                    </label>
                    <div className="grid grid-cols-2 gap-1 p-1 bg-[#07090E] border border-slate-800 rounded-lg">
                      {(['No', 'Yes'] as const).map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => handleInputChange('heart_disease', val)}
                          className={`py-1.5 text-xs font-mono rounded transition-colors cursor-pointer ${
                            inputs.heart_disease === val
                              ? val === 'Yes'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : 'bg-slate-800 text-cyan-400'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Smoking History */}
                <div>
                  <label
                    htmlFor="smoking-select"
                    className="text-xs text-slate-300 font-medium block mb-1.5"
                  >
                    Smoking History Profile
                  </label>
                  <select
                    id="smoking-select"
                    value={inputs.smoking_history}
                    onChange={(e) =>
                      handleInputChange(
                        'smoking_history',
                        e.target.value as PatientInput['smoking_history']
                      )
                    }
                    className="w-full px-3 py-2 text-sm font-mono bg-[#07090E] border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-cyan-400"
                  >
                    <option value="never">never (Never Smoked)</option>
                    <option value="current">current (Active Smoker)</option>
                    <option value="former">former (Former Smoker)</option>
                    <option value="ever">ever (Ever Smoked)</option>
                    <option value="not current">not current (Abstinent)</option>
                  </select>
                </div>
              </div>

              {/* Run & Save Execution + Reset Buttons */}
              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => runPrediction(inputs, true)}
                  disabled={isAnalyzing}
                  className="w-full py-3 px-4 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <Activity className="w-4 h-4" />
                  <span>
                    {isAnalyzing
                      ? 'Running LightGBM Inference...'
                      : 'Run Clinical Prediction & Save Record'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="w-full py-2 px-4 bg-[#07090E] hover:bg-slate-800 text-slate-300 border border-slate-800 font-mono text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Reset All Vitals to Default</span>
                </button>
              </div>
            </aside>

            {/* Right Main Diagnostic Stage (8 cols on desktop) */}
            <div className="lg:col-span-8 space-y-6">
              {/* Top Row: Gauge Visualization + Multi-Axis Radar */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Gauge Card */}
                <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
                  <RiskGaugeChart
                    probPercentage={currentResult?.probPercentage ?? 0}
                    thresholdPercentage={CLINICAL_THRESHOLD * 100}
                    prediction={currentResult?.prediction ?? 0}
                    theme={theme}
                  />
                </div>

                {/* Multi-Axis Biomarker Radar */}
                <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
                  <RadarBiomarkerChart inputs={inputs} theme={theme} />
                </div>
              </div>

              {/* Clinical Risk Evaluation & Recommendation Report Card */}
              {currentResult && (
                <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                        <span>DIAGNOSTIC EVALUATION</span>
                        <span aria-hidden="true">·</span>
                        <span>MODEL: LIGHTGBM CLASSIFIER</span>
                        <span aria-hidden="true">·</span>
                        <span>DECISION CUTOFF: 35%</span>
                      </div>
                      <div className="flex items-center gap-3 pt-1">
                        {currentResult.prediction === 1 ? (
                          <div className="flex items-center gap-2 text-rose-400 font-bold text-lg tracking-tight">
                            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                            <span>HIGH RISK DETECTED ({currentResult.probPercentage.toFixed(2)}%)</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-emerald-400 font-bold text-lg tracking-tight">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                            <span>LOW RISK DETECTED ({currentResult.probPercentage.toFixed(2)}%)</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={handlePrintClinicalReport}
                        className="px-3.5 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 rounded-lg hover:bg-cyan-300 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-sm"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print Clinical Report</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadCurrentJSON}
                        className="px-3.5 py-2 text-xs font-mono text-slate-200 bg-[#07090E] border border-slate-800 rounded-lg hover:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Export JSON</span>
                      </button>
                    </div>
                  </div>

                  {/* Clinical Interpretation Prose */}
                  <div className="space-y-3">
                    <p className="text-sm text-slate-200 leading-relaxed">
                      {currentResult.clinicalSummary}
                    </p>

                    <div className="bg-[#07090E] border border-slate-800/90 rounded-lg p-4 space-y-2">
                      <span className="text-xs font-mono text-cyan-400 block">
                        CLINICAL PROTOCOL &amp; NEXT STEPS
                      </span>
                      <ul className="space-y-1.5 text-xs sm:text-sm text-slate-300">
                        {currentResult.recommendations.map((rec, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="font-mono text-cyan-400 mt-0.5">0{i + 1}.</span>
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Feature Contribution Breakdown (LightGBM Log-Odds Attribution) */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                      <span>LIGHTGBM FEATURE IMPACT ATTRIBUTION (LOG-ODDS DELTA)</span>
                      <span>+ RISK ELEVATING / - PROTECTIVE</span>
                    </div>

                    <div className="divide-y divide-slate-800/70 border border-slate-800 rounded-lg bg-[#07090E]">
                      {currentResult.contributions.map((c) => {
                        const isPositive = c.impactScore > 0;
                        const barWidthPct = Math.min(100, Math.abs(c.impactScore) * 32);
                        return (
                          <div
                            key={c.feature}
                            className="px-4 py-2.5 grid grid-cols-12 items-center gap-3 text-xs"
                          >
                            <div className="col-span-5 sm:col-span-4 font-medium text-slate-200 truncate">
                              {c.label}
                            </div>
                            <div className="col-span-3 sm:col-span-2 font-mono text-slate-400 text-right tabular-nums">
                              {c.valueDisplay}
                            </div>
                            <div className="col-span-4 sm:col-span-4 flex items-center gap-2">
                              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden flex">
                                <div
                                  className={`h-full rounded-full transition-all duration-200 ${
                                    isPositive ? 'bg-rose-500' : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${Math.max(6, barWidthPct)}%` }}
                                />
                              </div>
                            </div>
                            <div
                              className={`hidden sm:block sm:col-span-2 font-mono text-right tabular-nums ${
                                isPositive ? 'text-rose-400' : 'text-emerald-400'
                              }`}
                            >
                              {isPositive ? `+${c.impactScore.toFixed(2)}` : c.impactScore.toFixed(2)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: PATIENT REGISTRY (MERN Backend Database Table) */}
        {activeTab === 'registry' && (
          <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-lg font-semibold text-slate-100">
                    Clinical Screening Registry
                  </h2>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Persistent patient risk evaluations stored via the Node/Express REST API. Click any
                  record to reload its vitals into the workbench.
                </p>
              </div>

              {/* Search & Segmented Risk Filter */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search patient or ID..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-[#07090E] border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#07090E] border border-slate-800 rounded-lg">
                  {(['ALL', 'HIGH', 'LOW'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setRiskFilter(f)}
                      className={`px-3 py-1 text-xs font-mono rounded transition-colors cursor-pointer ${
                        riskFilter === f
                          ? 'bg-slate-800 text-cyan-400'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {f === 'ALL' ? 'All Records' : f === 'HIGH' ? 'High Risk' : 'Low Risk'}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-200 bg-[#07090E] border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {filteredRegistry.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <p className="text-sm text-slate-400">
                  No matching clinical assessment records found in the registry.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setRiskFilter('ALL');
                    setActiveTab('workbench');
                  }}
                  className="px-4 py-2 text-xs font-semibold bg-cyan-400 text-slate-950 rounded-lg cursor-pointer"
                >
                  Return to Diagnostic Workbench
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400">
                      <th className="py-3 px-3">RECORD ID</th>
                      <th className="py-3 px-3">PATIENT</th>
                      <th className="py-3 px-3 text-right">AGE / SEX</th>
                      <th className="py-3 px-3 text-right">BMI</th>
                      <th className="py-3 px-3 text-right">HBA1C</th>
                      <th className="py-3 px-3 text-right">GLUCOSE</th>
                      <th className="py-3 px-3 text-right">PROBABILITY</th>
                      <th className="py-3 px-3">CLINICAL STATUS</th>
                      <th className="py-3 px-3 text-right">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-xs">
                    {filteredRegistry.map((rec) => (
                      <tr
                        key={rec.id}
                        className="hover:bg-slate-900/60 transition-colors group"
                      >
                        <td className="py-3 px-3 font-mono text-slate-400 whitespace-nowrap">
                          {rec.id}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-slate-100">{rec.patientName}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {rec.patientId} · {new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-300 tabular-nums whitespace-nowrap">
                          {rec.inputs.age}Y · {rec.inputs.gender.charAt(0)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-300 tabular-nums">
                          {rec.inputs.bmi.toFixed(1)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-300 tabular-nums">
                          {rec.inputs.hba1c.toFixed(1)}%
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-300 tabular-nums">
                          {rec.inputs.blood_glucose} mg/dL
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-slate-100 tabular-nums">
                          {rec.probPercentage.toFixed(2)}%
                        </td>
                        <td className="py-3 px-3 font-mono whitespace-nowrap">
                          {rec.prediction === 1 ? (
                            <span className="text-rose-400">✖ HIGH RISK (≥35%)</span>
                          ) : (
                            <span className="text-emerald-400">● LOW RISK (&lt;35%)</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setInputs({ ...rec.inputs });
                                setCurrentResult(rec);
                                setActiveTab('workbench');
                              }}
                              className="px-2.5 py-1 text-xs font-mono text-cyan-400 bg-slate-900 border border-slate-700 rounded hover:bg-slate-800 cursor-pointer"
                            >
                              Inspect
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRecord(rec.id)}
                              className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                              title="Delete Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* TAB 3: LIGHTGBM MODEL SCHEMA & FEATURE ALIGNMENT INSPECTOR */}
        {activeTab === 'pipeline' && (
          <section className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-lg font-semibold text-slate-100">
                    LightGBM Feature Vector Alignment (`feature_columns.json`)
                  </h2>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Live inspection of the 13 one-hot encoded and continuous features passed to the
                  LightGBM classifier with custom 0.35 probability thresholding.
                </p>
              </div>
              <span className="text-xs font-mono text-cyan-400">
                13 / 13 FEATURES ALIGNED
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {FEATURE_COLUMNS.map((col, index) => {
                const val = currentResult?.alignedFeatures?.[col];
                const isActiveBoolean = typeof val === 'boolean' && val === true;
                const isNumeric = typeof val === 'number';
                return (
                  <div
                    key={col}
                    className={`p-3.5 rounded-lg border font-mono text-xs flex items-center justify-between ${
                      isActiveBoolean || (isNumeric && val > 0)
                        ? 'bg-[#07090E] border-cyan-500/40 text-slate-100'
                        : 'bg-[#07090E]/60 border-slate-800 text-slate-500'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-slate-600">
                        {String(index + 1).padStart(2, '0')}.
                      </span>
                      <span className="truncate">{col}</span>
                    </div>
                    <span
                      className={`ml-2 font-semibold tabular-nums ${
                        isActiveBoolean
                          ? 'text-cyan-400'
                          : isNumeric
                          ? 'text-emerald-400'
                          : 'text-slate-600'
                      }`}
                    >
                      {String(val)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="bg-[#07090E] border border-slate-800 rounded-lg p-4 space-y-2 text-xs text-slate-400">
              <div className="font-mono text-slate-200 font-semibold">
                Clinical Model Architecture Notes — Developed by Md.Saif Al Hasan
              </div>
              <p>
                This full-stack web application translates the Python LightGBM pipeline
                (<code className="text-cyan-400">diabetes_lgbm_model.pkl</code> &amp;{' '}
                <code className="text-cyan-400">feature_columns.json</code>) into an interactive
                MERN-architected clinical console. Categorical features (Gender and Smoking History)
                are dynamically one-hot reindexed against the 13-column training schema, and
                probabilities are evaluated against the calibrated{' '}
                <code className="text-amber-400">THRESHOLD = 0.35</code> to prioritize sensitivity
                in type-2 diabetes screening.
              </p>
            </div>
          </section>
        )}
      </main>

      {/* Printer-Friendly Clinical Report Preview & PDF Modal */}
      {currentResult && (
        <ClinicalReportModal
          record={currentResult}
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          onDownloadPDF={() => generateClinicalReportPDF(currentResult)}
        />
      )}

      {/* Developer Attribution Footer */}
      <footer className="mt-auto border-t border-slate-800/90 bg-[#0B0E17] py-5 px-6 print:hidden">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <p>
            © Diabetes Risk Assessment System | Developed by{' '}
            <span className="text-cyan-400 font-semibold">Md.Saif Al Hasan</span>
          </p>
          <p className="font-mono text-slate-500">
            LightGBM Clinical Screening · SMOTE Calibrated · Threshold 0.35
          </p>
        </div>
      </footer>
    </div>
  );
}
