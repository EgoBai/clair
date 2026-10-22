/**
 * 通知系统 API 路由
 */

import { Router, Request, Response } from 'express';
import { notificationService } from '../services/notification/service';
import { NotificationType, NotificationChannel, NotificationPriority } from '../services/notification/types';
import { templateManager } from '../services/notification/templates';

const router = Router();

/**
 * 诚实数据契约发送器（本文件统一出口）：顶层 dataSource 与 data 内同源。
 *
 * 关键：**保持 `data` 的原有形状**（对象仍是对象、数组仍是数组），
 * 只在顶层补 dataSource、在对象型载荷内部补同名行级字段 —— 不破坏既有前端契约。
 */
function sendHonest(
  res: Response,
  dataSource: 'real' | 'unavailable',
  data: unknown,
  statusCode = 200,
  extra?: Record<string, unknown>,
): void {
  const payload =
    data && typeof data === 'object' && !Array.isArray(data)
      ? { ...(data as Record<string, unknown>), dataSource }
      : data;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(statusCode).json({
    success: true,
    dataSource,
    data: payload,
    timestamp: new Date().toISOString(),
    ...(extra ?? {}),
  });
}

/**
 * 失败响应统一出口：**保留原 HTTP 语义**（400/401/404/409/500 不变），
 * 只补顶层 dataSource，避免调用方在失败路径上无从判定诚实级别。
 */
function sendUnavailable(
  res: Response,
  statusCode: number,
  error: string,
  message?: string,
): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(statusCode).json({
    success: false,
    dataSource: 'unavailable',
    error,
    ...(message !== undefined ? { message } : {}),
    timestamp: new Date().toISOString(),
  });
}

/** 通知记录存于服务进程内存（未落库）——成功响应统一附带的性质说明 */
const STORAGE_NOTE = '通知记录存于服务进程内存（未落库），服务重启即丢失；返回的是当前进程内的真实通知数据';

// 获取用户通知列表
router.get('/user/:userId', (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { limit, offset, unreadOnly, type, priority, sortBy } = req.query;

    const notifications = notificationService.getUserNotifications(userId, {
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
      unreadOnly: unreadOnly === 'true',
      type: type as NotificationType,
      priority: priority as NotificationPriority,
      sortBy: sortBy as 'createdAt' | 'priority',
    });

    sendHonest(res, 'real', notifications, 200, {
      total: notifications.length,
      storageNote: STORAGE_NOTE,
    });
  } catch (error) {
    sendUnavailable(res, 500, '获取通知列表失败', (error as Error).message);
  }
});

// 获取单个通知详情
router.get('/:notificationId', (req: Request, res: Response) => {
  try {
    const notification = notificationService.getNotification(req.params.notificationId);
    if (!notification) {
      return sendUnavailable(res, 404, '通知不存在');
    }
    sendHonest(res, 'real', notification);
  } catch (error) {
    sendUnavailable(res, 500, '获取通知失败', (error as Error).message);
  }
});

// 创建通知
router.post('/', (req: Request, res: Response) => {
  try {
    const { userId, type, title, body, priority, channels, data, expiresInSeconds, icon, actionUrl } = req.body;

    if (!userId || !type || !title || !body) {
      return sendUnavailable(res, 400, '缺少必填字段: userId, type, title, body');
    }

    const notification = notificationService.createNotification(userId, type, title, body, {
      priority,
      channels,
      data,
      expiresInSeconds,
      icon,
      actionUrl,
    });

    if (!notification) {
      return sendUnavailable(res, 400, '通知创建失败（可能被限频或用户关闭通知）');
    }

    sendHonest(res, 'real', notification, 201);
  } catch (error) {
    sendUnavailable(res, 500, '创建通知失败', (error as Error).message);
  }
});

// 标记单条已读
router.patch('/:notificationId/read', (req: Request, res: Response) => {
  try {
    const success = notificationService.markAsRead(req.params.notificationId);
    if (!success) {
      return sendUnavailable(res, 404, '通知不存在');
    }
    sendHonest(res, 'real', { message: '已标记为已读' }, 200, { message: '已标记为已读' });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '标记已读失败',
      message: (error as Error).message,
    });
  }
});

// 批量标记已读
router.patch('/user/:userId/read-all', (req: Request, res: Response) => {
  try {
    const count = notificationService.markAllAsRead(req.params.userId);
    sendHonest(res, 'real', { message: `已标记 ${count} 条通知为已读` }, 200, {
      message: `已标记 ${count} 条通知为已读`,
    });
  } catch (error) {
    sendUnavailable(res, 500, '批量标记已读失败', (error as Error).message);
  }
});

// 删除通知
router.delete('/:notificationId', (req: Request, res: Response) => {
  try {
    const success = notificationService.deleteNotification(req.params.notificationId);
    if (!success) {
      return sendUnavailable(res, 404, '通知不存在');
    }
    sendHonest(res, 'real', { message: '通知已删除' }, 200, { message: '通知已删除' });
  } catch (error) {
    sendUnavailable(res, 500, '删除通知失败', (error as Error).message);
  }
});

// 清空用户通知
router.delete('/user/:userId/clear', (req: Request, res: Response) => {
  try {
    const count = notificationService.clearUserNotifications(req.params.userId);
    sendHonest(res, 'real', { message: `已清空 ${count} 条通知` }, 200, {
      message: `已清空 ${count} 条通知`,
    });
  } catch (error) {
    sendUnavailable(res, 500, '清空通知失败', (error as Error).message);
  }
});

// 获取通知统计
router.get('/user/:userId/stats', (req: Request, res: Response) => {
  try {
    const stats = notificationService.getStats(req.params.userId);
    sendHonest(res, 'real', stats as unknown as Record<string, unknown>);
  } catch (error) {
    sendUnavailable(res, 500, '获取统计失败', (error as Error).message);
  }
});

// 获取未读数量
router.get('/user/:userId/unread-count', (req: Request, res: Response) => {
  try {
    const count = notificationService.getUnreadCount(req.params.userId);
    sendHonest(res, 'real', { count });
  } catch (error) {
    sendUnavailable(res, 500, '获取未读数失败', (error as Error).message);
  }
});

// 获取用户偏好
router.get('/user/:userId/preferences', (req: Request, res: Response) => {
  try {
    const prefs = notificationService.getUserPreferences(req.params.userId);
    sendHonest(res, 'real', prefs as unknown as Record<string, unknown>);
  } catch (error) {
    sendUnavailable(res, 500, '获取偏好设置失败', (error as Error).message);
  }
});

// 更新用户偏好
router.put('/user/:userId/preferences', (req: Request, res: Response) => {
  try {
    notificationService.setUserPreferences({
      ...req.body,
      userId: req.params.userId,
      updatedAt: Date.now(),
    });
    const prefs = notificationService.getUserPreferences(req.params.userId);
    sendHonest(res, 'real', prefs as unknown as Record<string, unknown>);
  } catch (error) {
    sendUnavailable(res, 500, '更新偏好设置失败', (error as Error).message);
  }
});

// 获取通知模板列表
router.get('/templates/list', (_req: Request, res: Response) => {
  try {
    const templates = templateManager.getAllTemplates();
    // 静态模板目录：代码内置的模板定义，**不是**实时数据源 → 诚实标 unavailable
    sendHonest(res, 'unavailable', templates, 200, {
      message: '通知模板目录为代码内置的静态定义（templateManager），不是实时数据源',
    });
  } catch (error) {
    sendUnavailable(res, 500, '获取模板列表失败', (error as Error).message);
  }
});

// 批量创建通知
router.post('/batch', (req: Request, res: Response) => {
  try {
    const { userIds, type, title, body, channels, priority, data } = req.body;

    if (!userIds || !Array.isArray(userIds) || !type || !title || !body) {
      return sendUnavailable(res, 400, '缺少必填字段: userIds[], type, title, body');
    }

    const notifications = notificationService.batchCreate({
      userIds,
      type,
      title,
      body,
      channels,
      priority,
      data,
    });

    sendHonest(res, 'real', notifications, 201, {
      total: notifications.length,
      storageNote: STORAGE_NOTE,
    });
  } catch (error) {
    sendUnavailable(res, 500, '批量创建通知失败', (error as Error).message);
  }
});

export default router;
