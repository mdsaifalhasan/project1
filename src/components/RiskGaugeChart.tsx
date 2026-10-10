import React, { useEffect, useRef, useState } from 'react';
import {
  polarToCartesian,
  gaugePercentageToAngle,
  describeGaugeArc,
} from '../utils/chartGeometry';

interface RiskGaugeChartProps {
  probPercentage: number;
  thresholdPercentage: number;
  prediction: 0 | 1;
  theme?: 'dark' | 'light';
}

export const RiskGaugeChart: React.FC<RiskGaugeChartProps> = ({
  probPercentage,
  thresholdPercentage,
  prediction,
  theme = 'dark',
}) => {
  const isLight = theme === 'light';
  const targetValue = Math.max(0, Math.min(100, Number(probPercentage) || 0));
  const clampedThreshold = Math.max(0, Math.min(100, Number(thresholdPercentage) || 35));

  // Smooth 60fps interpolation so the needle (kaata) sweeps cleanly between probabilities
  const [animatedValue, setAnimatedValue] = useState<number>(targetValue);
  const currentValRef = useRef<number>(targetValue);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const startVal = currentValRef.current;
    const endVal = targetValue;
    if (Math.abs(endVal - startVal) < 0.01) {
      currentValRef.current = endVal;
      setAnimatedValue(endVal);
      return;
    }

    const duration = 220;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextVal = startVal + (endVal - startVal) * eased;
      currentValRef.current = nextVal;
      setAnimatedValue(nextVal);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        currentValRef.current = endVal;
        setAnimatedValue(endVal);
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
  }, [targetValue]);

  // Unified SVG coordinate system (Responsive via viewBox="0 0 320 215")
  const viewBoxWidth = 320;
  const viewBoxHeight = 215;
  const centerX = viewBoxWidth / 2; // 160
  const centerY = 148;
  const radius = 108;
  const strokeWidth = 18;

  // 1. Threshold marker coordinates using exact polar math at clampedThreshold (35%)
  const thresholdAngle = gaugePercentageToAngle(clampedThreshold);
  const threshInnerPt = polarToCartesian(
    centerX,
    centerY,
    radius - strokeWidth / 2 - 6,
    thresholdAngle
  );
  const threshOuterPt = polarToCartesian(
    centerX,
    centerY,
    radius + strokeWidth / 2 + 6,
    thresholdAngle
  );
  const threshLabelPt = polarToCartesian(
    centerX,
    centerY,
    radius + strokeWidth / 2 + 20,
    thresholdAngle
  );

  // 2. Needle coordinates using the exact same polar math from center pivot (centerX, centerY)
  const needleAngle = gaugePercentageToAngle(animatedValue);
  const needleTipRadius = radius - 4;
  const needleTipPt = polarToCartesian(centerX, centerY, needleTipRadius, needleAngle);

  // Tapered needle base wings around the exact center pivot (starts at center pivot and points outward)
  const wingHalfWidth = 4.2;
  const leftWingPt = polarToCartesian(
    centerX,
    centerY,
    wingHalfWidth,
    needleAngle - Math.PI / 2
  );
  const rightWingPt = polarToCartesian(
    centerX,
    centerY,
    wingHalfWidth,
    needleAngle + Math.PI / 2
  );
  const needlePolygon = `${leftWingPt.x},${leftWingPt.y} ${needleTipPt.x},${needleTipPt.y} ${rightWingPt.x},${rightWingPt.y}`;

  const isCurrentlyHighRisk = animatedValue >= clampedThreshold || prediction === 1;
  const activeColor = isCurrentlyHighRisk ? '#EF4444' : '#10B981';

  // Major percentage ticks: 0%, 25%, 50%, 75%, 100%
  const scaleTicks = [0, 25, 50, 75, 100];

  return (
    <div className="flex flex-col items-center justify-between h-full w-full">
      <div className="w-full flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-slate-400">DIABETES PROBABILITY INDEX</span>
        <span className="text-xs font-mono text-amber-400">
          THRESHOLD: {clampedThreshold.toFixed(0)}%
        </span>
      </div>

      <div className="w-full flex items-center justify-center">
        <svg
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full max-w-[340px] h-auto overflow-visible"
        >
          {/* Base Semicircular Track (0% -> 100%) */}
          <path
            d={describeGaugeArc(centerX, centerY, radius, 0, 100)}
            fill="none"
            stroke={isLight ? '#E2E8F0' : '#1E293B'}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />

          {/* Low-Risk Zone (0% -> 35%) */}
          <path
            d={describeGaugeArc(centerX, centerY, radius, 0, clampedThreshold)}
            fill="none"
            stroke="rgba(16, 185, 129, 0.22)"
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />

          {/* High-Risk Zone (35% -> 100%) */}
          <path
            d={describeGaugeArc(centerX, centerY, radius, clampedThreshold, 100)}
            fill="none"
            stroke="rgba(239, 68, 68, 0.22)"
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />

          {/* Active Probability Arc (0% -> animatedValue%) */}
          {animatedValue > 0.1 && (
            <path
              d={describeGaugeArc(centerX, centerY, radius, 0, animatedValue)}
              fill="none"
              stroke={activeColor}
              strokeWidth={strokeWidth - 4}
              strokeLinecap="butt"
            />
          )}

          {/* Subtle Radial Tick Marks every 5% */}
          {Array.from({ length: 21 }, (_, idx) => idx * 5).map((pct) => {
            const tickAngle = gaugePercentageToAngle(pct);
            const isMajor = pct % 25 === 0;
            const rInner = radius + strokeWidth / 2 + 2;
            const rOuter = radius + strokeWidth / 2 + (isMajor ? 7 : 4);
            const p1 = polarToCartesian(centerX, centerY, rInner, tickAngle);
            const p2 = polarToCartesian(centerX, centerY, rOuter, tickAngle);
            return (
              <line
                key={`tick-${pct}`}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={
                  isMajor
                    ? isLight
                      ? '#64748B'
                      : '#64748B'
                    : isLight
                    ? '#CBD5E1'
                    : '#334155'
                }
                strokeWidth={isMajor ? 1.5 : 1}
              />
            );
          })}

          {/* Percentage Labels: 0%, 25%, 50%, 75%, 100% */}
          {scaleTicks.map((pct) => {
            const labelAngle = gaugePercentageToAngle(pct);
            const labelRadius = radius + strokeWidth / 2 + 18;
            const pt = polarToCartesian(centerX, centerY, labelRadius, labelAngle);
            return (
              <text
                key={`label-${pct}`}
                x={pt.x}
                y={pt.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={isLight ? '#475569' : '#94A3B8'}
                className="text-[10px] font-mono"
              >
                {pct}%
              </text>
            );
          })}

          {/* 35% Clinical Threshold Marker Line & Associated Label */}
          <line
            x1={threshInnerPt.x}
            y1={threshInnerPt.y}
            x2={threshOuterPt.x}
            y2={threshOuterPt.y}
            stroke="#F59E0B"
            strokeWidth={3}
            strokeLinecap="round"
          />
          <text
            x={threshLabelPt.x - 4}
            y={threshLabelPt.y - 2}
            textAnchor="end"
            dominantBaseline="middle"
            fill={isLight ? '#D97706' : '#FBBF24'}
            className="text-[9.5px] font-mono font-semibold"
          >
            {clampedThreshold.toFixed(0)}% cutoff
          </text>

          {/* Needle Starting Exactly at Center Pivot and Pointing Outward to Arc */}
          <polygon
            points={needlePolygon}
            fill={isLight ? '#0F172A' : '#F8FAFC'}
            stroke={isLight ? '#FFFFFF' : '#0F172A'}
            strokeWidth={0.6}
          />
          <line
            x1={centerX}
            y1={centerY}
            x2={needleTipPt.x}
            y2={needleTipPt.y}
            stroke={isLight ? '#0F172A' : '#F8FAFC'}
            strokeWidth={2}
            strokeLinecap="round"
          />
          {/* Needle Tip Target Dot on the Arc */}
          <circle
            cx={needleTipPt.x}
            cy={needleTipPt.y}
            r={3}
            fill={activeColor}
            stroke={isLight ? '#FFFFFF' : '#07090E'}
            strokeWidth={1}
          />

          {/* Central Pivot Circular Indicator */}
          <circle
            cx={centerX}
            cy={centerY}
            r={8}
            fill={isLight ? '#FFFFFF' : '#1E293B'}
            stroke={isLight ? '#0F172A' : '#F8FAFC'}
            strokeWidth={2}
          />
          <circle cx={centerX} cy={centerY} r={3.2} fill={activeColor} />

          {/* Numeric Probability Readout Positioned Cleanly Below the Pivot */}
          <text
            x={centerX}
            y={centerY + 34}
            textAnchor="middle"
            fill={isLight ? '#0F172A' : '#F8FAFC'}
            className="text-[26px] font-mono font-bold tabular-nums"
          >
            {animatedValue.toFixed(1)}%
          </text>
          <text
            x={centerX}
            y={centerY + 52}
            textAnchor="middle"
            fill={
              isCurrentlyHighRisk
                ? isLight
                  ? '#DC2626'
                  : '#F87171'
                : isLight
                ? '#059669'
                : '#34D399'
            }
            className="text-[10.5px] font-mono font-semibold"
          >
            {isCurrentlyHighRisk ? '▲ ABOVE 35% CUTOFF' : '● BELOW 35% CUTOFF'}
          </text>
        </svg>
      </div>

      {/* Legend Bar */}
      <div className="w-full pt-3 mt-1 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>0–35% Nominal</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-0.5 bg-amber-400" />
          <span>35% Cutoff</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          <span>35–100% High Risk</span>
        </div>
      </div>
    </div>
  );
};
