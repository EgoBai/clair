import { describe, it, expect, beforeEach } from 'vitest';

/**
 * 加载编排器测试
 */

interface LoadingTask {
  id: string;
  name: string;
  priority: number;
  status: 'pending' | 'loading' | 'success' | 'error';
  progress: number;
  startTime?: number;
  endTime?: number;
  error?: string;
}

interface LoadingGroup {
  id: string;
  tasks: LoadingTask[];
  status: 'pending' | 'loading' | 'success' | 'error' | 'partial';
  progress: number;
}

class LoadingOrchestrator {
  private tasks: Map<string, LoadingTask> = new Map();
  private groups: Map<string, LoadingGroup> = new Map();

  addTask(id: string, name: string, priority: number = 0): void {
    this.tasks.set(id, { id, name, priority, status: 'pending', progress: 0 });
  }

  startTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = 'loading';
      task.startTime = Date.now();
    }
  }

  updateProgress(id: string, progress: number): void {
    const task = this.tasks.get(id);
    if (task) {
      task.progress = Math.min(100, Math.max(0, progress));
    }
  }

  completeTask(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = 'success';
      task.progress = 100;
      task.endTime = Date.now();
    }
  }

  failTask(id: string, error: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = 'error';
      task.error = error;
      task.endTime = Date.now();
    }
  }

  getTask(id: string): LoadingTask | undefined {
    return this.tasks.get(id);
  }

  createGroup(id: string, taskIds: string[]): void {
    const tasks = taskIds.map(tid => this.tasks.get(tid)).filter(Boolean) as LoadingTask[];
    this.groups.set(id, { id, tasks, status: 'pending', progress: 0 });
  }

  getGroupProgress(id: string): number {
    const group = this.groups.get(id);
    if (!group || group.tasks.length === 0) return 0;
    return group.tasks.reduce((s, t) => s + t.progress, 0) / group.tasks.length;
  }

  getGroupStatus(id: string): LoadingGroup['status'] {
    const group = this.groups.get(id);
    if (!group) return 'pending';
    const statuses = group.tasks.map(t => t.status);
    if (statuses.every(s => s === 'success')) return 'success';
    if (statuses.some(s => s === 'error')) {
      return statuses.some(s => s === 'success') ? 'partial' : 'error';
    }
    if (statuses.some(s => s === 'loading')) return 'loading';
    return 'pending';
  }

  getOverallProgress(): number {
    const allTasks = [...this.tasks.values()];
    if (allTasks.length === 0) return 0;
    return allTasks.reduce((s, t) => s + t.progress, 0) / allTasks.length;
  }

  getActiveTasks(): LoadingTask[] {
    return [...this.tasks.values()].filter(t => t.status === 'loading');
  }

  reset(): void {
    this.tasks.clear();
    this.groups.clear();
  }
}

describe('Loading Orchestrator', () => {
  let orchestrator: LoadingOrchestrator;

  beforeEach(() => {
    orchestrator = new LoadingOrchestrator();
  });

  describe('任务管理', () => {
    it('应该添加任务', () => {
      orchestrator.addTask('t1', '加载股票数据', 1);
      const task = orchestrator.getTask('t1');
      expect(task?.name).toBe('加载股票数据');
      expect(task?.status).toBe('pending');
    });

    it('应该启动任务', () => {
      orchestrator.addTask('t1', 'Task 1');
      orchestrator.startTask('t1');
      expect(orchestrator.getTask('t1')?.status).toBe('loading');
    });

    it('应该更新进度', () => {
      orchestrator.addTask('t1', 'Task 1');
      orchestrator.startTask('t1');
      orchestrator.updateProgress('t1', 50);
      expect(orchestrator.getTask('t1')?.progress).toBe(50);
    });

    it('应该完成任务', () => {
      orchestrator.addTask('t1', 'Task 1');
      orchestrator.startTask('t1');
      orchestrator.completeTask('t1');
      expect(orchestrator.getTask('t1')?.status).toBe('success');
      expect(orchestrator.getTask('t1')?.progress).toBe(100);
    });

    it('应该标记失败', () => {
      orchestrator.addTask('t1', 'Task 1');
      orchestrator.failTask('t1', 'Network error');
      expect(orchestrator.getTask('t1')?.status).toBe('error');
      expect(orchestrator.getTask('t1')?.error).toBe('Network error');
    });
  });

  describe('分组管理', () => {
    beforeEach(() => {
      orchestrator.addTask('t1', 'Task 1');
      orchestrator.addTask('t2', 'Task 2');
      orchestrator.addTask('t3', 'Task 3');
      orchestrator.createGroup('g1', ['t1', 't2', 't3']);
    });

    it('应该计算分组进度', () => {
      orchestrator.startTask('t1');
      orchestrator.updateProgress('t1', 50);
      orchestrator.startTask('t2');
      orchestrator.updateProgress('t2', 100);
      expect(orchestrator.getGroupProgress('g1')).toBeCloseTo(50, 0);
    });

    it('全部完成应该返回success', () => {
      orchestrator.completeTask('t1');
      orchestrator.completeTask('t2');
      orchestrator.completeTask('t3');
      expect(orchestrator.getGroupStatus('g1')).toBe('success');
    });

    it('有失败应该返回error或partial', () => {
      orchestrator.completeTask('t1');
      orchestrator.failTask('t2', 'Error');
      orchestrator.completeTask('t3');
      expect(['error', 'partial']).toContain(orchestrator.getGroupStatus('g1'));
    });

    it('有加载中应该返回loading', () => {
      orchestrator.startTask('t1');
      orchestrator.completeTask('t2');
      expect(orchestrator.getGroupStatus('g1')).toBe('loading');
    });
  });

  describe('全局状态', () => {
    it('应该计算总进度', () => {
      orchestrator.addTask('t1', 'Task 1');
      orchestrator.addTask('t2', 'Task 2');
      orchestrator.startTask('t1');
      orchestrator.updateProgress('t1', 50);
      orchestrator.startTask('t2');
      orchestrator.updateProgress('t2', 100);
      expect(orchestrator.getOverallProgress()).toBe(75);
    });

    it('应该获取活跃任务', () => {
      orchestrator.addTask('t1', 'Task 1');
      orchestrator.addTask('t2', 'Task 2');
      orchestrator.startTask('t1');
      expect(orchestrator.getActiveTasks().length).toBe(1);
    });

    it('应该重置', () => {
      orchestrator.addTask('t1', 'Task 1');
      orchestrator.reset();
      expect(orchestrator.getTask('t1')).toBeUndefined();
    });
  });
});
