import React, { useState, useEffect } from 'react';
import { formatZeroBalanceCountdown, isZeroBalanceExpired24h } from '../lib/dateUtils';

interface ZeroBalanceCountdownProps {
  contract: {
    remainingBalance?: number;
    status?: string;
    startDate?: string;
    createdAt?: string | number;
    completedAt?: string | number;
  };
  isAr?: boolean;
  className?: string;
}

export const ZeroBalanceCountdown: React.FC<ZeroBalanceCountdownProps> = ({
  contract,
  isAr = true,
  className = "block text-[9px] sm:text-[10px] text-amber-600 dark:text-amber-400 font-extrabold mt-0.5 whitespace-normal"
}) => {
  const [text, setText] = useState(() => formatZeroBalanceCountdown(contract, isAr));

  useEffect(() => {
    setText(formatZeroBalanceCountdown(contract, isAr));
    const timer = setInterval(() => {
      setText(formatZeroBalanceCountdown(contract, isAr));
    }, 1000);
    return () => clearInterval(timer);
  }, [contract, isAr]);

  if (!text || isZeroBalanceExpired24h(contract)) return null;

  return (
    <span className={className}>
      {text}
    </span>
  );
};
