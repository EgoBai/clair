/**
 * MicroFeedback 微反馈组件
 * 提供成功/错误/加载等即时视觉反馈
 */
import React, { useState, useEffect, useRef } from 'react';

// 成功勾选动画
export const SuccessCheck: React.FC<{ size?: number; color?: string }> = ({
  size = 24,
  color = '#10b981',
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" opacity="0.2">
      <animate attributeName="r" from="5" to="10" dur="0.3s" fill="freeze" />
      <animate attributeName="opacity" from="0" to="0.2" dur="0.3s" fill="freeze" />
    </circle>
    <path
      d="M8 12l3 3 5-5"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray="12"
      strokeDashoffset="12"
    >
      <animate attributeName="stroke-dashoffset" from="12" to="0" dur="0.3s" begin="0.15s" fill="freeze" />
    </path>
  </svg>
);

// 错误抖动
export const ErrorShake: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [shaking, setShaking] = useState(false);
  const trigger = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 400);
  };

  return (
    <div
      style={{
        animation: shaking ? 'shake 0.4s ease-in-out' : undefined,
      }}
      onAnimationEnd={() => setShaking(false)}
    >
      {children}
      {React.cloneElement(children as React.ReactElement<any>, {
        'data-shake-trigger': trigger,
      })}
    </div>
  );
};

// 加载省略号
export const LoadingDots: React.FC<{ color?: string }> = ({ color = '#666' }) => (
  <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: color,
          animation: `pulse 1.2s ease-in-out ${i * 0.15}s infinite`,
        }}
      />
    ))}
  </span>
);

// 数字翻转
export const NumberFlip: React.FC<{
  value: number;
  formatter?: (v: number) => string;
  duration?: number;
  colorize?: boolean;
}> = ({ value, formatter = String, duration = 600, colorize = false }) => {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev === value) return;

    const start = performance.now();
    const diff = value - prev;

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(prev + diff * eased);
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
    prevRef.current = value;
  }, [value, duration]);

  const color = colorize
    ? value > prevRef.current ? '#ef4444' : value < prevRef.current ? '#22c55e' : undefined
    : undefined;

  return <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>{formatter(display)}</span>;
};

// 微交互按钮包装器
export const MicroFeedback: React.FC<{
  children: React.ReactNode;
  type?: 'tap' | 'hover' | 'none';
  className?: string;
}> = ({ children, type = 'tap', className = '' }) => {
  const [pressed, setPressed] = useState(false);

  if (type === 'none') return <>{children}</>;

  return (
    <div
      className={className}
      onMouseDown={() => type === 'tap' && setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        transition: 'transform 100ms ease',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {children}
    </div>
  );
};

export default React.memo(MicroFeedback);
