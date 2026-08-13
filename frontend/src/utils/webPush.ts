import { notificationsApi } from '../api/notifications';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
  );
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return reg;
  } catch {
    return null;
  }
}

export async function getPushPermissionState(): Promise<NotificationPermission | 'unsupported'> {
  if (!isWebPushSupported()) return 'unsupported';
  return Notification.permission;
}

export async function enableWebPush(): Promise<{ ok: boolean; message: string }> {
  if (!isWebPushSupported()) {
    return {
      ok: false,
      message: 'Thiết bị/trình duyệt không hỗ trợ thông báo đẩy. Trên iPhone cần Thêm vào Màn hình chính rồi mở từ icon.',
    };
  }

  const cfg = await notificationsApi.pushConfig();
  if (!cfg.enabled || !cfg.public_key) {
    return { ok: false, message: 'Máy chủ chưa bật Web Push (thiếu VAPID / PUSH_ENABLED).' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, message: 'Bạn chưa cho phép thông báo trên thiết bị này.' };
  }

  const reg = await ensureServiceWorker();
  if (!reg) {
    return { ok: false, message: 'Không đăng ký được service worker.' };
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(cfg.public_key) as BufferSource,
    });
  }

  const json = sub.toJSON();
  const endpoint = json.endpoint || '';
  const p256dh = json.keys?.p256dh || '';
  const auth = json.keys?.auth || '';
  if (!endpoint || !p256dh || !auth) {
    return { ok: false, message: 'Không lấy được khóa đăng ký push.' };
  }

  await notificationsApi.pushSubscribe({
    endpoint,
    p256dh,
    auth,
    user_agent: navigator.userAgent,
  });

  return { ok: true, message: 'Đã bật thông báo trên thiết bị này.' };
}

export async function disableWebPush(): Promise<{ ok: boolean; message: string }> {
  if (!isWebPushSupported()) {
    return { ok: false, message: 'Trình duyệt không hỗ trợ Web Push.' };
  }
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    try {
      await notificationsApi.pushUnsubscribe(sub.endpoint);
    } catch {
      /* still unsubscribe locally */
    }
    await sub.unsubscribe();
  }
  return { ok: true, message: 'Đã tắt thông báo trên thiết bị này.' };
}

export async function hasActivePushSubscription(): Promise<boolean> {
  if (!isWebPushSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}
