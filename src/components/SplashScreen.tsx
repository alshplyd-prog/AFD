import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Language } from '../types';

interface SplashScreenProps {
  onComplete: () => void;
  lang?: Language;
  forceShow?: boolean;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onComplete,
  lang = 'ar',
  forceShow = false,
}) => {
  const isAr = lang === 'ar';
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState(
    isAr ? 'جاري تهيئة النظام المالي...' : 'Initializing financial system...'
  );
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (!forceShow) {
      try {
        const hasShown = sessionStorage.getItem('sami_splash_shown_v2');
        if (hasShown === 'true') {
          onComplete();
          return;
        }
      } catch (e) {
        // ignore
      }
    }

    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + Math.floor(Math.random() * 18) + 12;
        if (next >= 100) {
          clearInterval(interval);
          setStatusText(isAr ? 'مرحباً بكم في نظام الكرار' : 'Welcome to Al-Karrar');
          setTimeout(() => {
            handleDismiss();
          }, 400);
          return 100;
        }
        if (next > 65) {
          setStatusText(isAr ? 'التحقق من الاتصال والمزامنة الحية...' : 'Verifying sync and live connection...');
        } else if (next > 30) {
          setStatusText(isAr ? 'تحميل المحافظ وصناديق الأقساط...' : 'Loading installment funds & ledger...');
        }
        return next;
      });
    }, 150);

    return () => clearInterval(interval);
  }, [forceShow]);

  const handleDismiss = () => {
    setIsClosing(true);
    try {
      sessionStorage.setItem('sami_splash_shown_v2', 'true');
    } catch (e) {}
    setTimeout(() => {
      onComplete();
    }, 350);
  };

  return (
    <AnimatePresence>
      {!isClosing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          onClick={handleDismiss}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-between bg-slate-950 text-slate-100 p-6 select-none dir-rtl cursor-pointer overflow-hidden"
        >
          {/* Ambient background glow matching the teal/ice-blue theme */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
            <div className="w-[500px] h-[500px] rounded-full bg-teal-500/10 blur-[120px] animate-pulse" />
            <div className="absolute top-1/4 w-72 h-72 rounded-full bg-cyan-500/10 blur-[90px]" />
          </div>

          {/* Top spacer */}
          <div className="h-6" />

          {/* Center: App Icon with soft glowing ring and typography */}
          <div className="relative z-10 flex flex-col items-center text-center max-w-sm">
            {/* App Icon Container */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="relative mb-6"
            >
              {/* Outer soft glow ring */}
              <div className="absolute -inset-2 rounded-3xl bg-gradient-to-tr from-teal-500/30 to-cyan-400/30 blur-md" />
              
              <div className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-3xl overflow-hidden shadow-2xl border border-white/20 bg-slate-900 flex items-center justify-center">
                <img
                  src="/icon.png"
                  alt="الكرار للموبايل"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>

            {/* Title */}
            <motion.h1
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2 drop-shadow-md"
            >
              {isAr ? 'الكرار للتقسيط للموبايل' : 'Al-Karrar Installment'}
            </motion.h1>

            <motion.p
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.4 }}
              className="text-xs sm:text-sm font-bold text-teal-300 tracking-wide uppercase drop-shadow"
            >
              {isAr ? 'الحلول المالية وإدارة الأقساط اليومية' : 'Financial Solutions & Installment Management'}
            </motion.p>
          </div>

          {/* Bottom Area: Progress Bar & Status */}
          <div className="relative z-10 w-full max-w-md flex flex-col items-center text-center pb-8 space-y-4">
            {/* Loading Bar & Progress */}
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="w-full space-y-2"
            >
              <div className="flex items-center justify-between text-xs text-slate-300 font-bold px-1">
                <span className="truncate">{statusText}</span>
                <span className="text-teal-400 font-mono font-black">{Math.min(100, progress)}%</span>
              </div>
              <div className="h-2 w-full bg-slate-900/90 rounded-full overflow-hidden p-0.5 border border-white/20 shadow-inner backdrop-blur-md">
                <motion.div
                  className="h-full bg-gradient-to-r from-teal-500 via-emerald-400 to-cyan-400 rounded-full shadow-lg"
                  style={{ width: `${Math.min(100, progress)}%` }}
                  transition={{ ease: 'easeOut', duration: 0.15 }}
                />
              </div>
            </motion.div>

            {/* Skip / Tap to Enter Hint */}
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.4 }}
              className="text-[11px] text-slate-400 font-medium tracking-wide animate-pulse"
            >
              {isAr ? 'انقر في أي مكان للمتابعة...' : 'Tap anywhere to continue...'}
            </motion.span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
