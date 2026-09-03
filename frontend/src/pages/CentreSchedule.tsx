import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import { ArrowRight, CalendarDays, Clock, MapPin, Radio, Users } from 'lucide-react';

import { api, errorMessage, type Center, type QueueSnapshot, type ScheduleDay, type Slot } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, LoadingState, PageHeader, StatCard } from '@/components/shared';
import { PulseDot, Reveal } from '@/components/ui/motion-primitives';
import { StageBadge } from '@/components/StagePipeline';
import { getSocket, joinCenter, leaveCenter } from '@/lib/socket';
import { cn, formatDuration, humanMinutes, STATUS_COLORS, todayISO } from '@/lib/utils';

export default function CentreSchedule() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();

  const [center, setCenter] = useState<Center | null>(null);
  const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
  const [selected, setSelected] = useState<string>(todayISO());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [queue, setQueue] = useState<QueueSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotLoading, setSlotLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([api.get(`/centers/${id}/schedule?days=14`), api.get(`/queue/${id}`)])
      .then(([scheduleRes, queueRes]) => {
        setCenter(scheduleRes.data.data.center);
        setSchedule(scheduleRes.data.data.schedule);
        setQueue(queueRes.data.data);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  // Live queue board — updates the moment staff advance any token.
  useEffect(() => {
    if (!id) return;
    joinCenter(id);
    const socket = getSocket();
    const onUpdate = (snapshot: QueueSnapshot) => {
      if (snapshot?.queue) setQueue(snapshot);
    };
    socket.on('queue:updated', onUpdate);
    return () => {
      socket.off('queue:updated', onUpdate);
      leaveCenter(id);
    };
  }, [id]);

  useEffect(() => {
    if (!id || !selected) return;
    setSlotLoading(true);
    api
      .get(`/centers/${id}/slots?date=${selected}`)
      .then(({ data }) => setSlots(data.data.slots))
      .catch(() => setSlots([]))
      .finally(() => setSlotLoading(false));
  }, [id, selected]);

  if (loading) return <LoadingState />;
  if (error || !center) {
    return <div className="container py-10"><ErrorState message={error || 'Centre not found'} /></div>;
  }

  const statusLabel = (status: ScheduleDay['status']) =>
    status === 'closed' ? t.schedule.closed
      : status === 'full' ? t.schedule.full
        : status === 'filling' ? t.schedule.filling
          : t.schedule.open;

  return (
    <div className="container py-10">
      <PageHeader
        title={lang === 'hi' && center.nameHi ? center.nameHi : center.name}
        subtitle={center.address}
        icon={<CalendarDays className="size-7 text-primary" />}
        actions={
          <Button asChild size="lg">
            <Link to={`/book?center=${center._id}`}>
              {t.centres.bookHere}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        }
      />

      {/* live board */}
      {queue && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t.admin.nowServing}
            value={queue.nowServing ? `#${queue.nowServing.tokenNumber}` : '—'}
            hint={queue.nowServing ? <StageBadge stage={queue.nowServing.stage} /> : t.admin.emptyQueue}
            icon={<Radio className="size-5" />}
            accent="emerald"
          />
          <StatCard
            label={t.admin.booked}
            value={queue.stats.totalBooked}
            hint={`${t.admin.capacityLeft}: ${queue.stats.capacityLeft}`}
            icon={<CalendarDays className="size-5" />}
          />
          <StatCard
            label={t.admin.arrived}
            value={queue.stats.inCentre}
            hint={`${queue.stats.waiting} ${t.schedule.booked}`}
            icon={<Users className="size-5" />}
            accent="sky"
          />
          <StatCard
            label={t.admin.avgTurnaround}
            value={formatDuration(queue.stats.avgTurnaroundMins)}
            hint={`${center.activeCounters} ${t.centres.counters}`}
            icon={<Clock className="size-5" />}
            accent="amber"
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        {/* ---- date rail */}
        <Reveal>
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{t.schedule.title}</h2>
              <span className="text-sm text-muted-foreground">{t.schedule.subtitle}</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {schedule.map((day, index) => {
                const isSelected = day.date === selected;
                const disabled = day.status === 'closed' || day.status === 'full';

                return (
                  <motion.button
                    key={day.date}
                    type="button"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.025, 0.3) }}
                    onClick={() => setSelected(day.date)}
                    className={cn(
                      'rounded-[var(--radius)] border-2 p-3 text-left transition-all',
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-md'
                        : 'border-border hover:border-primary/40 hover:bg-muted',
                      disabled && 'opacity-60'
                    )}
                  >
                    <p className="text-xs font-semibold text-muted-foreground">
                      {day.weekday} · {dayjs(day.date).format('DD MMM')}
                    </p>
                    <p className="mt-1 text-lg font-extrabold tabular-nums">
                      {day.remaining}
                      <span className="ml-1 text-xs font-medium text-muted-foreground">
                        / {day.dailyCapacity}
                      </span>
                    </p>
                    <span
                      className={cn(
                        'mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold',
                        STATUS_COLORS[day.status]
                      )}
                    >
                      {statusLabel(day.status)}
                    </span>
                    {(lang === 'hi' ? day.noteHi : day.note) && (
                      <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                        {lang === 'hi' ? day.noteHi : day.note}
                      </p>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </Card>
        </Reveal>

        {/* ---- slots */}
        <Reveal delay={0.1}>
          <Card className="p-6">
            <h2 className="text-lg font-bold">
              {t.schedule.slotsFor} {dayjs(selected).format('DD MMM YYYY')}
            </h2>

            {slotLoading ? (
              <LoadingState />
            ) : slots.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{t.schedule.noSlots}</p>
            ) : (
              <div className="mt-4 grid max-h-[26rem] grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-2">
                {slots.map((slot) => (
                  <Link
                    key={slot.start}
                    to={
                      slot.isAvailable
                        ? `/book?center=${center._id}&date=${selected}&slot=${slot.start}`
                        : '#'
                    }
                    onClick={(e) => !slot.isAvailable && e.preventDefault()}
                    className={cn(
                      'rounded-[var(--radius)] border-2 p-3 transition-all',
                      slot.isAvailable
                        ? 'border-border hover:border-primary hover:bg-primary/5'
                        : 'cursor-not-allowed border-dashed bg-muted/50 opacity-60'
                    )}
                  >
                    <p className="font-bold tabular-nums">
                      {slot.start} – {slot.end}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {slot.isAvailable
                        ? `${slot.remaining} ${t.schedule.slotsLeft}`
                        : t.schedule.slotFull}
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          (slot.loadPct ?? 0) >= 100 ? 'bg-destructive' : (slot.loadPct ?? 0) >= 75 ? 'bg-amber-500' : 'bg-primary'
                        )}
                        style={{ width: `${Math.min(slot.loadPct ?? 0, 100)}%` }}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </Reveal>
      </div>

      {/* ---- live queue list */}
      {queue && queue.queue.length > 0 && (
        <Reveal delay={0.15} className="mt-6">
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2">
              <PulseDot />
              <h2 className="text-lg font-bold">{t.nav.queue}</h2>
              <span className="text-sm text-muted-foreground">
                · {queue.queue.length} {t.schedule.booked}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2.5 pr-3 font-semibold">#</th>
                    <th className="pb-2.5 pr-3 font-semibold">{t.token.yourToken}</th>
                    <th className="pb-2.5 pr-3 font-semibold">{t.token.status}</th>
                    <th className="pb-2.5 pr-3 font-semibold">{t.token.slot}</th>
                    <th className="pb-2.5 font-semibold">{t.token.estWait}</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.queue.slice(0, 12).map((item) => (
                    <tr key={item._id} className="border-b last:border-0">
                      <td className="py-2.5 pr-3 font-bold tabular-nums">{item.position}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs">{item.tokenCode}</td>
                      <td className="py-2.5 pr-3"><StageBadge stage={item.stage} /></td>
                      <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">
                        {item.slotStart}–{item.slotEnd}
                      </td>
                      <td className="py-2.5 font-semibold tabular-nums">{humanMinutes(item.etaMins)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Reveal>
      )}
    </div>
  );
}
