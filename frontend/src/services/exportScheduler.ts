/**
 * 定时导出服务
 * 支持定时生成报表、邮件发送、文件存储
 */

import type { ExportFormat, ExportResult, ReportTemplate } from '../utils/bloombergExportEngine';
import logger from '../utils/logger';

async function lazyGenerateReport(
  data: Record<string, unknown>[],
  template: ReportTemplate,
  format: ExportFormat,
): Promise<{ export: ExportResult; summary: import('../utils/bloombergExportEngine').ReportSummary }> {
  const { generateReport } = await import('../utils/bloombergExportEngine');
  return generateReport(data, template, format);
}

// ==================== 类型定义 ====================

export interface ScheduledTask {
  id: string;
  name: string;
  templateId: string;
  format: ExportFormat;
  schedule: 'daily' | 'weekly' | 'monthly' | 'custom';
  cronExpression?: string;
  timezone?: string;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  recipients?: string[];
  webhookUrl?: string;
  storagePath?: string;
  retentionDays?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskExecution {
  taskId: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'success' | 'failed';
  result?: ExportResult;
  error?: string;
  rowCount?: number;
  fileSize?: number;
}

// ==================== 调度器 ====================

export class ExportScheduler {
  private tasks: Map<string, ScheduledTask> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private executions: TaskExecution[] = [];
  private maxHistorySize = 100;

  /**
   * 添加定时任务
   */
  addTask(task: ScheduledTask): void {
    this.tasks.set(task.id, task);
    if (task.enabled) {
      this.scheduleTask(task);
    }
  }

  /**
   * 移除定时任务
   */
  removeTask(taskId: string): void {
    this.cancelTask(taskId);
    this.tasks.delete(taskId);
  }

  /**
   * 更新定时任务
   */
  updateTask(task: ScheduledTask): void {
    this.cancelTask(task.id);
    this.tasks.set(task.id, task);
    if (task.enabled) {
      this.scheduleTask(task);
    }
  }

  /**
   * 启用/禁用任务
   */
  toggleTask(taskId: string, enabled: boolean): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.enabled = enabled;
      if (enabled) {
        this.scheduleTask(task);
      } else {
        this.cancelTask(taskId);
      }
    }
  }

  /**
   * 获取所有任务
   */
  getTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 获取任务执行历史
   */
  getExecutions(taskId?: string): TaskExecution[] {
    if (taskId) {
      return this.executions.filter(e => e.taskId === taskId);
    }
    return [...this.executions];
  }

  /**
   * 手动执行任务
   */
  async executeTask(
    taskId: string,
    data: Record<string, unknown>[],
    template: ReportTemplate,
  ): Promise<TaskExecution> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const execution: TaskExecution = {
      taskId,
      startTime: new Date(),
      status: 'running',
    };

    this.executions.push(execution);

    try {
      const report = await lazyGenerateReport(data, template, task.format);
      
      execution.endTime = new Date();
      execution.status = 'success';
      execution.result = report.export;
      execution.rowCount = report.export.rowCount;
      execution.fileSize = report.export.size;

      // 更新任务最后运行时间
      task.lastRun = new Date();
      task.nextRun = this.calculateNextRun(task);

      // 发送通知
      if (task.recipients && task.recipients.length > 0) {
        await this.sendNotification(task, execution);
      }

      // Webhook通知
      if (task.webhookUrl) {
        await this.sendWebhook(task, execution);
      }

    } catch (error) {
      execution.endTime = new Date();
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // 清理历史
    this.cleanHistory();

    return execution;
  }

  /**
   * 调度任务
   */
  private scheduleTask(task: ScheduledTask): void {
    const delay = this.calculateDelay(task);
    
    if (delay > 0) {
      const timer = setTimeout(async () => {
        // 任务执行逻辑由外部提供
        // removed: console.log
        
        // 重新调度
        this.scheduleTask(task);
      }, delay);
      
      this.timers.set(task.id, timer);
      task.nextRun = new Date(Date.now() + delay);
    }
  }

  /**
   * 取消任务
   */
  private cancelTask(taskId: string): void {
    const timer = this.timers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(taskId);
    }
  }

  /**
   * 计算延迟时间
   */
  private calculateDelay(task: ScheduledTask): number {
    const now = new Date();
    let nextRun: Date;

    switch (task.schedule) {
      case 'daily':
        nextRun = this.getNextDailyRun(task.cronExpression || '09:00');
        break;
      case 'weekly':
        nextRun = this.getNextWeeklyRun(task.cronExpression || '1:09:00'); // 周一9点
        break;
      case 'monthly':
        nextRun = this.getNextMonthlyRun(task.cronExpression || '1:09:00'); // 1号9点
        break;
      case 'custom':
        nextRun = this.parseCronExpression(task.cronExpression || '0 9 * * *');
        break;
      default:
        nextRun = this.getNextDailyRun('09:00');
    }

    return nextRun.getTime() - now.getTime();
  }

  /**
   * 计算下次运行时间
   */
  private calculateNextRun(task: ScheduledTask): Date {
    const now = new Date();
    const delay = this.calculateDelay(task);
    return new Date(now.getTime() + delay);
  }

  /**
   * 获取下次每日运行时间
   */
  private getNextDailyRun(time: string): Date {
    const [hours, minutes] = time.split(':').map(Number);
    const next = new Date();
    next.setHours(hours, minutes, 0, 0);
    
    if (next <= new Date()) {
      next.setDate(next.getDate() + 1);
    }
    
    return next;
  }

  /**
   * 获取下次每周运行时间
   */
  private getNextWeeklyRun(config: string): Date {
    const [dayOfWeek, time] = config.split(':');
    const [hours, minutes] = time.split(':').map(Number);
    
    const next = new Date();
    const currentDay = next.getDay();
    const targetDay = parseInt(dayOfWeek, 10);
    
    let daysUntilTarget = targetDay - currentDay;
    if (daysUntilTarget <= 0) {
      daysUntilTarget += 7;
    }
    
    next.setDate(next.getDate() + daysUntilTarget);
    next.setHours(hours, minutes, 0, 0);
    
    return next;
  }

  /**
   * 获取下次每月运行时间
   */
  private getNextMonthlyRun(config: string): Date {
    const [dayOfMonth, time] = config.split(':');
    const [hours, minutes] = time.split(':').map(Number);
    
    const next = new Date();
    const targetDay = parseInt(dayOfMonth, 10);
    
    next.setDate(targetDay);
    next.setHours(hours, minutes, 0, 0);
    
    if (next <= new Date()) {
      next.setMonth(next.getMonth() + 1);
    }
    
    return next;
  }

  /**
   * 解析Cron表达式（简化版）
   */
  private parseCronExpression(cron: string): Date {
    // 简化的cron解析，支持格式: "分 时 日 月 周"
    const parts = cron.split(' ');
    if (parts.length !== 5) {
      return this.getNextDailyRun('09:00');
    }

    const [minute, hour, _dayOfMonth, _month, _dayOfWeek] = parts;
    const next = new Date();
    
    // 简单实现：只处理具体数值
    if (minute !== '*') next.setMinutes(parseInt(minute, 10));
    if (hour !== '*') next.setHours(parseInt(hour, 10));
    
    if (next <= new Date()) {
      next.setDate(next.getDate() + 1);
    }
    
    return next;
  }

  /**
   * 发送通知
   */
  private async sendNotification(_task: ScheduledTask, _execution: TaskExecution): Promise<void> {
    // 实际实现需要集成邮件服务
    // removed: console.log
    // removed: console.log
  }

  /**
   * 发送Webhook
   */
  private async sendWebhook(task: ScheduledTask, execution: TaskExecution): Promise<void> {
    if (!task.webhookUrl) return;

    try {
      await fetch(task.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          taskName: task.name,
          status: execution.status,
          rowCount: execution.rowCount,
          fileSize: execution.fileSize,
          startTime: execution.startTime,
          endTime: execution.endTime,
        }),
      });
    } catch (error) {
      logger.error('[Webhook] Failed to send:', error);
    }
  }

  /**
   * 清理历史记录
   */
  private cleanHistory(): void {
    if (this.executions.length > this.maxHistorySize) {
      this.executions = this.executions.slice(-this.maxHistorySize);
    }
  }

  /**
   * 销毁调度器
   */
  destroy(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.tasks.clear();
  }
}

// ==================== 单例实例 ====================

let schedulerInstance: ExportScheduler | null = null;

export function getExportScheduler(): ExportScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new ExportScheduler();
  }
  return schedulerInstance;
}

export function destroyExportScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.destroy();
    schedulerInstance = null;
  }
}
