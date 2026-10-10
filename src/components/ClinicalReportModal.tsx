import React from 'react';
import { X, Download, Printer, CheckCircle2, AlertTriangle } from 'lucide-react';
import { AssessmentRecord, CLINICAL_THRESHOLD } from '../types/clinical';
import { RiskGaugeChart } from './RiskGaugeChart';
import { RadarBiomarkerChart } from './RadarBiomarkerChart';

interface ClinicalReportModalProps {
  record: AssessmentRecord;
  isOpen: boolean;
  onClose: () => void;
  onDownloadPDF: () => void;
}

export const ClinicalReportModal: React.FC<ClinicalReportModalProps> = ({
  record,
  isOpen,
  onClose,
  onDownloadPDF,
}) => {
  if (!isOpen) return null;

  const handleBrowserPrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="relative w-full max-w-4xl bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-300 overflow-hidden my-8 print:my-0 print:shadow-none print:border-none print:max-w-none">
        {/* Modal Action Toolbar (Hidden when printing) */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-900 text-slate-100 border-b border-slate-800 print:hidden">
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
            <span>PRINTER-FRIENDLY CLINICAL REPORT PREVIEW</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-400">{record.id}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleBrowserPrint}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5 text-cyan-400" />
              <span>System Print Dialog</span>
            </button>
            <button
              type="button"
              onClick={onDownloadPDF}
              className="px-4 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 rounded-lg hover:bg-cyan-300 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF File</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              title="Close Preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="p-6 sm:p-8 space-y-6 bg-white text-slate-900">
          {/* Report Header */}
          <div className="bg-slate-900 text-white rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                Medical AI: Diabetes Risk Intelligence Report
              </h2>
              <p className="text-xs font-mono text-cyan-400 font-semibold">
                Developed by Md.Saif Al Hasan
              </p>
              <p className="text-xs text-slate-300">
                LightGBM Classifier · SMOTE Class-Balanced · Decision Threshold = 35%
              </p>
            </div>
            <div className="text-left sm:text-right font-mono text-xs text-slate-300 space-y-1">
              <div className="font-semibold text-white">REPORT ID: {record.id}</div>
              <div>PATIENT ID: {record.patientId}</div>
              <div>DATE: {new Date(record.timestamp).toLocaleString()}</div>
            </div>
          </div>

          {/* Patient Vitals Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs">
            <div>
              <span className="font-mono text-slate-500 block">PATIENT NAME</span>
              <span className="font-semibold text-slate-900 text-sm">{record.patientName}</span>
            </div>
            <div>
              <span className="font-mono text-slate-500 block">AGE &amp; GENDER</span>
              <span className="font-mono font-semibold text-slate-900 text-sm">
                {record.inputs.age} Yrs · {record.inputs.gender}
              </span>
            </div>
            <div>
              <span className="font-mono text-slate-500 block">HBA1C / GLUCOSE</span>
              <span className="font-mono font-semibold text-slate-900 text-sm">
                {record.inputs.hba1c.toFixed(1)}% · {record.inputs.blood_glucose} mg/dL
              </span>
            </div>
            <div>
              <span className="font-mono text-slate-500 block">BMI &amp; HISTORY</span>
              <span className="font-mono font-semibold text-slate-900 text-sm">
                {record.inputs.bmi.toFixed(1)} kg/m² · BP:{record.inputs.hypertension}
              </span>
            </div>
          </div>

          {/* Diagnostic Risk Verdict */}
          <div
            className={`p-4 rounded-lg border ${
              record.prediction === 1
                ? 'bg-rose-50 border-rose-300 text-rose-950'
                : 'bg-emerald-50 border-emerald-300 text-emerald-950'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-base">
              {record.prediction === 1 ? (
                <>
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span>
                    HIGH RISK DETECTED — Probability: {record.probPercentage.toFixed(2)}% (Cutoff:
                    35%)
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>
                    LOW RISK DETECTED — Probability: {record.probPercentage.toFixed(2)}% (Cutoff:
                    35%)
                  </span>
                </>
              )}
            </div>
            <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-slate-700">
              {record.clinicalSummary}
            </p>
          </div>

          {/* Visual Charts Row (Dark containers preserve high-contrast SVG telemetry readability) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#0F172A] text-white rounded-lg p-4 border border-slate-800">
              <RiskGaugeChart
                probPercentage={record.probPercentage}
                thresholdPercentage={CLINICAL_THRESHOLD * 100}
                prediction={record.prediction}
              />
            </div>
            <div className="bg-[#0F172A] text-white rounded-lg p-4 border border-slate-800">
              <RadarBiomarkerChart inputs={record.inputs} />
            </div>
          </div>

          {/* Feature Impact Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-mono font-bold text-slate-700">
              LIGHTGBM FEATURE IMPACT ATTRIBUTION (LOG-ODDS DELTA)
            </h3>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 font-mono text-[11px] text-slate-600">
                    <th className="py-2 px-3">BIOMARKER FEATURE</th>
                    <th className="py-2 px-3">RECORDED VALUE</th>
                    <th className="py-2 px-3">STATUS</th>
                    <th className="py-2 px-3 text-right">LOG-ODDS IMPACT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {record.contributions.map((c) => {
                    const isPositive = c.impactScore > 0;
                    return (
                      <tr key={c.feature}>
                        <td className="py-2 px-3 font-medium text-slate-800">{c.label}</td>
                        <td className="py-2 px-3 font-mono text-slate-600">{c.valueDisplay}</td>
                        <td
                          className={`py-2 px-3 font-mono font-semibold ${
                            isPositive ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          {c.status}
                        </td>
                        <td
                          className={`py-2 px-3 font-mono font-semibold text-right tabular-nums ${
                            isPositive ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          {isPositive ? `+${c.impactScore.toFixed(2)}` : c.impactScore.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recommendations */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
            <h3 className="text-xs font-mono font-bold text-slate-700">
              CLINICAL RECOMMENDATIONS &amp; FOLLOW-UP PROTOCOL
            </h3>
            <ul className="space-y-1.5 text-xs sm:text-sm text-slate-800">
              {record.recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="font-mono font-semibold text-cyan-700">0{idx + 1}.</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Report Footer */}
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">
              © Diabetes Risk Assessment System | Developed by Md.Saif Al Hasan
            </span>
            <span className="font-mono text-[11px]">
              LightGBM Clinical Screening · Calibrated Threshold 0.35
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
