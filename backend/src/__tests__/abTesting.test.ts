import { describe, it, expect, beforeEach } from 'vitest';

// A/B Testing Engine
interface Experiment {
  id: string;
  name: string;
  description: string;
  variants: Variant[];
  trafficAllocation: number;
  status: 'draft' | 'running' | 'paused' | 'completed';
  startDate?: Date;
  endDate?: Date;
  targetAudience: AudienceFilter[];
  metrics: string[];
  minSampleSize: number;
  confidenceLevel: number;
}

interface Variant {
  id: string;
  name: string;
  weight: number;
  config: Record<string, unknown>;
  isControl: boolean;
}

interface AudienceFilter {
  field: string;
  operator: 'eq' | 'neq' | 'in' | 'not_in' | 'gt' | 'lt';
  value: unknown;
}

interface Assignment {
  experimentId: string;
  variantId: string;
  userId: string;
  timestamp: Date;
}

interface Conversion {
  experimentId: string;
  variantId: string;
  userId: string;
  metric: string;
  value: number;
  timestamp: Date;
}

interface ExperimentResult {
  experimentId: string;
  variants: {
    variantId: string;
    name: string;
    participants: number;
    conversions: number;
    conversionRate: number;
    avgValue: number;
    confidenceInterval: [number, number];
    isStatisticallySignificant: boolean;
    lift: number;
  }[];
  winner?: string;
  pValue: number;
  totalParticipants: number;
}

class ABTestingEngine {
  private experiments: Map<string, Experiment> = new Map();
  private assignments: Assignment[] = [];
  private conversions: Conversion[] = [];
  private salt = 'ab_test_salt';

  createExperiment(config: Omit<Experiment, 'id'>): Experiment {
    const id = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const exp: Experiment = { ...config, id };
    this.experiments.set(id, exp);
    return exp;
  }

  startExperiment(id: string): boolean {
    const exp = this.experiments.get(id);
    if (!exp || exp.status !== 'draft') return false;
    exp.status = 'running';
    exp.startDate = new Date();
    return true;
  }

  pauseExperiment(id: string): boolean {
    const exp = this.experiments.get(id);
    if (!exp || exp.status !== 'running') return false;
    exp.status = 'paused';
    return true;
  }

  completeExperiment(id: string): boolean {
    const exp = this.experiments.get(id);
    if (!exp || exp.status === 'completed') return false;
    exp.status = 'completed';
    exp.endDate = new Date();
    return true;
  }

  private hashUser(userId: string, experimentId: string): number {
    const str = `${userId}:${experimentId}:${this.salt}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  private matchesAudience(user: Record<string, unknown>, filters: AudienceFilter[]): boolean {
    return filters.every(f => {
      const value = user[f.field];
      switch (f.operator) {
        case 'eq': return value === f.value;
        case 'neq': return value !== f.value;
        case 'in': return (f.value as unknown[]).includes(value);
        case 'not_in': return !(f.value as unknown[]).includes(value);
        case 'gt': return (value as number) > (f.value as number);
        case 'lt': return (value as number) < (f.value as number);
        default: return true;
      }
    });
  }

  assign(experimentId: string, userId: string, user?: Record<string, unknown>): string | null {
    const exp = this.experiments.get(experimentId);
    if (!exp || exp.status !== 'running') return null;

    // Check audience
    if (user && exp.targetAudience.length > 0) {
      if (!this.matchesAudience(user, exp.targetAudience)) return null;
    }

    // Check traffic allocation
    const hash = this.hashUser(userId, experimentId);
    if ((hash % 100) >= exp.trafficAllocation) return null;

    // Check existing assignment
    const existing = this.assignments.find(a => a.experimentId === experimentId && a.userId === userId);
    if (existing) return existing.variantId;

    // Assign variant based on weights
    const bucket = hash % 100;
    let cumulative = 0;
    for (const variant of exp.variants) {
      cumulative += variant.weight;
      if (bucket < cumulative) {
        this.assignments.push({
          experimentId,
          variantId: variant.id,
          userId,
          timestamp: new Date(),
        });
        return variant.id;
      }
    }

    // Fallback to control
    const control = exp.variants.find(v => v.isControl);
    if (control) {
      this.assignments.push({
        experimentId,
        variantId: control.id,
        userId,
        timestamp: new Date(),
      });
      return control.id;
    }
    return null;
  }

  trackConversion(experimentId: string, variantId: string, userId: string, metric: string, value = 1): void {
    this.conversions.push({
      experimentId, variantId, userId, metric, value,
      timestamp: new Date(),
    });
  }

  getResults(experimentId: string): ExperimentResult | null {
    const exp = this.experiments.get(experimentId);
    if (!exp) return null;

    const expAssignments = this.assignments.filter(a => a.experimentId === experimentId);
    const expConversions = this.conversions.filter(c => c.experimentId === experimentId);

    const controlVariant = exp.variants.find(v => v.isControl);
    const controlRate = controlVariant
      ? this.getConversionRate(expAssignments, expConversions, controlVariant.id)
      : 0;

    const variants = exp.variants.map(variant => {
      const participants = expAssignments.filter(a => a.variantId === variant.id).length;
      const variantConversions = expConversions.filter(c => c.variantId === variant.id);
      const conversions = variantConversions.length;
      const conversionRate = participants > 0 ? conversions / participants : 0;
      const avgValue = variantConversions.length > 0
        ? variantConversions.reduce((s, c) => s + c.value, 0) / variantConversions.length
        : 0;
      const lift = controlRate > 0 ? ((conversionRate - controlRate) / controlRate) * 100 : 0;

      // Simplified confidence interval
      const se = Math.sqrt((conversionRate * (1 - conversionRate)) / Math.max(participants, 1));
      const margin = 1.96 * se;

      return {
        variantId: variant.id,
        name: variant.name,
        participants,
        conversions,
        conversionRate,
        avgValue,
        confidenceInterval: [Math.max(0, conversionRate - margin), Math.min(1, conversionRate + margin)] as [number, number],
        isStatisticallySignificant: participants >= exp.minSampleSize && Math.abs(lift) > 5,
        lift,
      };
    });

    // Find winner
    const significantVariants = variants.filter(v => v.isStatisticallySignificant && v.lift > 0);
    const winner = significantVariants.sort((a, b) => b.conversionRate - a.conversionRate)[0];

    return {
      experimentId,
      variants,
      winner: winner?.variantId,
      pValue: 0.05, // Simplified
      totalParticipants: expAssignments.length,
    };
  }

  private getConversionRate(assignments: Assignment[], conversions: Conversion[], variantId: string): number {
    const participants = assignments.filter(a => a.variantId === variantId).length;
    const convCount = conversions.filter(c => c.variantId === variantId).length;
    return participants > 0 ? convCount / participants : 0;
  }

  getAssignment(experimentId: string, userId: string): Assignment | undefined {
    return this.assignments.find(a => a.experimentId === experimentId && a.userId === userId);
  }

  getExperiment(id: string): Experiment | undefined {
    return this.experiments.get(id);
  }

  getAllExperiments(): Experiment[] {
    return Array.from(this.experiments.values());
  }

  getParticipantCount(experimentId: string): number {
    return this.assignments.filter(a => a.experimentId === experimentId).length;
  }
}

describe('A/B Testing Engine', () => {
  let engine: ABTestingEngine;

  beforeEach(() => {
    engine = new ABTestingEngine();
  });

  it('should create experiment', () => {
    const exp = engine.createExperiment({
      name: 'Button Color Test',
      description: 'Test button colors',
      variants: [
        { id: 'v1', name: 'Blue', weight: 50, config: { color: 'blue' }, isControl: true },
        { id: 'v2', name: 'Green', weight: 50, config: { color: 'green' }, isControl: false },
      ],
      trafficAllocation: 100,
      status: 'draft',
      targetAudience: [],
      metrics: ['click'],
      minSampleSize: 100,
      confidenceLevel: 0.95,
    });
    expect(exp.name).toBe('Button Color Test');
    expect(exp.variants).toHaveLength(2);
  });

  it('should start experiment', () => {
    const exp = engine.createExperiment({
      name: 'Test', description: '',
      variants: [{ id: 'v1', name: 'A', weight: 100, config: {}, isControl: true }],
      trafficAllocation: 100, status: 'draft',
      targetAudience: [], metrics: [], minSampleSize: 0, confidenceLevel: 0.95,
    });
    expect(engine.startExperiment(exp.id)).toBe(true);
    expect(engine.getExperiment(exp.id)!.status).toBe('running');
  });

  it('should not start non-draft experiment', () => {
    const exp = engine.createExperiment({
      name: 'Test', description: '',
      variants: [{ id: 'v1', name: 'A', weight: 100, config: {}, isControl: true }],
      trafficAllocation: 100, status: 'running',
      targetAudience: [], metrics: [], minSampleSize: 0, confidenceLevel: 0.95,
    });
    expect(engine.startExperiment(exp.id)).toBe(false);
  });

  it('should assign variant', () => {
    const exp = engine.createExperiment({
      name: 'Test', description: '',
      variants: [
        { id: 'v1', name: 'A', weight: 50, config: {}, isControl: true },
        { id: 'v2', name: 'B', weight: 50, config: {}, isControl: false },
      ],
      trafficAllocation: 100, status: 'draft',
      targetAudience: [], metrics: [], minSampleSize: 0, confidenceLevel: 0.95,
    });
    engine.startExperiment(exp.id);
    const variant = engine.assign(exp.id, 'user1');
    expect(variant).not.toBeNull();
    expect(['v1', 'v2']).toContain(variant);
  });

  it('should return same variant for same user', () => {
    const exp = engine.createExperiment({
      name: 'Test', description: '',
      variants: [
        { id: 'v1', name: 'A', weight: 50, config: {}, isControl: true },
        { id: 'v2', name: 'B', weight: 50, config: {}, isControl: false },
      ],
      trafficAllocation: 100, status: 'draft',
      targetAudience: [], metrics: [], minSampleSize: 0, confidenceLevel: 0.95,
    });
    engine.startExperiment(exp.id);
    const v1 = engine.assign(exp.id, 'user1');
    const v2 = engine.assign(exp.id, 'user1');
    expect(v1).toBe(v2);
  });

  it('should track conversion', () => {
    const exp = engine.createExperiment({
      name: 'Test', description: '',
      variants: [{ id: 'v1', name: 'A', weight: 100, config: {}, isControl: true }],
      trafficAllocation: 100, status: 'draft',
      targetAudience: [], metrics: ['click'], minSampleSize: 0, confidenceLevel: 0.95,
    });
    engine.startExperiment(exp.id);
    engine.assign(exp.id, 'user1');
    engine.trackConversion(exp.id, 'v1', 'user1', 'click', 1);
    const results = engine.getResults(exp.id);
    expect(results).not.toBeNull();
    expect(results!.totalParticipants).toBe(1);
  });

  it('should calculate conversion rate', () => {
    const exp = engine.createExperiment({
      name: 'Test', description: '',
      variants: [{ id: 'v1', name: 'A', weight: 100, config: {}, isControl: true }],
      trafficAllocation: 100, status: 'draft',
      targetAudience: [], metrics: ['click'], minSampleSize: 0, confidenceLevel: 0.95,
    });
    engine.startExperiment(exp.id);
    for (let i = 0; i < 10; i++) {
      engine.assign(exp.id, `user${i}`);
      if (i < 5) engine.trackConversion(exp.id, 'v1', `user${i}`, 'click');
    }
    const results = engine.getResults(exp.id);
    expect(results!.variants[0].conversionRate).toBeCloseTo(0.5, 1);
  });

  it('should filter by audience', () => {
    const exp = engine.createExperiment({
      name: 'Test', description: '',
      variants: [{ id: 'v1', name: 'A', weight: 100, config: {}, isControl: true }],
      trafficAllocation: 100, status: 'draft',
      targetAudience: [{ field: 'country', operator: 'eq', value: 'CN' }],
      metrics: [], minSampleSize: 0, confidenceLevel: 0.95,
    });
    engine.startExperiment(exp.id);
    const cn = engine.assign(exp.id, 'user1', { country: 'CN' });
    const us = engine.assign(exp.id, 'user2', { country: 'US' });
    expect(cn).not.toBeNull();
    expect(us).toBeNull();
  });

  it('should pause experiment', () => {
    const exp = engine.createExperiment({
      name: 'Test', description: '',
      variants: [{ id: 'v1', name: 'A', weight: 100, config: {}, isControl: true }],
      trafficAllocation: 100, status: 'draft',
      targetAudience: [], metrics: [], minSampleSize: 0, confidenceLevel: 0.95,
    });
    engine.startExperiment(exp.id);
    engine.pauseExperiment(exp.id);
    expect(engine.getExperiment(exp.id)!.status).toBe('paused');
  });

  it('should complete experiment', () => {
    const exp = engine.createExperiment({
      name: 'Test', description: '',
      variants: [{ id: 'v1', name: 'A', weight: 100, config: {}, isControl: true }],
      trafficAllocation: 100, status: 'draft',
      targetAudience: [], metrics: [], minSampleSize: 0, confidenceLevel: 0.95,
    });
    engine.startExperiment(exp.id);
    engine.completeExperiment(exp.id);
    const e = engine.getExperiment(exp.id)!;
    expect(e.status).toBe('completed');
    expect(e.endDate).toBeInstanceOf(Date);
  });

  it('should respect traffic allocation', () => {
    const exp = engine.createExperiment({
      name: 'Test', description: '',
      variants: [{ id: 'v1', name: 'A', weight: 100, config: {}, isControl: true }],
      trafficAllocation: 10, status: 'draft',
      targetAudience: [], metrics: [], minSampleSize: 0, confidenceLevel: 0.95,
    });
    engine.startExperiment(exp.id);
    let assigned = 0;
    for (let i = 0; i < 100; i++) {
      if (engine.assign(exp.id, `user${i}`)) assigned++;
    }
    expect(assigned).toBeLessThan(50); // Roughly 10%
  });

  it('should get all experiments', () => {
    engine.createExperiment({
      name: 'E1', description: '',
      variants: [{ id: 'v1', name: 'A', weight: 100, config: {}, isControl: true }],
      trafficAllocation: 100, status: 'draft',
      targetAudience: [], metrics: [], minSampleSize: 0, confidenceLevel: 0.95,
    });
    engine.createExperiment({
      name: 'E2', description: '',
      variants: [{ id: 'v1', name: 'A', weight: 100, config: {}, isControl: true }],
      trafficAllocation: 100, status: 'draft',
      targetAudience: [], metrics: [], minSampleSize: 0, confidenceLevel: 0.95,
    });
    expect(engine.getAllExperiments()).toHaveLength(2);
  });

  it('should count participants', () => {
    const exp = engine.createExperiment({
      name: 'Test', description: '',
      variants: [{ id: 'v1', name: 'A', weight: 100, config: {}, isControl: true }],
      trafficAllocation: 100, status: 'draft',
      targetAudience: [], metrics: [], minSampleSize: 0, confidenceLevel: 0.95,
    });
    engine.startExperiment(exp.id);
    engine.assign(exp.id, 'u1');
    engine.assign(exp.id, 'u2');
    expect(engine.getParticipantCount(exp.id)).toBe(2);
  });

  it('should not assign to non-running experiment', () => {
    const exp = engine.createExperiment({
      name: 'Test', description: '',
      variants: [{ id: 'v1', name: 'A', weight: 100, config: {}, isControl: true }],
      trafficAllocation: 100, status: 'draft',
      targetAudience: [], metrics: [], minSampleSize: 0, confidenceLevel: 0.95,
    });
    expect(engine.assign(exp.id, 'user1')).toBeNull();
  });
});
