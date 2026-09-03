import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { CalendarCog, Lock, LockOpen, Save, Settings2, Users } from 'lucide-react';

import { api, errorMessage, type Center, type ScheduleDay } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Label } from '@/components/ui/input';
import { ErrorState, LoadingState, PageHeader } from '@/components/shared';
import { Reveal } from '@/components/ui/motion-primitives';
import { cn, STATUS_COLORS } from '@/lib/utils';

export default function AdminSchedule() {
  const { t } = useI18n();
  const { user, updateUser } = useAuth();

  const [center, setCenter] = useState<Center | null>(null);
  const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
  const [selected, setSelected] = useState<ScheduleDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [dayForm, setDayForm] = useState({ isOpen: true, dailyCapacity: '120', note: '' });
  const [centreForm, setCentreForm] = useState({
    activeCounters: '3',
    dailyCapacity: '120',
    openTime: '08:00',
    closeTime: '18:00',
  });

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/schedule?days=21');
      setCenter(data.data.center);
      setSchedule(data.data.schedule);
      setCentreForm({
        activeCounters: String(data.data.center.activeCounters),
        dailyCapacity: String(data.data.center.dailyCapacity),
        openTime: data.data.center.openTime,
        closeTime: data.data.center.closeTime,
      });
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pick = (day: ScheduleDay) => {
    setSelected(day);
    setDayForm({
      isOpen: day.isOpen,
      dailyCapacity: String(day.dailyCapacity),
      note: day.note || '',
    });
  };

  const saveDay = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const { data } = await api.put('/admin/schedule', {
        date: selected.date,
        isOpen: dayForm.isOpen,
        dailyCapacity: Number(dayForm.dailyCapacity),
        note: dayForm.note,
      });
      toast.success(data.message);
      setSelected(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveCentre = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch('/admin/center', {
        activeCounters: Number(centreForm.activeCounters),
        dailyCapacity: Number(centreForm.dailyCapacity),
        openTime: centreForm.openTime,
        closeTime: centreForm.closeTime,
      });
      toast.success(data.message);
      // Keep the signed-in staff profile in step with the centre they just edited.
      if (user && 'center' in user) updateUser({ center: data.data } as never);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState />;
  if (error || !center) {
    return <div className="container py-10"><ErrorState message={error} onRetry={load} /></div>;
  }

  const statusLabel = (status: ScheduleDay['status']) =>
    status === 'closed' ? t.schedule.closed
      : status === 'full' ? t.schedule.full
        : status === 'filling' ? t.schedule.filling
          : t.schedule.open;

  return (
    <div className="container py-10">
      <PageHeader
        title={t.admin.scheduleTitle}
        subtitle={t.admin.scheduleSubtitle}
        icon={<CalendarCog className="size-7 text-primary" />}
      />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* --------------------------------------------------- date grid */}
        <Reveal>
          <Card className="p-6">
            <h2 className="mb-4 text-lg font-bold">{center.name}</h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {schedule.map((day, index) => {
                const status: ScheduleDay['status'] = !day.isOpen
                  ? 'closed'
                  : day.remaining === 0
                    ? 'full'
                    : day.remaining <= day.dailyCapacity * 0.2
                      ? 'filling'
                      : 'open';

                return (
                  <motion.button
                    key={day.date}
                    type="button"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.02, 0.3) }}
                    onClick={() => pick({ ...day, status })}
                    className={cn(
                      'rounded-[var(--radius)] border-2 p-3 text-left transition-all',
                      selected?.date === day.date
                        ? 'border-primary bg-primary/10 shadow-md'
                        : 'border-border hover:border-primary/40 hover:bg-muted'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground">
                        {day.weekday} · {dayjs(day.date).format('DD MMM')}
                      </p>
                      {day.isOpen ? (
                        <LockOpen className="size-3.5 text-emerald-600" />
                      ) : (
                        <Lock className="size-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <p className="mt-1 text-lg font-extrabold tabular-nums">
                      {day.booked}
                      <span className="ml-1 text-xs font-medium text-muted-foreground">
                        / {day.dailyCapacity}
                      </span>
                    </p>
                    <span
                      className={cn(
                        'mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold',
                        STATUS_COLORS[status]
                      )}
                    >
                      {statusLabel(status)}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </Card>
        </Reveal>

        <div className="space-y-5">
          {/* ------------------------------------------------ day editor */}
          <Reveal delay={0.08}>
            <Card className="p-6">
              <h2 className="mb-4 text-lg font-bold">
                {selected ? dayjs(selected.date).format('DD MMM YYYY') : t.schedule.selectDate}
              </h2>

              {selected ? (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    {[true, false].map((open) => (
                      <button
                        key={String(open)}
                        type="button"
                        onClick={() => setDayForm((f) => ({ ...f, isOpen: open }))}
                        className={cn(
                          'flex flex-1 items-center justify-center gap-2 rounded-[var(--radius)] border-2 py-3 font-semibold transition-colors',
                          dayForm.isOpen === open
                            ? open
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                            : 'border-input hover:bg-muted'
                        )}
                      >
                        {open ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
                        {open ? t.admin.openDate : t.admin.closeDate}
                      </button>
                    ))}
                  </div>

                  <div>
                    <Label htmlFor="cap">{t.admin.dailyCapacity}</Label>
                    <Input
                      id="cap"
                      inputMode="numeric"
                      value={dayForm.dailyCapacity}
                      onChange={(e) =>
                        setDayForm((f) => ({ ...f, dailyCapacity: e.target.value.replace(/\D/g, '') }))
                      }
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {selected.booked} {t.schedule.booked} — {t.admin.dailyCapacity.toLowerCase()} cannot go below this
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="note">{t.grievance.subject}</Label>
                    <Input
                      id="note"
                      value={dayForm.note}
                      onChange={(e) => setDayForm((f) => ({ ...f, note: e.target.value }))}
                      placeholder="e.g. Weekly holiday"
                    />
                  </div>

                  <Button className="w-full" size="lg" loading={saving} onClick={saveDay}>
                    <Save className="size-4" />
                    {t.admin.save}
                  </Button>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">{t.schedule.selectDate}</p>
              )}
            </Card>
          </Reveal>

          {/* --------------------------------------------- centre settings */}
          <Reveal delay={0.12}>
            <Card className="p-6">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
                <Settings2 className="size-5" />
                {t.admin.centreSettings}
              </h2>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="counters">{t.admin.activeCounters}</Label>
                  <Input
                    id="counters"
                    inputMode="numeric"
                    value={centreForm.activeCounters}
                    onChange={(e) =>
                      setCentreForm((f) => ({ ...f, activeCounters: e.target.value.replace(/\D/g, '') }))
                    }
                    icon={<Users />}
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Every ETA on the farmer app is divided across these counters.
                  </p>
                </div>

                <div>
                  <Label htmlFor="defcap">{t.admin.dailyCapacity}</Label>
                  <Input
                    id="defcap"
                    inputMode="numeric"
                    value={centreForm.dailyCapacity}
                    onChange={(e) =>
                      setCentreForm((f) => ({ ...f, dailyCapacity: e.target.value.replace(/\D/g, '') }))
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="open">{t.admin.workingHours}</Label>
                    <Input
                      id="open"
                      type="time"
                      value={centreForm.openTime}
                      onChange={(e) => setCentreForm((f) => ({ ...f, openTime: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="close">&nbsp;</Label>
                    <Input
                      id="close"
                      type="time"
                      value={centreForm.closeTime}
                      onChange={(e) => setCentreForm((f) => ({ ...f, closeTime: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {center.commodities.map((code) => (
                    <Badge key={code} variant="muted">{code}</Badge>
                  ))}
                </div>

                <Button className="w-full" size="lg" loading={saving} onClick={saveCentre}>
                  <Save className="size-4" />
                  {t.admin.save}
                </Button>
              </div>
            </Card>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
