import { useEffect, useState } from 'react';
import { Bell, MessageSquare, Phone, Smartphone } from 'lucide-react';

import { api, errorMessage, type AppNotification } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/shared';
import { Reveal } from '@/components/ui/motion-primitives';
import { getSocket } from '@/lib/socket';
import { relativeTime } from '@/lib/utils';

const CHANNEL_ICONS: Record<string, typeof Bell> = {
  SMS: MessageSquare,
  IVR: Phone,
  WHATSAPP: MessageSquare,
  APP: Smartphone,
};

export default function Alerts() {
  const { t } = useI18n();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const { data } = await api.get('/notifications/mine?limit=100');
      setNotifications(data.data);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // New alerts arrive over the socket as they are dispatched.
  useEffect(() => {
    const socket = getSocket();
    const onNew = (notification: AppNotification) => {
      setNotifications((prev) =>
        prev.some((n) => n._id === notification._id) ? prev : [notification, ...prev]
      );
    };
    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
    };
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <div className="container py-10"><ErrorState message={error} onRetry={load} /></div>;

  return (
    <div className="container py-10">
      <PageHeader
        title={t.notifications.title}
        subtitle={t.notifications.subtitle}
        icon={<Bell className="size-7 text-primary" />}
      />

      {notifications.length === 0 ? (
        <EmptyState title={t.notifications.empty} icon={<Bell className="size-7" />} />
      ) : (
        <div className="mx-auto max-w-3xl space-y-3">
          {notifications.map((notification, index) => {
            const Icon = CHANNEL_ICONS[notification.channel] || Bell;
            return (
              <Reveal key={notification._id} delay={Math.min(index * 0.03, 0.25)}>
                <Card className="flex gap-4 p-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <Badge variant="muted">{notification.channel}</Badge>
                      {notification.booking?.tokenCode && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {notification.booking.tokenCode}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {relativeTime(notification.createdAt)}
                      </span>
                    </div>

                    <p className="text-sm leading-relaxed" lang={notification.lang}>
                      {notification.message}
                    </p>

                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {t.notifications.sentBy}: {notification.dispatchedBy === 'fastapi' ? 'FastAPI' : 'Express'} ·{' '}
                      {notification.status}
                    </p>
                  </div>
                </Card>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}
