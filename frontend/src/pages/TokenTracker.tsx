import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import {
  Banknote, Clock, Droplets, Hash, MapPin, MessageSquareWarning,
  Package, Phone, Scale, Ticket, Users, XCircle,
} from 'lucide-react';

import { api, errorMessage, type Booking, type Position } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ErrorState, LoadingState } from '@/components/shared';
import { NumberTicker, PulseDot, Reveal } from '@/components/ui/motion-primitives';
import { StageBadge, StagePipeline } from '@/components/StagePipeline';
import { getSocket, joinBooking, joinCenter } from '@/lib/socket';
import { cn, formatINR, formatTime, humanMinutes } from '@/lib/utils';

export default function TokenTracker() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await api.get(`/bookings/${id}`);
      setBooking(data.data.booking);
      setPosition(data.data.position);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Realtime wiring: the booking room catches this farmer's own stage changes,
   * the centre room catches everyone else's (which shifts this token's position).
   */
  useEffect(() => {
    if (!booking) return;
    const socket = getSocket();
    joinBooking(booking._id);
    joinCenter(booking.center?._id);

    const onBooking = (updated: Booking) => {
      if (String(updated._id) !== String(booking._id)) return;
      setBooking((prev) => (prev ? { ...prev, ...updated } : updated));
      toast.success(`${t.admin.stageUpdated}: ${t.stages[updated.stage]}`, { icon: '🔔' });
      load();
    };
    const onQueue = () => load();

    socket.on('booking:updated', onBooking);
    socket.on('queue:updated', onQueue);
    return () => {
      socket.off('booking:updated', onBooking);
      socket.off('queue:updated', onQueue);
    };
  }, [booking?._id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancel = async () => {
    if (!booking) return;
    setCancelling(true);
    try {
      await api.patch(`/bookings/${booking._id}/cancel`, { reason: 'Cancelled by farmer' });
      toast.success(t.token.cancel);
      setConfirmCancel(false);
      navigate('/my-tokens');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <LoadingState />;
  if (error || !booking) {
    return <div className="container py-10"><ErrorState message={error || 'Token not found'} onRetry={load} /></div>;
  }

  const isActive = !['PAID', 'CANCELLED', 'NO_SHOW'].includes(booking.stage);
  const ahead = position?.ahead ?? 0;

  return (
    <div className="container py-10">
      {/* ---------------------------------------------------- hero token card */}
      <Reveal>
        <Card className="overflow-hidden shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-primary px-6 py-3.5 text-primary-foreground">
            <span className="flex items-center gap-2 text-sm font-bold">
              {isActive && <PulseDot color="bg-white" />}
              {t.token.title}
            </span>
            <span className="font-mono text-xs opacity-90">{booking.tokenCode}</span>
          </div>

          <div className="grid gap-6 p-6 lg:grid-cols-[auto_1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t.token.yourToken}
              </p>
              <p className="text-6xl font-extrabold tracking-tight text-primary">
                #{booking.tokenNumber}
              </p>
              {booking.priority && (
                <Badge variant="secondary" className="mt-2">
                  {t.booking.priority}
                </Badge>
              )}
            </div>

            {isActive && booking.stage === 'BOOKED' ? (
              <div className="rounded-[var(--radius)] bg-muted/60 p-5">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t.token.position}
                    </p>
                    <p className="mt-1 text-3xl font-extrabold">
                      {ahead === 0 ? (
                        <span className="text-primary">{t.token.noneAhead}</span>
                      ) : (
                        <>
                          <NumberTicker value={ahead} />{' '}
                          <span className="text-base font-semibold text-muted-foreground">
                            {t.token.ahead}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t.token.estWait}
                    </p>
                    <p className="mt-1 text-3xl font-extrabold tabular-nums">
                      {humanMinutes(position?.etaMins)}
                    </p>
                    {position?.etaAt && (
                      <p className="text-xs text-muted-foreground">
                        {t.token.expectedAt} {position.etaAt}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-border">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${Math.max(
                        5,
                        100 - (ahead / Math.max(position?.totalInQueue || 1, 1)) * 100
                      )}%`,
                    }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>

                {position?.nowServing && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="size-4" />
                    {t.token.nowServing}:{' '}
                    <span className="font-mono font-bold text-foreground">
                      {position.nowServing.tokenCode}
                    </span>
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-[var(--radius)] bg-muted/60 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t.token.status}
                </p>
                <div className="mt-2">
                  <StageBadge stage={booking.stage} className="px-3 py-1.5 text-sm" />
                </div>
                {booking.stage === 'PAID' && booking.payment?.paidAt && (
                  <p className="mt-2.5 text-sm text-muted-foreground">
                    {formatTime(booking.payment.paidAt)} ·{' '}
                    <span className="font-bold text-foreground">
                      {formatINR(booking.payment.amount)}
                    </span>
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Button asChild variant="outline">
                <Link to={`/grievances?booking=${booking._id}`}>
                  <MessageSquareWarning className="size-4" />
                  {t.token.raiseIssue}
                </Link>
              </Button>
              {booking.stage === 'BOOKED' && (
                <Button variant="ghost" className="text-destructive" onClick={() => setConfirmCancel(true)}>
                  <XCircle className="size-4" />
                  {t.token.cancel}
                </Button>
              )}
            </div>
          </div>
        </Card>
      </Reveal>

      {/* --------------------------------------------------------- pipeline */}
      <Reveal delay={0.08} className="mt-6">
        <Card className="p-6">
          <h2 className="mb-6 text-lg font-bold">{t.token.pipeline}</h2>
          <div className="hidden sm:block">
            <StagePipeline stage={booking.stage} history={booking.stageHistory} />
          </div>
          <div className="sm:hidden">
            <StagePipeline stage={booking.stage} history={booking.stageHistory} orientation="vertical" />
          </div>
        </Card>
      </Reveal>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* ------------------------------------------------------- details */}
        <Reveal delay={0.12}>
          <Card className="p-6">
            <h2 className="mb-4 text-lg font-bold">{t.admin.details}</h2>
            <dl className="space-y-3 text-sm">
              <Detail icon={<MapPin />} label={t.token.centre} value={
                lang === 'hi' && booking.center?.nameHi ? booking.center.nameHi : booking.center?.name
              } />
              <Detail icon={<Clock />} label={t.token.slot} value={
                `${dayjs(booking.slotDate).format('DD MMM YYYY')} · ${booking.slotStart}–${booking.slotEnd}`
              } />
              <Detail icon={<Package />} label={t.token.commodity} value={booking.commodity} />
              <Detail icon={<Scale />} label={t.token.quantity} value={`${booking.quantityQuintals} ${t.common.quintals}`} />
              <Detail icon={<Hash />} label="Farmer ID" value={booking.farmer?.farmerId} />
              {booking.center?.contactPhone && (
                <Detail
                  icon={<Phone />}
                  label={t.common.phone}
                  value={
                    <a href={`tel:${booking.center.contactPhone}`} className="text-primary hover:underline">
                      {booking.center.contactPhone}
                    </a>
                  }
                />
              )}
            </dl>

            {/* quality + weighment appear as staff record them */}
            <AnimatePresence>
              {booking.quality?.grade && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-5 overflow-hidden rounded-[var(--radius)] bg-violet-50 p-4 dark:bg-violet-950/40"
                >
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                    {t.token.quality}
                  </p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="flex items-center gap-1.5">
                      <Droplets className="size-4" />
                      {t.token.moisture}: <b>{booking.quality.moisturePct}%</b>
                    </span>
                    <span>
                      {t.token.grade}: <b>{booking.quality.grade}</b>
                    </span>
                  </div>
                </motion.div>
              )}

              {booking.weighment?.netQuintals && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3 overflow-hidden rounded-[var(--radius)] bg-amber-50 p-4 dark:bg-amber-950/40"
                >
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    {t.token.weighment}
                  </p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span>{t.token.gross}: <b>{booking.weighment.grossQuintals}</b></span>
                    <span>{t.token.net}: <b>{booking.weighment.netQuintals}</b></span>
                    {booking.weighment.bags != null && (
                      <span>{t.token.bags}: <b>{booking.weighment.bags}</b></span>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </Reveal>

        {/* ------------------------------------------------------- payment */}
        <Reveal delay={0.16}>
          <Card
            className={cn(
              'p-6',
              booking.payment?.status === 'PAID' && 'border-emerald-300 dark:border-emerald-900'
            )}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{t.token.payment}</h2>
              <Badge
                variant={
                  booking.payment?.status === 'PAID' ? 'success'
                    : booking.payment?.status === 'INITIATED' ? 'warning'
                      : 'muted'
                }
              >
                <Banknote className="size-3" />
                {booking.payment?.status || 'PENDING'}
              </Badge>
            </div>

            <p className="text-4xl font-extrabold tracking-tight">
              {formatINR(booking.payment?.amount)}
            </p>

            <dl className="mt-5 space-y-3 text-sm">
              <Detail label={t.token.rate} value={formatINR(booking.payment?.ratePerQuintal)} />
              {booking.payment?.utr && (
                <Detail label={t.token.utr} value={<span className="font-mono">{booking.payment.utr}</span>} />
              )}
              {booking.payment?.initiatedAt && (
                <Detail label={t.stages.PAYMENT_INITIATED} value={formatTime(booking.payment.initiatedAt)} />
              )}
              {booking.payment?.paidAt && (
                <Detail label={t.stages.PAID} value={formatTime(booking.payment.paidAt)} />
              )}
              {booking.farmer?.bankLast4 && (
                <Detail label="Bank A/C" value={`•••• ${booking.farmer.bankLast4}`} />
              )}
            </dl>

            {/* activity timeline */}
            <div className="mt-6 border-t pt-5">
              <h3 className="mb-3 text-sm font-bold">{t.token.history}</h3>
              <ol className="space-y-3">
                {[...booking.stageHistory].reverse().map((event, index) => (
                  <li key={`${event.stage}-${index}`} className="flex gap-3 text-sm">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0">
                      <p className="font-semibold">{t.stages[event.stage]}</p>
                      <p className="text-xs text-muted-foreground">
                        {dayjs(event.at).format('DD MMM, hh:mm A')} · {event.by}
                        {event.note ? ` · ${event.note}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Card>
        </Reveal>
      </div>

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.token.cancel}</DialogTitle>
            <DialogDescription>{t.token.cancelConfirm}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancel(false)}>
              {t.common.close}
            </Button>
            <Button variant="destructive" loading={cancelling} onClick={cancel}>
              {t.token.cancel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-muted-foreground">
        {icon && <span className="[&_svg]:size-4">{icon}</span>}
        {label}
      </dt>
      <dd className="truncate text-right font-semibold">{value ?? '—'}</dd>
    </div>
  );
}
