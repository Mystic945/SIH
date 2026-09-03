import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { MapPin, Search, Ticket, Users } from 'lucide-react';

import { api, errorMessage, type Booking, type Position } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ErrorState, PageHeader } from '@/components/shared';
import { AuroraBackground, NumberTicker, PulseDot, Reveal } from '@/components/ui/motion-primitives';
import { StageBadge, StagePipeline } from '@/components/StagePipeline';
import { getSocket, joinCenter } from '@/lib/socket';
import { humanMinutes } from '@/lib/utils';

/**
 * Public token lookup — reachable without signing in, because the SMS deep link
 * has to work on a shared or borrowed handset.
 */
export default function TrackLookup() {
  const { tokenCode } = useParams<{ tokenCode: string }>();
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  const [code, setCode] = useState(tokenCode || '');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const lookup = async (value: string) => {
    if (!value.trim()) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/bookings/track/${value.trim().toUpperCase()}`);
      setBooking(data.data.booking);
      setPosition(data.data.position);
    } catch (err) {
      setError(errorMessage(err));
      setBooking(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tokenCode) lookup(tokenCode);
  }, [tokenCode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!booking?.center?._id) return;
    joinCenter(booking.center._id);
    const socket = getSocket();
    const onUpdate = () => lookup(booking.tokenCode);
    socket.on('queue:updated', onUpdate);
    return () => {
      socket.off('queue:updated', onUpdate);
    };
  }, [booking?.center?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    navigate(`/track/${code.trim().toUpperCase()}`);
    lookup(code);
  };

  return (
    <div className="relative">
      <AuroraBackground className="opacity-50" />

      <div className="container relative py-10">
        <PageHeader
          title={t.token.trackTitle}
          subtitle={t.token.trackSubtitle}
          icon={<Search className="size-7 text-primary" />}
        />

        <Reveal>
          <Card className="mx-auto max-w-xl p-6">
            <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={t.token.trackPlaceholder}
                className="font-mono uppercase"
                icon={<Ticket />}
              />
              <Button type="submit" size="lg" loading={loading} className="sm:w-36">
                {t.token.trackButton}
              </Button>
            </form>
          </Card>
        </Reveal>

        {error && (
          <div className="mx-auto mt-6 max-w-xl">
            <ErrorState message={error} />
          </div>
        )}

        {booking && (
          <Reveal delay={0.1} className="mx-auto mt-6 max-w-3xl">
            <Card className="overflow-hidden shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-primary px-6 py-3.5 text-primary-foreground">
                <span className="flex items-center gap-2 text-sm font-bold">
                  <PulseDot color="bg-white" />
                  {t.token.live}
                </span>
                <span className="font-mono text-xs opacity-90">{booking.tokenCode}</span>
              </div>

              <div className="grid gap-6 p-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t.token.yourToken}
                  </p>
                  <p className="text-5xl font-extrabold tracking-tight text-primary">
                    #{booking.tokenNumber}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{booking.farmer?.name}</p>
                  <div className="mt-3">
                    <StageBadge stage={booking.stage} />
                  </div>
                </div>

                <div className="rounded-[var(--radius)] bg-muted/60 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t.token.position}</span>
                    <span className="font-bold">
                      <NumberTicker value={position?.ahead ?? 0} /> {t.token.ahead}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t.token.estWait}</span>
                    <span className="font-bold tabular-nums">{humanMinutes(position?.etaMins)}</span>
                  </div>
                  {position?.nowServing && (
                    <div className="mt-3 flex items-center gap-2 border-t pt-3 text-sm">
                      <Users className="size-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{t.token.nowServing}:</span>
                      <span className="font-mono font-bold">{position.nowServing.tokenCode}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t px-6 py-6">
                <div className="hidden sm:block">
                  <StagePipeline stage={booking.stage} history={booking.stageHistory} />
                </div>
                <div className="sm:hidden">
                  <StagePipeline
                    stage={booking.stage}
                    history={booking.stageHistory}
                    orientation="vertical"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-6 py-4 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="size-4" />
                  {lang === 'hi' && booking.center?.nameHi ? booking.center.nameHi : booking.center?.name}
                </span>
                <span className="text-muted-foreground">
                  {dayjs(booking.slotDate).format('DD MMM YYYY')} · {booking.slotStart}–{booking.slotEnd}
                </span>
              </div>
            </Card>
          </Reveal>
        )}
      </div>
    </div>
  );
}
