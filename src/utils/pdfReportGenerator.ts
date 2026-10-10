import { jsPDF } from 'jspdf';
import { AssessmentRecord, PatientInput } from '../types/clinical';
import {
  polarToCartesian,
  gaugePercentageToAngle,
  computeRadarBiomarkerAxes,
  getRadarAxisPoint,
  getRadarAxisAngle,
} from './chartGeometry';

// Helper to draw the semi-circular Risk Gauge onto an HTML5 Canvas and return a high-res PNG Data URL
function renderGaugeToDataUrl(
  probPercentage: number,
  thresholdPercentage: number,
  prediction: 0 | 1
): string {
  const canvas = document.createElement('canvas');
  const width = 640;
  const height = 420;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // White printer-friendly background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  const clampedValue = Math.max(0, Math.min(100, probPercentage));
  const clampedThreshold = Math.max(0, Math.min(100, thresholdPercentage));
  const cx = width / 2;
  const cy = 280;
  const radius = 190;
  const strokeWidth = 32;

  // Title & Threshold Header
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('DIABETES PROBABILITY INDEX', 28, 38);

  ctx.fillStyle = '#B45309';
  ctx.font = 'bold 19px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`THRESHOLD: ${clampedThreshold.toFixed(0)}%`, width - 28, 38);

  // 1. Base Track (0% -> 100%)
  ctx.beginPath();
  ctx.arc(cx, cy, radius, gaugePercentageToAngle(0), gaugePercentageToAngle(100), false);
  ctx.strokeStyle = '#F1F5F9';
  ctx.lineWidth = strokeWidth;
  ctx.stroke();

  // 2. Low-Risk Zone (0% -> 35%)
  ctx.beginPath();
  ctx.arc(
    cx,
    cy,
    radius,
    gaugePercentageToAngle(0),
    gaugePercentageToAngle(clampedThreshold),
    false
  );
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.22)';
  ctx.lineWidth = strokeWidth;
  ctx.stroke();

  // 3. High-Risk Zone (35% -> 100%)
  ctx.beginPath();
  ctx.arc(
    cx,
    cy,
    radius,
    gaugePercentageToAngle(clampedThreshold),
    gaugePercentageToAngle(100),
    false
  );
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.22)';
  ctx.lineWidth = strokeWidth;
  ctx.stroke();

  // 4. Active Value Bar (0% -> clampedValue%)
  if (clampedValue > 0.1) {
    ctx.beginPath();
    ctx.arc(
      cx,
      cy,
      radius,
      gaugePercentageToAngle(0),
      gaugePercentageToAngle(clampedValue),
      false
    );
    ctx.strokeStyle = prediction === 1 ? '#DC2626' : '#059669';
    ctx.lineWidth = strokeWidth - 8;
    ctx.stroke();
  }

  // 5. Scale Tick Labels (0%, 25%, 50%, 75%, 100%)
  const ticks = [0, 25, 50, 75, 100];
  ticks.forEach((tick) => {
    const angle = gaugePercentageToAngle(tick);
    const labelPt = polarToCartesian(cx, cy, radius + strokeWidth / 2 + 28, angle);
    ctx.font = '16px "JetBrains Mono", monospace';
    ctx.fillStyle = '#64748B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${tick}%`, labelPt.x, labelPt.y);
  });

  // 6. Threshold Marker Line & Label at 35%
  const tAngle = gaugePercentageToAngle(clampedThreshold);
  const tInner = polarToCartesian(cx, cy, radius - strokeWidth / 2 - 10, tAngle);
  const tOuter = polarToCartesian(cx, cy, radius + strokeWidth / 2 + 10, tAngle);
  const tLabel = polarToCartesian(cx, cy, radius + strokeWidth / 2 + 30, tAngle);
  ctx.beginPath();
  ctx.moveTo(tInner.x, tInner.y);
  ctx.lineTo(tOuter.x, tOuter.y);
  ctx.strokeStyle = '#D97706';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.font = 'bold 16px "JetBrains Mono", monospace';
  ctx.fillStyle = '#B45309';
  ctx.textAlign = 'right';
  ctx.fillText(`${clampedThreshold.toFixed(0)}% cutoff`, tLabel.x - 4, tLabel.y);

  // 7. Pointer Needle starting from center pivot (cx, cy) outward to arc
  const vAngle = gaugePercentageToAngle(clampedValue);
  const needleTip = polarToCartesian(cx, cy, radius - 8, vAngle);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(needleTip.x, needleTip.y);
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 12, 0, Math.PI * 2);
  ctx.fillStyle = '#0F172A';
  ctx.fill();

  // 8. Readout Text Below Pivot
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 42px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${clampedValue.toFixed(1)}%`, cx, cy + 56);

  ctx.fillStyle = prediction === 1 ? '#DC2626' : '#059669';
  ctx.font = 'bold 18px "JetBrains Mono", monospace';
  ctx.fillText(
    prediction === 1 ? 'HIGH RISK (ABOVE 35% CUTOFF)' : 'LOW RISK (BELOW 35% CUTOFF)',
    cx,
    cy + 90
  );

  return canvas.toDataURL('image/png');
}

// Helper to draw the 5-Axis Biomarker Topology Radar Chart onto an HTML5 Canvas
function renderRadarToDataUrl(inputs: PatientInput): string {
  const canvas = document.createElement('canvas');
  const width = 640;
  const height = 420;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Header
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('5-AXIS BIOMARKER TOPOLOGY', 28, 38);

  ctx.fillStyle = '#0284C7';
  ctx.font = 'bold 18px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText('5-AXIS CALIBRATION', width - 28, 38);

  const axes = computeRadarBiomarkerAxes(inputs);
  const totalAxes = axes.length;

  const cx = width / 2;
  const cy = 232;
  const maxR = 124;
  const levels = [0.25, 0.5, 0.75, 1.0];

  // Concentric Grid Polygons
  levels.forEach((lvl) => {
    ctx.beginPath();
    axes.forEach((_, i) => {
      const pt = getRadarAxisPoint(cx, cy, maxR, i, lvl, totalAxes);
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath();
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  // Radial Spokes
  axes.forEach((_, i) => {
    const outer = getRadarAxisPoint(cx, cy, maxR, i, 1.0, totalAxes);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(outer.x, outer.y);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  // Mathematically Centered Reference Polygon (Dashed Emerald)
  ctx.beginPath();
  axes.forEach((axis, i) => {
    const pt = getRadarAxisPoint(cx, cy, maxR, i, axis.referenceNormalized, totalAxes);
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(16, 185, 129, 0.10)';
  ctx.fill();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = '#059669';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.setLineDash([]);

  // Patient Active Polygon (Cyan/Teal)
  ctx.beginPath();
  axes.forEach((axis, i) => {
    const pt = getRadarAxisPoint(cx, cy, maxR, i, axis.normalizedValue, totalAxes);
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(6, 182, 212, 0.22)';
  ctx.fill();
  ctx.strokeStyle = '#0891B2';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Vertices & Axis-Aligned Labels
  axes.forEach((axis, i) => {
    const pt = getRadarAxisPoint(cx, cy, maxR, i, axis.normalizedValue, totalAxes);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#0891B2';
    ctx.fill();

    const labelMult = i === 0 ? 1.24 : i === 2 || i === 3 ? 1.28 : 1.18;
    const labelPt = getRadarAxisPoint(cx, cy, maxR, i, labelMult, totalAxes);
    const angle = getRadarAxisAngle(i, totalAxes);
    const cosVal = Math.cos(angle);
    ctx.textAlign = cosVal > 0.25 ? 'left' : cosVal < -0.25 ? 'right' : 'center';

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 16px "JetBrains Mono", monospace';
    ctx.fillText(axis.label, labelPt.x, labelPt.y - 8);

    ctx.fillStyle = '#0284C7';
    ctx.font = 'bold 15px "JetBrains Mono", monospace';
    ctx.fillText(axis.valueDisplay, labelPt.x, labelPt.y + 12);
  });

  return canvas.toDataURL('image/png');
}

export function generateClinicalReportPDF(record: AssessmentRecord): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 14;

  // 1. Header Banner (Printer-friendly dark slate header bar)
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'F');

  doc.setTextColor(248, 250, 252);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('MEDICAL AI: DIABETES RISK INTELLIGENCE REPORT', margin + 5, y + 9);

  doc.setTextColor(56, 189, 248);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('Developed by Md.Saif Al Hasan', margin + 5, y + 15);

  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    'LightGBM Classifier · SMOTE Class-Balanced · Clinical Decision Threshold = 35%',
    margin + 5,
    y + 20.5
  );

  doc.setTextColor(226, 232, 240);
  doc.setFont('courier', 'bold');
  doc.setFontSize(9);
  doc.text(`REPORT ID: ${record.id}`, pageWidth - margin - 5, y + 9, { align: 'right' });
  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.text(
    `DATE: ${new Date(record.timestamp).toLocaleString()}`,
    pageWidth - margin - 5,
    y + 15,
    { align: 'right' }
  );

  y += 29;

  // 2. Patient Demographics & Vitals Summary Grid
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`Patient Name: ${record.patientName}`, margin + 4, y + 7);
  doc.text(`Patient ID: ${record.patientId}`, margin + 78, y + 7);
  doc.text(`Age / Gender: ${record.inputs.age} Yrs / ${record.inputs.gender}`, margin + 128, y + 7);

  doc.setDrawColor(226, 232, 240);
  doc.line(margin + 4, y + 10.5, pageWidth - margin - 4, y + 10.5);

  doc.setFont('courier', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(`BMI: ${record.inputs.bmi.toFixed(1)} kg/m²`, margin + 4, y + 16.5);
  doc.text(`HbA1c: ${record.inputs.hba1c.toFixed(1)}%`, margin + 48, y + 16.5);
  doc.text(`Glucose: ${record.inputs.blood_glucose} mg/dL`, margin + 88, y + 16.5);
  doc.text(`Hypertension: ${record.inputs.hypertension}`, margin + 138, y + 16.5);

  doc.setFont('courier', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Heart Disease: ${record.inputs.heart_disease}   |   Smoking History: ${record.inputs.smoking_history}`,
    margin + 4,
    y + 21.5
  );

  y += 29;

  // 3. Executive Risk Verdict Banner
  const isHighRisk = record.prediction === 1;
  if (isHighRisk) {
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(239, 68, 68);
  } else {
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(16, 185, 129);
  }
  doc.roundedRect(margin, y, contentWidth, 16, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  if (isHighRisk) {
    doc.setTextColor(185, 28, 28);
  } else {
    doc.setTextColor(4, 120, 87);
  }
  const statusHeadline = isHighRisk
    ? `HIGH RISK DETECTED — Calculated Probability: ${record.probPercentage.toFixed(2)}% (Threshold: 35%)`
    : `LOW RISK DETECTED — Calculated Probability: ${record.probPercentage.toFixed(2)}% (Threshold: 35%)`;
  doc.text(statusHeadline, margin + 4, y + 6.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const splitSummary = doc.splitTextToSize(record.clinicalSummary, contentWidth - 8);
  doc.text(splitSummary, margin + 4, y + 11.5);

  y += 21;

  // 4. Side-by-Side Visual Charts (Risk Gauge + 5-Axis Biomarker Radar)
  const gaugeDataUrl = renderGaugeToDataUrl(
    record.probPercentage,
    record.threshold * 100,
    record.prediction
  );
  const radarDataUrl = renderRadarToDataUrl(record.inputs);

  const chartBoxW = (contentWidth - 6) / 2;
  const chartBoxH = 55;

  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin, y, chartBoxW, chartBoxH, 2, 2, 'FD');
  doc.addImage(gaugeDataUrl, 'PNG', margin + 2, y + 2, chartBoxW - 4, chartBoxH - 4);

  doc.roundedRect(margin + chartBoxW + 6, y, chartBoxW, chartBoxH, 2, 2, 'FD');
  doc.addImage(
    radarDataUrl,
    'PNG',
    margin + chartBoxW + 8,
    y + 2,
    chartBoxW - 4,
    chartBoxH - 4
  );

  y += chartBoxH + 6;

  // 5. LightGBM Feature Impact Attribution Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('LIGHTGBM FEATURE IMPACT ATTRIBUTION (LOG-ODDS DELTA)', margin, y);
  y += 3;

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, contentWidth, 6.5, 'FD');
  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('BIOMARKER / CLINICAL FEATURE', margin + 3, y + 4.5);
  doc.text('PATIENT VALUE', margin + 88, y + 4.5);
  doc.text('STATUS', margin + 128, y + 4.5);
  doc.text('LOG-ODDS IMPACT', pageWidth - margin - 3, y + 4.5, { align: 'right' });
  y += 6.5;

  record.contributions.forEach((c, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, 6.5, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, contentWidth, 6.5, 'S');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(c.label, margin + 3, y + 4.5);

    doc.setFont('courier', 'normal');
    doc.text(c.valueDisplay, margin + 88, y + 4.5);

    const isElev = c.impactScore > 0;
    if (isElev) {
      doc.setTextColor(185, 28, 28);
    } else {
      doc.setTextColor(4, 120, 87);
    }
    doc.setFont('courier', 'bold');
    doc.text(c.status, margin + 128, y + 4.5);

    const scoreStr = isElev ? `+${c.impactScore.toFixed(2)}` : c.impactScore.toFixed(2);
    doc.text(scoreStr, pageWidth - margin - 3, y + 4.5, { align: 'right' });

    y += 6.5;
  });

  y += 7;

  // 6. Clinical Recommendations & Action Plan
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('CLINICAL RECOMMENDATIONS & FOLLOW-UP PROTOCOL', margin, y);
  y += 3;

  const recBoxHeight = Math.max(24, record.recommendations.length * 7 + 8);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, recBoxHeight, 2, 2, 'FD');

  let recY = y + 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(30, 41, 59);

  record.recommendations.forEach((rec, i) => {
    const wrapped = doc.splitTextToSize(`0${i + 1}. ${rec}`, contentWidth - 8);
    doc.text(wrapped, margin + 4, recY);
    recY += wrapped.length * 4.8 + 1.5;
  });

  // 7. Footer with Developer Attribution
  const footerY = 285;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    '© Diabetes Risk Assessment System | Developed by Md.Saif Al Hasan',
    margin,
    footerY
  );

  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'LightGBM Clinical Screening Tool · Not a substitute for physician diagnosis',
    pageWidth - margin,
    footerY,
    { align: 'right' }
  );

  const safeId = (record.patientId || 'Patient').replace(/[^a-zA-Z0-9-_]/g, '_');
  doc.save(`${safeId}_Clinical_Report.pdf`);
}
