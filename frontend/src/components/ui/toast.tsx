import { message } from 'antd';

type ToastType = 'success' | 'info' | 'warning' | 'error';

interface ToastOptions {
  type?: ToastType;
  duration?: number;
}

export function toast(msg: string, options: ToastType | ToastOptions = 'info') {
  const opts = typeof options === 'string' ? { type: options } : options;
  const { type = 'info', duration = 2 } = opts;

  switch (type) {
    case 'success':
      message.success(msg, duration);
      break;
    case 'warning':
      message.warning(msg, duration);
      break;
    case 'error':
      message.error(msg, duration);
      break;
    default:
      message.info(msg, duration);
      break;
  }
}
