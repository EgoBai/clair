/**
 * 通知系统 - 统一导出
 */

export * from './types';
export * from './templates';
export * from './channels';
export * from './service';

import { NotificationService } from './service';
import { TemplateManager } from './templates';
import { ChannelManager, WebSocketChannelHandler, EmailChannelHandler, InAppChannelHandler, PushChannelHandler, SmsChannelHandler } from './channels';

export function createNotificationSystem(wsService?: any): {
  service: NotificationService;
  templateManager: TemplateManager;
  channelManager: ChannelManager;
  wsHandler: WebSocketChannelHandler;
  emailHandler: EmailChannelHandler;
  inAppHandler: InAppChannelHandler;
  pushHandler: PushChannelHandler;
  smsHandler: SmsChannelHandler;
} {
  const service = new NotificationService();
  const templates = new TemplateManager();
  const channels = new ChannelManager();

  const wsHandler = new WebSocketChannelHandler(wsService);
  const emailHandler = new EmailChannelHandler();
  const inAppHandler = new InAppChannelHandler();
  const pushHandler = new PushChannelHandler();
  const smsHandler = new SmsChannelHandler();

  channels.register(wsHandler);
  channels.register(emailHandler);
  channels.register(inAppHandler);
  channels.register(pushHandler);
  channels.register(smsHandler);

  // 注册到服务
  service.registerChannelHandler(wsHandler);
  service.registerChannelHandler(emailHandler);
  service.registerChannelHandler(inAppHandler);
  service.registerChannelHandler(pushHandler);
  service.registerChannelHandler(smsHandler);

  return {
    service,
    templateManager: templates,
    channelManager: channels,
    wsHandler,
    emailHandler,
    inAppHandler,
    pushHandler,
    smsHandler,
  };
}
