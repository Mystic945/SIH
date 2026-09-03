import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { CalendarDays, MapPin, Ticket } from 'lucide-react';

import { api, errorMessage, type Booking } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/shared';
import { PulseDot, Reveal, SpotlightCard } from '@/components/ui/motion-primitives';
import { StageBadge } from '@/components/StagePipeline';
import { getSocket } from '@/lib/socket';
import { formatINR } from '@/lib/utils';

export default function MyTokens() {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (status = tab) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/bookings/mine?status=${status}`);
      setBookings(data.data);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(tab);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Any stage change anywhere refreshes the list so badges stay honest.
  useEffect(() => {
    const socket = getSocket();
    const onUpdate = () => load(tab);
    socket.on('booking:updated', onUpdate);
    return () => {
      socket.off('booking:updated', onUpdate);
    };
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="container py-10">
      <PageHeader
        title={t.myTokens.title}
        icon={<Ticket className="size-7 text-primary" />}
        actions={
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="upcoming">{t.myTokens.upcoming}</TabsTrigger>
              <TabsTrigger value="past">{t.myTokens.past}</TabsTrigger>
              <TabsTrigger value="all">{t.myTokens.all}</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(tab)} />
      ) : bookings.length === 0 ? (
        <EmptyState
          title={t.myTokens.empty}
          action={{ label: t.myTokens.emptyCta, to: '/book' }}
          icon={<Ticket className="size-7" />}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {bookings.map((booking, index) => {
            const isLive = !['PAID', 'CANCELLED', 'NO_SHOW'].includes(booking.stage);
            return (
              <Reveal key={booking._id} delay={Math.min(index * 0.05, 0.3)}>
                <Link to={`/tokens/${booking._id}`}>
                  <SpotlightCard className="h-full p-5 transition-shadow hover:shadow-lg">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">{booking.tokenCode}</p>
                        <p className="text-3xl font-extrabold tracking-tight text-primary">
                          #{booking.tokenNumber}
                        </p>
                      </div>
                      {isLive && <PulseDot />}
                    </div>

                    <div className="mt-3">
                      <StageBadge stage={booking.stage} />
                    </div>

                    <div className="mt-4 space-y-2 text-sm">
                      <p className="flex items-start gap-2 text-muted-foreground">
                        <MapPin className="mt-0.5 size-4 shrink-0" />
                        <span className="line-clamp-1">
                          {lang === 'hi' && booking.center?.nameHi
                            ? booking.center.nameHi
                            : booking.center?.name}
                        </span>
                      </p>
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <CalendarDays className="size-4 shrink-0" />
                        {dayjs(booking.slotDate).format('DD MMM YYYY')} · {booking.slotStart}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t pt-3.5 text-sm">
                      <span className="text-muted-foreground">
                        {booking.commodity} · {booking.quantityQuintals} {t.common.quintals}
                      </span>
                      <span className="font-bold">{formatINR(booking.payment?.amount)}</span>
                    </div>
                  </SpotlightCard>
                </Link>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}
