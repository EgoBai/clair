/**
 * 通知系统 API 路由
 */

import { Router, Request, Response } from 'express';
import { notificationService } from '../services/notification/service';
import { NotificationType, NotificationChannel, NotificationPriority } from '../services/notification/types';
import { templateManager } from '../services/notification/templates';

const router = Router();

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

    res.json({
      success: true,
      data: notifications,
      total: notifications.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '获取通知列表失败',
      message: (error as Error).message,
    });
  }
});

// 获取单个通知详情
router.get('/:notificationId', (req: Request, res: Response) => {
  try {
    const notification = notificationService.getNotification(req.params.notificationId);
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: '通知不存在',
      });
    }
    res.json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '获取通知失败',
      message: (error as Error).message,
    });
  }
});

// 创建通知
router.post('/', (req: Request, res: Response) => {
  try {
    const { userId, type, title, body, priority, channels, data, expiresInSeconds, icon, actionUrl } = req.body;

    if (!userId || !type || !title || !body) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段: userId, type, title, body',
      });
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
      return res.status(400).json({
        success: false,
        error: '通知创建失败（可能被限频或用户关闭通知）',
      });
    }

    res.status(201).json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '创建通知失败',
      message: (error as Error).message,
    });
  }
});

// 标记单条已读
router.patch('/:notificationId/read', (req: Request, res: Response) => {
  try {
    const success = notificationService.markAsRead(req.params.notificationId);
    if (!success) {
      return res.status(404).json({ success: false, error: '通知不存在' });
    }
    res.json({ success: true, message: '已标记为已读' });
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
    res.json({ success: true, message: `已标记 ${count} 条通知为已读` });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '批量标记已读失败',
      message: (error as Error).message,
    });
  }
});

// 删除通知
router.delete('/:notificationId', (req: Request, res: Response) => {
  try {
    const success = notificationService.deleteNotification(req.params.notificationId);
    if (!success) {
      return res.status(404).json({ success: false, error: '通知不存在' });
    }
    res.json({ success: true, message: '通知已删除' });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '删除通知失败',
      message: (error as Error).message,
    });
  }
});

// 清空用户通知
router.delete('/user/:userId/clear', (req: Request, res: Response) => {
  try {
    const count = notificationService.clearUserNotifications(req.params.userId);
    res.json({ success: true, message: `已清空 ${count} 条通知` });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '清空通知失败',
      message: (error as Error).message,
    });
  }
});

// 获取通知统计
router.get('/user/:userId/stats', (req: Request, res: Response) => {
  try {
    const stats = notificationService.getStats(req.params.userId);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '获取统计失败',
      message: (error as Error).message,
    });
  }
});

// 获取未读数量
router.get('/user/:userId/unread-count', (req: Request, res: Response) => {
  try {
    const count = notificationService.getUnreadCount(req.params.userId);
    res.json({ success: true, data: { count } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '获取未读数失败',
      message: (error as Error).message,
    });
  }
});

// 获取用户偏好
router.get('/user/:userId/preferences', (req: Request, res: Response) => {
  try {
    const prefs = notificationService.getUserPreferences(req.params.userId);
    res.json({ success: true, data: prefs });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '获取偏好设置失败',
      message: (error as Error).message,
    });
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
    res.json({ success: true, data: prefs });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '更新偏好设置失败',
      message: (error as Error).message,
    });
  }
});

// 获取通知模板列表
router.get('/templates/list', (_req: Request, res: Response) => {
  try {
    const templates = templateManager.getAllTemplates();
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '获取模板列表失败',
      message: (error as Error).message,
    });
  }
});

// 批量创建通知
router.post('/batch', (req: Request, res: Response) => {
  try {
    const { userIds, type, title, body, channels, priority, data } = req.body;

    if (!userIds || !Array.isArray(userIds) || !type || !title || !body) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段: userIds[], type, title, body',
      });
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

    res.status(201).json({
      success: true,
      data: notifications,
      total: notifications.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '批量创建通知失败',
      message: (error as Error).message,
    });
  }
});

export default router;
