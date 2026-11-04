import { describe, it, expect } from 'vitest';

/**
 * 用户引导组件逻辑测试
 * Onboarding 步骤/状态/条件逻辑
 */

type OnboardingStepType = 'tooltip' | 'modal' | 'highlight' | 'video' | 'checklist';

interface OnboardingStep {
  id: string;
  type: OnboardingStepType;
  title: string;
  content: string;
  target?: string; // CSS selector
  order: number;
  required: boolean;
  condition?: () => boolean;
}

interface OnboardingState {
  currentStep: number;
  completedSteps: string[];
  skippedSteps: string[];
  dismissed: boolean;
  startedAt?: number;
  completedAt?: number;
}

function createInitialState(): OnboardingState {
  return {
    currentStep: 0,
    completedSteps: [],
    skippedSteps: [],
    dismissed: false,
  };
}

function getNextStep(
  steps: OnboardingStep[],
  state: OnboardingState
): OnboardingStep | null {
  const incomplete = steps.filter(
    s => !state.completedSteps.includes(s.id) && !state.skippedSteps.includes(s.id)
  );
  if (incomplete.length === 0) return null;

  // Sort by order
  incomplete.sort((a, b) => a.order - b.order);

  // Check conditions
  for (const step of incomplete) {
    if (!step.condition || step.condition()) {
      return step;
    }
  }
  return null;
}

function completeStep(state: OnboardingState, stepId: string): OnboardingState {
  return {
    ...state,
    currentStep: state.currentStep + 1,
    completedSteps: [...state.completedSteps, stepId],
  };
}

function skipStep(state: OnboardingState, stepId: string): { state: OnboardingState; blocked: boolean } {
  const blocked = false; // Could check if required
  return {
    state: {
      ...state,
      currentStep: state.currentStep + 1,
      skippedSteps: [...state.skippedSteps, stepId],
    },
    blocked,
  };
}

function dismissOnboarding(state: OnboardingState): OnboardingState {
  return { ...state, dismissed: true };
}

function isOnboardingComplete(steps: OnboardingStep[], state: OnboardingState): boolean {
  return steps.every(
    s => state.completedSteps.includes(s.id) || state.skippedSteps.includes(s.id)
  );
}

function calcProgress(steps: OnboardingStep[], state: OnboardingState): {
  completed: number;
  total: number;
  percent: number;
} {
  const total = steps.length;
  const completed = steps.filter(
    s => state.completedSteps.includes(s.id)
  ).length;
  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 100,
  };
}

function canDismiss(steps: OnboardingStep[], state: OnboardingState): boolean {
  // Can dismiss if no required steps are incomplete
  const incomplete = steps.filter(
    s => s.required && !state.completedSteps.includes(s.id)
  );
  return incomplete.length === 0;
}

function getStepPosition(step: OnboardingStep, steps: OnboardingStep[]): {
  index: number;
  total: number;
  isFirst: boolean;
  isLast: boolean;
} {
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex(s => s.id === step.id);
  return {
    index: index + 1,
    total: steps.length,
    isFirst: index === 0,
    isLast: index === sorted.length - 1,
  };
}

function filterStepsByCondition(steps: OnboardingStep[]): OnboardingStep[] {
  return steps.filter(s => !s.condition || s.condition());
}

function buildStepSequence(steps: OnboardingStep[]): string[] {
  return [...steps]
    .sort((a, b) => a.order - b.order)
    .map(s => s.id);
}

function shouldShowStep(
  step: OnboardingStep,
  state: OnboardingState
): boolean {
  if (state.dismissed) return false;
  if (state.completedSteps.includes(step.id)) return false;
  if (step.condition && !step.condition()) return false;
  return true;
}

function formatStepIndicator(index: number, total: number): string {
  return `${index}/${total}`;
}

describe('用户引导逻辑', () => {
  const mockSteps: OnboardingStep[] = [
    { id: 's1', type: 'modal', title: '欢迎', content: '欢迎使用', order: 1, required: true },
    { id: 's2', type: 'tooltip', title: '搜索', content: '在这里搜索', target: '#search', order: 2, required: false },
    { id: 's3', type: 'highlight', title: '自选', content: '添加自选股', target: '#watchlist', order: 3, required: true },
  ];

  describe('createInitialState', () => {
    it('should create initial state', () => {
      const state = createInitialState();
      expect(state.currentStep).toBe(0);
      expect(state.completedSteps).toHaveLength(0);
      expect(state.dismissed).toBe(false);
    });
  });

  describe('getNextStep', () => {
    it('should return first incomplete step', () => {
      const state = createInitialState();
      const next = getNextStep(mockSteps, state);
      expect(next?.id).toBe('s1');
    });

    it('should skip completed steps', () => {
      const state = completeStep(createInitialState(), 's1');
      const next = getNextStep(mockSteps, state);
      expect(next?.id).toBe('s2');
    });

    it('should return null when all complete', () => {
      let state = createInitialState();
      state = completeStep(state, 's1');
      state = completeStep(state, 's2');
      state = completeStep(state, 's3');
      expect(getNextStep(mockSteps, state)).toBeNull();
    });

    it('should respect conditions', () => {
      const steps: OnboardingStep[] = [
        { id: 's1', type: 'modal', title: '', content: '', order: 1, required: false, condition: () => false },
        { id: 's2', type: 'modal', title: '', content: '', order: 2, required: false },
      ];
      const next = getNextStep(steps, createInitialState());
      expect(next?.id).toBe('s2');
    });
  });

  describe('completeStep', () => {
    it('should add to completed and increment step', () => {
      const state = completeStep(createInitialState(), 's1');
      expect(state.completedSteps).toContain('s1');
      expect(state.currentStep).toBe(1);
    });
  });

  describe('skipStep', () => {
    it('should add to skipped', () => {
      const { state } = skipStep(createInitialState(), 's2');
      expect(state.skippedSteps).toContain('s2');
    });
  });

  describe('dismissOnboarding', () => {
    it('should set dismissed', () => {
      const state = dismissOnboarding(createInitialState());
      expect(state.dismissed).toBe(true);
    });
  });

  describe('isOnboardingComplete', () => {
    it('should return false when incomplete', () => {
      expect(isOnboardingComplete(mockSteps, createInitialState())).toBe(false);
    });

    it('should return true when all completed', () => {
      let state = createInitialState();
      state = completeStep(state, 's1');
      state = completeStep(state, 's2');
      state = completeStep(state, 's3');
      expect(isOnboardingComplete(mockSteps, state)).toBe(true);
    });

    it('should count skipped as complete', () => {
      let state = createInitialState();
      state = completeStep(state, 's1');
      state = completeStep(state, 's3');
      const { state: s2 } = skipStep(state, 's2');
      expect(isOnboardingComplete(mockSteps, s2)).toBe(true);
    });
  });

  describe('calcProgress', () => {
    it('should calculate percent', () => {
      const state = completeStep(createInitialState(), 's1');
      expect(calcProgress(mockSteps, state)).toEqual({ completed: 1, total: 3, percent: 33 });
    });

    it('should handle empty steps', () => {
      expect(calcProgress([], createInitialState())).toEqual({ completed: 0, total: 0, percent: 100 });
    });
  });

  describe('canDismiss', () => {
    it('should block dismiss with required incomplete', () => {
      expect(canDismiss(mockSteps, createInitialState())).toBe(false);
    });

    it('should allow dismiss when required complete', () => {
      let state = createInitialState();
      state = completeStep(state, 's1');
      state = completeStep(state, 's3');
      expect(canDismiss(mockSteps, state)).toBe(true);
    });
  });

  describe('getStepPosition', () => {
    it('should return position info', () => {
      const pos = getStepPosition(mockSteps[1], mockSteps);
      expect(pos.index).toBe(2);
      expect(pos.total).toBe(3);
      expect(pos.isFirst).toBe(false);
      expect(pos.isLast).toBe(false);
    });

    it('should identify first and last', () => {
      expect(getStepPosition(mockSteps[0], mockSteps).isFirst).toBe(true);
      expect(getStepPosition(mockSteps[2], mockSteps).isLast).toBe(true);
    });
  });

  describe('filterStepsByCondition', () => {
    it('should filter steps with false conditions', () => {
      const steps: OnboardingStep[] = [
        { id: 'a', type: 'modal', title: '', content: '', order: 1, required: false },
        { id: 'b', type: 'modal', title: '', content: '', order: 2, required: false, condition: () => false },
      ];
      expect(filterStepsByCondition(steps)).toHaveLength(1);
    });
  });

  describe('buildStepSequence', () => {
    it('should return ordered ids', () => {
      expect(buildStepSequence(mockSteps)).toEqual(['s1', 's2', 's3']);
    });
  });

  describe('shouldShowStep', () => {
    it('should show when appropriate', () => {
      expect(shouldShowStep(mockSteps[0], createInitialState())).toBe(true);
    });

    it('should hide when dismissed', () => {
      expect(shouldShowStep(mockSteps[0], { ...createInitialState(), dismissed: true })).toBe(false);
    });

    it('should hide when completed', () => {
      const state = completeStep(createInitialState(), 's1');
      expect(shouldShowStep(mockSteps[0], state)).toBe(false);
    });
  });

  describe('formatStepIndicator', () => {
    it('should format indicator', () => {
      expect(formatStepIndicator(1, 5)).toBe('1/5');
      expect(formatStepIndicator(3, 10)).toBe('3/10');
    });
  });
});
