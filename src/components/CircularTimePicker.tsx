import React, { useState } from 'react';
import { Clock, Check, RotateCcw } from 'lucide-react';

interface CircularTimePickerProps {
  hour: number; // 1 - 12
  minute: string; // '00' - '59'
  period: 'AM' | 'PM';
  isAr: boolean;
  onHourChange: (hour: number) => void;
  onMinuteChange: (minute: string) => void;
  onPeriodChange: (period: 'AM' | 'PM') => void;
  onConfirm?: () => void;
}

export const CircularTimePicker: React.FC<CircularTimePickerProps> = ({
  hour,
  minute,
  period,
  isAr,
  onHourChange,
  onMinuteChange,
  onPeriodChange,
  onConfirm,
}) => {
  // Step: 'hour' -> user picks hour -> automatically switches to 'minute'
  const [activeStep, setActiveStep] = useState<'hour' | 'minute'>('hour');

  // 12 hours arranged in circle (1 to 12)
  // 12 is at top (angle -90 deg), 1 is at -60 deg, 3 is at 0 deg, 6 is at 90 deg, 9 is at 180 deg
  const hoursList = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  // 12 primary minute intervals (00, 05, 10, 15, ..., 55)
  const minutesList = [
    '00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'
  ];

  const handleHourSelect = (h: number) => {
    onHourChange(h);
    // Smooth auto transition to minutes immediately
    setTimeout(() => {
      setActiveStep('minute');
    }, 180);
  };

  const handleMinuteSelect = (m: string) => {
    onMinuteChange(m);
  };

  // Convert current selected hour to angle for pointer line
  const hourAngle = ((hour % 12) * 30); // 12 -> 0 deg, 1 -> 30 deg, 3 -> 90 deg
  // Convert current selected minute to angle for pointer line
  const currentMinuteNum = parseInt(minute, 10) || 0;
  const minuteAngle = currentMinuteNum * 6; // 0 -> 0 deg, 15 -> 90 deg, 30 -> 180 deg

  const currentAngle = activeStep === 'hour' ? hourAngle : minuteAngle;

  return (
    <div className="flex flex-col items-center select-none bg-slate-50 dark:bg-slate-900/70 p-3 sm:p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-sm mx-auto w-full">
      {/* Time Header with Interactive Pill & AM/PM */}
      <div className="flex items-center justify-between w-full mb-3 px-1 gap-2">
        {/* Interactive Display Header: Click hour or minute to switch */}
        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveStep('hour')}
            className={`text-2xl font-black px-2 py-0.5 rounded-xl transition-all cursor-pointer ${
              activeStep === 'hour'
                ? 'bg-purple-600 text-white shadow-xs scale-105'
                : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            {hour}
          </button>
          <span className="text-xl font-black text-slate-400 animate-pulse">:</span>
          <button
            type="button"
            onClick={() => setActiveStep('minute')}
            className={`text-2xl font-black px-2 py-0.5 rounded-xl transition-all cursor-pointer font-mono ${
              activeStep === 'minute'
                ? 'bg-purple-600 text-white shadow-xs scale-105'
                : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            {minute}
          </button>
        </div>

        {/* Current Mode Badge */}
        <div className="flex flex-col items-center">
          <span className="text-[11px] font-black text-purple-700 dark:text-purple-300 bg-purple-100/70 dark:bg-purple-950/70 px-2.5 py-1 rounded-full border border-purple-300 dark:border-purple-800">
            {activeStep === 'hour'
              ? (isAr ? 'اختر الساعة ⏱️' : 'Pick Hour')
              : (isAr ? 'اختر الدقيقة 🎯' : 'Pick Minute')}
          </span>
        </div>

        {/* AM / PM Segmented Switch */}
        <div className="flex items-center bg-white dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <button
            type="button"
            onClick={() => onPeriodChange('AM')}
            className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
              period === 'AM'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            {isAr ? 'ص' : 'AM'}
          </button>
          <button
            type="button"
            onClick={() => onPeriodChange('PM')}
            className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
              period === 'PM'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            {isAr ? 'م' : 'PM'}
          </button>
        </div>
      </div>

      {/* The Circular Clock Face */}
      <div className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-full bg-white dark:bg-slate-800/90 shadow-inner border-4 border-slate-100 dark:border-slate-700/80 flex items-center justify-center p-3 my-1">
        {/* Center Pivot Point */}
        <div className="w-3.5 h-3.5 bg-purple-600 rounded-full z-20 shadow-xs ring-4 ring-purple-200 dark:ring-purple-900/50" />

        {/* Clock Hand / Pointer line */}
        <div
          className="absolute z-10 origin-bottom transition-transform duration-300 ease-out pointer-events-none"
          style={{
            bottom: '50%',
            left: 'calc(50% - 1.5px)',
            width: '3px',
            height: '38%',
            backgroundColor: '#9333ea',
            transform: `rotate(${currentAngle}deg)`,
          }}
        >
          {/* Target Pointer Circle at outer tip */}
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-purple-600/25 border-2 border-purple-600 -translate-x-[16.5px] sm:-translate-x-[18.5px] -translate-y-[16px] sm:-translate-y-[18px]" />
        </div>

        {/* 1. Hour Numbers Circle */}
        {activeStep === 'hour' && (
          <div className="absolute inset-0 transition-opacity duration-200">
            {hoursList.map((h, i) => {
              // 12 is index 0 -> angle -90deg (top). Each step is 30deg.
              const angleDeg = (i * 30) - 90;
              const angleRad = (angleDeg * Math.PI) / 180;
              // Radius ~ 38%
              const radiusPercent = 38;
              const x = 50 + radiusPercent * Math.cos(angleRad);
              const y = 50 + radiusPercent * Math.sin(angleRad);
              const isSelected = hour === h;

              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => handleHourSelect(h)}
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                  }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-black text-sm sm:text-base transition-transform active:scale-90 cursor-pointer z-15 ${
                    isSelected
                      ? 'bg-purple-600 text-white shadow-md scale-110'
                      : 'text-slate-800 dark:text-slate-100 hover:bg-purple-100 dark:hover:bg-purple-950/60'
                  }`}
                >
                  {h}
                </button>
              );
            })}
          </div>
        )}

        {/* 2. Minute Numbers Circle */}
        {activeStep === 'minute' && (
          <div className="absolute inset-0 transition-opacity duration-200">
            {minutesList.map((m, i) => {
              // '00' is index 0 -> angle -90deg (top). Each step is 30deg (5 minutes).
              const angleDeg = (i * 30) - 90;
              const angleRad = (angleDeg * Math.PI) / 180;
              const radiusPercent = 38;
              const x = 50 + radiusPercent * Math.cos(angleRad);
              const y = 50 + radiusPercent * Math.sin(angleRad);
              const isSelected = minute === m;

              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleMinuteSelect(m)}
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                  }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-black text-xs sm:text-sm font-mono transition-transform active:scale-90 cursor-pointer z-15 ${
                    isSelected
                      ? 'bg-purple-600 text-white shadow-md scale-110'
                      : 'text-slate-800 dark:text-slate-100 hover:bg-purple-100 dark:hover:bg-purple-950/60'
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Switcher & Helper Footer */}
      <div className="flex items-center justify-between w-full mt-2.5 px-2">
        <button
          type="button"
          onClick={() => setActiveStep((prev) => (prev === 'hour' ? 'minute' : 'hour'))}
          className="text-xs font-bold text-purple-700 dark:text-purple-300 hover:underline flex items-center gap-1 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>
            {activeStep === 'hour'
              ? (isAr ? 'الانتقال إلى الدقائق' : 'Switch to minutes')
              : (isAr ? 'الرجوع لاختيار الساعة' : 'Back to hours')}
          </span>
        </button>

        {/* Quick popular minute shortcuts if in minute step */}
        {activeStep === 'minute' && (
          <div className="flex items-center gap-1">
            {['00', '15', '30', '45'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onMinuteChange(m)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-black font-mono transition-colors cursor-pointer ${
                  minute === m
                    ? 'bg-purple-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                :{m}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Done / Confirm Button */}
      {onConfirm && (
        <div className="w-full pt-3 mt-1 border-t border-slate-200 dark:border-slate-700/80 flex justify-end">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full py-2 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-98"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isAr ? 'تم تحديد الوقت' : 'Done'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
