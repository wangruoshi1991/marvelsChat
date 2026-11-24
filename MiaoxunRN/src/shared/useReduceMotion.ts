import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Reads the system "reduce motion" preference and keeps it current.
 *
 * The prototype honours the preference site-wide
 * (`@media (prefers-reduced-motion: reduce) { * { transition-duration: .001ms } }`),
 * so every animated surface needs the same answer. Missing or pending values
 * are treated as reduced motion by default.
 */
export function useReduceMotion() {
  return useSystemReduceMotion() ?? true;
}

export function useSystemReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    let receivedChange = false;
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      value => {
        receivedChange = true;
        setReduceMotion(value);
      },
    );
    const applyInitial = (value: boolean) => {
      if (mounted && !receivedChange) setReduceMotion(value);
    };
    AccessibilityInfo.isReduceMotionEnabled().then(applyInitial, () =>
      applyInitial(true),
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduceMotion;
}

/**
 * CSS `ease-out`, as used by the prototype's `voice-pulse`.
 * React Native's `Easing.out(Easing.cubic)` is a different curve.
 */
export const easeOutCss = [0, 0, 0.58, 1] as const;

/** The prototype's shared entrance curve, `cubic-bezier(.2, .8, .2, 1)`. */
export const entranceCurve = [0.2, 0.8, 0.2, 1] as const;

/** The radial options' overshooting curve, `cubic-bezier(.18,.88,.28,1.18)`. */
export const radialCurve = [0.18, 0.88, 0.28, 1.18] as const;
