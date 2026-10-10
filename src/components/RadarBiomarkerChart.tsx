import React, { useEffect, useRef, useState } from 'react';
import { PatientInput } from '../types/clinical';
import {
  computeRadarBiomarkerAxes,
  getRadarAxisPoint,
  getRadarAxisAngle,
} from '../utils/chartGeometry';

interface RadarBiomarkerChartProps {
  inputs: PatientInput;
  theme?: 'dark' | 'light';
}

export const RadarBiomarkerChart: React.FC<RadarBiomarkerChartProps> = ({
  inputs,
  theme = 'dark',
}) => {
  const isLight = theme === 'light';
  const axes = computeRadarBiomarkerAxes(inputs);
  const totalAxes = axes.length; // 5 axes spaced at exactly 72 degrees

  // Smoothly interpolate all 5 normalized values when sliders change
  const [animatedNorms, setAnimatedNorms] = useState<number[]>(() =>
    axes.map((a) => a.normalizedValue)
  );
  const currentNormsRef = useRef<number[]>(axes.map((a) => a.normalizedValue));
  const rafRef = useRef<number | null>(null);
  const [hoveredAxis, setHoveredAxis] = useState<number | null>(null);

  useEffect(() => {
    const startNorms = [...currentNormsRef.current];
    const endNorms = axes.map((a) => a.normalizedValue);

    const maxDiff = Math.max(
      ...endNorms.map((val, idx) => Math.abs(val - (startNorms[idx] ?? val)))
    );
    if (maxDiff < 0.002) {
      currentNormsRef.current = endNorms;
      setAnimatedNorms(endNorms);
      return;
    }

    const duration = 220;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);

      const next = startNorms.map(
        (sVal, idx) => sVal + ((endNorms[idx] ?? sVal) - sVal) * eased
      );
      currentNormsRef.current = next;
      setAnimatedNorms(next);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        currentNormsRef.current = endNorms;
        setAnimatedNorms(endNorms);
      }
    };

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    inputs.hba1c,
    inputs.blood_glucose,
    inputs.bmi,
    inputs.age,
    inputs.hypertension,
    inputs.heart_disease,
    inputs.smoking_history,
  ]);

  // Unified responsive SVG coordinate system with equal 1:1 horizontal/vertical scaling
  const viewBoxWidth = 340;
  const viewBoxHeight = 250;
  const centerX = viewBoxWidth / 2; // 170
  const centerY = 132;
  const maxRadius = 74;
  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  // 1. Reference boundary polygon points (mathematically centered regular pentagon at referenceNormalized)
  const referencePolygonPoints = axes
    .map((axis, idx) => {
      const pt = getRadarAxisPoint(
        centerX,
        centerY,
        maxRadius,
        idx,
        axis.referenceNormalized,
        totalAxes
      );
      return `${pt.x},${pt.y}`;
    })
    .join(' ');

  // 2. Patient data polygon points (using exact same center, maxRadius, and 72-deg axis angles)
  const patientPolygonPoints = axes
    .map((axis, idx) => {
      const normVal = animatedNorms[idx] ?? axis.normalizedValue;
      const pt = getRadarAxisPoint(centerX, centerY, maxRadius, idx, normVal, totalAxes);
      return `${pt.x},${pt.y}`;
    })
    .join(' ');

  const activeInspect = hoveredAxis !== null ? axes[hoveredAxis] : null;

  return (
    <div className="flex flex-col items-center justify-between h-full w-full">
      <div className="w-full flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-slate-400">MULTI-AXIAL BIOMARKER TOPOLOGY</span>
        <span className="text-xs font-mono text-cyan-400">5-AXIS CALIBRATION</span>
      </div>

      <div className="w-full flex items-center justify-center">
        <svg
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full max-w-[350px] h-auto overflow-visible"
        >
          {/* Concentric Regular Pentagon Grid Rings */}
          {gridLevels.map((lvl) => {
            const ringPoints = axes
              .map((_, idx) => {
                const pt = getRadarAxisPoint(centerX, centerY, maxRadius, idx, lvl, totalAxes);
                return `${pt.x},${pt.y}`;
              })
              .join(' ');
            return (
              <polygon
                key={`grid-${lvl}`}
                points={ringPoints}
                fill="none"
                stroke={isLight ? '#CBD5E1' : '#1E293B'}
                strokeWidth={1}
              />
            );
          })}

          {/* 5 Equally Spaced Radial Axis Lines (72° apart) from Center to Outer Ring */}
          {axes.map((axis, idx) => {
            const outerPt = getRadarAxisPoint(centerX, centerY, maxRadius, idx, 1.0, totalAxes);
            const isHovered = hoveredAxis === idx;
            return (
              <g key={`axis-line-${axis.key}`}>
                <line
                  x1={centerX}
                  y1={centerY}
                  x2={outerPt.x}
                  y2={outerPt.y}
                  stroke={isHovered ? '#0284C7' : isLight ? '#CBD5E1' : '#334155'}
                  strokeWidth={isHovered ? 1.5 : 1}
                />
                {/* Outer Axis Endpoint Tick Node */}
                <circle
                  cx={outerPt.x}
                  cy={outerPt.y}
                  r={2}
                  fill={isLight ? '#94A3B8' : '#475569'}
                />
              </g>
            );
          })}

          {/* Center Origin Crosshair Dot */}
          <circle cx={centerX} cy={centerY} r={2} fill={isLight ? '#94A3B8' : '#475569'} />

          {/* Mathematically Centered Normal Reference Boundary (Dashed Emerald Pentagon) */}
          <polygon
            points={referencePolygonPoints}
            fill="rgba(16, 185, 129, 0.08)"
            stroke="#10B981"
            strokeWidth={1.4}
            strokeDasharray="3 3"
          />

          {/* Patient Biomarker Topology Polygon (Cyan/Teal Profile) */}
          <polygon
            points={patientPolygonPoints}
            fill="rgba(6, 182, 212, 0.22)"
            stroke={isLight ? '#0284C7' : '#06B6D4'}
            strokeWidth={2}
          />

          {/* Plotted Patient Data Points & Axis-Aligned Labels */}
          {axes.map((axis, idx) => {
            const normVal = animatedNorms[idx] ?? axis.normalizedValue;
            // Data point lies strictly on axis `idx` at distance `maxRadius * normVal`
            const dataPt = getRadarAxisPoint(
              centerX,
              centerY,
              maxRadius,
              idx,
              normVal,
              totalAxes
            );

            // Label anchor lies strictly along the same axis ray outside the outer ring
            const labelRayMultiplier = idx === 0 ? 1.24 : idx === 2 || idx === 3 ? 1.28 : 1.18;
            const labelPt = getRadarAxisPoint(
              centerX,
              centerY,
              maxRadius,
              idx,
              labelRayMultiplier,
              totalAxes
            );

            // Determine textAnchor based on the axis angle cos(angle) so side labels never clip
            const angle = getRadarAxisAngle(idx, totalAxes);
            const cosVal = Math.cos(angle);
            const textAnchor: 'start' | 'middle' | 'end' =
              cosVal > 0.25 ? 'start' : cosVal < -0.25 ? 'end' : 'middle';

            const isHovered = hoveredAxis === idx;

            return (
              <g
                key={axis.key}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredAxis(idx)}
                onMouseLeave={() => setHoveredAxis(null)}
              >
                {/* Subtle hover halo */}
                {isHovered && (
                  <circle
                    cx={dataPt.x}
                    cy={dataPt.y}
                    r={7}
                    fill="none"
                    stroke="#06B6D4"
                    strokeOpacity={0.5}
                    strokeWidth={1.5}
                  />
                )}

                {/* Plotted Patient Data Vertex on the Axis */}
                <circle
                  cx={dataPt.x}
                  cy={dataPt.y}
                  r={isHovered ? 4.5 : 3.8}
                  fill={isLight ? '#0284C7' : '#06B6D4'}
                  stroke={isLight ? '#FFFFFF' : '#07090E'}
                  strokeWidth={1.5}
                />

                {/* Axis Biomarker Name */}
                <text
                  x={labelPt.x}
                  y={labelPt.y - 5}
                  textAnchor={textAnchor}
                  dominantBaseline="middle"
                  fill={isHovered ? (isLight ? '#0284C7' : '#FFFFFF') : isLight ? '#0F172A' : '#E2E8F0'}
                  className="text-[10px] font-mono font-semibold"
                >
                  {axis.label}
                </text>

                {/* Axis Biomarker Value */}
                <text
                  x={labelPt.x}
                  y={labelPt.y + 8}
                  textAnchor={textAnchor}
                  dominantBaseline="middle"
                  fill={isLight ? '#0284C7' : '#22D3EE'}
                  className="text-[9.5px] font-mono font-semibold"
                >
                  {axis.valueDisplay}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend / Hover Readout */}
      <div className="w-full pt-3 mt-1 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
        {activeInspect ? (
          <div className="w-full flex items-center justify-between text-[11px]">
            <span className="text-slate-200 font-semibold">
              {activeInspect.label}: {activeInspect.valueDisplay}
            </span>
            <span className={activeInspect.isElevated ? 'text-amber-400' : 'text-emerald-400'}>
              {activeInspect.referenceLabel}
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-0.5 bg-cyan-400" />
              <span>Patient Profile</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-0.5 border-b border-dashed border-emerald-400" />
              <span>Normal Reference Bound</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
