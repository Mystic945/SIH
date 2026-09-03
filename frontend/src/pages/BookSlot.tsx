import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import {
  ArrowLeft, ArrowRight, CalendarCheck, Check, Clock, MapPin,
  PartyPopper, Sparkles, Sprout, Ticket, Wheat,
} from 'lucide-react';

import {
  api, errorMessage,
  type Booking, type Center, type Commodity, type ScheduleDay, type Slot,
} from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Label } from '@/components/ui/input';
import { LoadingState, PageHeader } from '@/components/shared';
import { Reveal } from '@/components/ui/motion-primitives';
import { cn, formatINR, humanMinutes, STATUS_COLORS } from '@/lib/utils';

interface Suggestion {
  date: string;
  slot_start: string;
  slot_end: string;
  expected_wait_minutes: number;
  load_pct: number;
  reason_en: string;
  reason_hi: string;
}

export default function BookSlot() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [centers, setCenters] = useState<Center[]>([]);
  const [commodities, setCommodities] = useState<Commodity[]>([]);
  const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const [step, setStep] = useState(1);
  const [centerId, setCenterId] = useState(params.get('center') || '');
  const [date, setDate] = useState(params.get('date') || '');
  const [slotStart, setSlotStart] = useState(params.get('slot') || '');
  const [commodity, setCommodity] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [priority, setPriority] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Booking | null>(null);

  const center = useMemo(() => centers.find((c) => c._id === centerId), [centers, centerId]);
  const slot = useMemo(() => slots.find((s) => s.start === slotStart), [slots, slotStart]);

  useEffect(() => {
    Promise.all([api.get('/centers'), api.get('/meta')])
      .then(([centersRes, metaRes]) => {
        setCenters(centersRes.data.data);
        setCommodities(metaRes.data.data.commodities);
      })
      .catch((err) => toast.error(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  // Jump straight to the right step when arriving from a deep link.
  useEffect(() => {
    if (centerId && date && slotStart) setStep(4);
    else if (centerId && date) setStep(3);
    else if (centerId) setStep(2);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!centerId) return;
    api
      .get(`/centers/${centerId}/schedule?days=14`)
      .then(({ data }) => setSchedule(data.data.schedule))
      .catch(() => setSchedule([]));

    // FastAPI ranks the least-congested slots so arrivals get spread out.
    api
      .post('/intel/recommend-slot', { center_id: centerId, quantity_quintals: Number(quantity) || 10 })
      .then(({ data }) => setSuggestions(data.data.suggestions || []))
      .catch(() => setSuggestions([]));

    const found = centers.find((c) => c._id === centerId);
    if (found && !found.commodities.includes(commodity)) setCommodity(found.commodities[0] || '');
  }, [centerId, centers]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!centerId || !date) return;
    api
      .get(`/centers/${centerId}/slots?date=${date}`)
      .then(({ data }) => setSlots(data.data.slots))
      .catch(() => setSlots([]));
  }, [centerId, date]);

  const estimate = useMemo(() => {
    const msp = commodities.find((c) => c.code === commodity)?.msp || 0;
    return msp * (Number(quantity) || 0);
  }, [commodities, commodity, quantity]);

  const submit = async () => {
    if (!center || !slot) return;
    setSubmitting(true);
    try {
      const { data } = await api.post('/bookings', {
        centerId,
        slotDate: date,
        slotStart: slot.start,
        slotEnd: slot.end,
        commodity,
        quantityQuintals: Number(quantity),
        priority,
      });
      setCreated(data.data);
      toast.success(t.booking.success);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState />;

  /* --------------------------------------------------------- success view */
  if (created) {
    return (
      <div className="container flex min-h-[70vh] items-center justify-center py-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 180, damping: 20 }}
          className="w-full max-w-lg"
        >
          <Card className="overflow-hidden text-center shadow-2xl">
            <div className="bg-primary px-6 py-8 text-primary-foreground">
              <motion.span
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
                className="mx-auto flex size-16 items-center justify-center rounded-full bg-white/20"
              >
                <PartyPopper className="size-8" />
              </motion.span>
              <h1 className="mt-4 text-2xl font-extrabold">{t.booking.success}</h1>
              <p className="mt-1.5 text-sm opacity-90">{t.booking.successBody}</p>
            </div>

            <div className="space-y-5 p-7">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t.token.yourToken}
                </p>
                <p className="mt-1 text-6xl font-extrabold tracking-tight text-primary">
                  #{created.tokenNumber}
                </p>
                <p className="mt-1.5 font-mono text-sm text-muted-foreground">{created.tokenCode}</p>
              </div>

              <div className="space-y-2.5 rounded-[var(--radius)] bg-muted p-4 text-left text-sm">
                <Row label={t.token.centre} value={created.center?.name} />
                <Row label={t.common.date} value={dayjs(created.slotDate).format('DD MMM YYYY')} />
                <Row label={t.token.slot} value={`${created.slotStart} – ${created.slotEnd}`} />
                <Row
                  label={t.token.quantity}
                  value={`${created.quantityQuintals} ${t.common.quintals}`}
                />
                <Row label={t.token.amount} value={formatINR(created.payment?.amount)} />
              </div>

              <div className="flex flex-col gap-2.5 sm:flex-row">
                <Button asChild size="lg" className="flex-1">
                  <Link to={`/tokens/${created._id}`}>
                    <Ticket className="size-4" />
                    {t.booking.viewToken}
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onClick={() => {
                    setCreated(null);
                    setStep(1);
                    setSlotStart('');
                    setDate('');
                  }}
                >
                  {t.booking.bookAnother}
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  /* ----------------------------------------------------------- wizard view */
  const stepLabels = [t.booking.stepCentre, t.booking.stepDate, t.booking.stepSlot, t.booking.stepCrop];
  const canNext =
    step === 1 ? Boolean(centerId)
      : step === 2 ? Boolean(date)
        : step === 3 ? Boolean(slotStart)
          : Boolean(commodity && Number(quantity) >= 0.5);

  return (
    <div className="container py-10">
      <PageHeader
        title={t.booking.title}
        subtitle={t.booking.subtitle}
        icon={<CalendarCheck className="size-7 text-primary" />}
      />

      {/* step rail */}
      <div className="mb-8 flex items-center gap-2">
        {stepLabels.map((label, index) => {
          const num = index + 1;
          const done = step > num;
          const active = step === num;
          return (
            <div key={label} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => done && setStep(num)}
                className={cn(
                  'flex items-center gap-2 rounded-full px-2.5 py-1.5 transition-colors',
                  done && 'cursor-pointer hover:bg-muted'
                )}
              >
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    done && 'bg-primary text-primary-foreground',
                    active && 'border-2 border-primary text-primary',
                    !done && !active && 'bg-muted text-muted-foreground'
                  )}
                >
                  {done ? <Check className="size-4" /> : num}
                </span>
                <span
                  className={cn(
                    'hidden text-sm font-semibold sm:block',
                    !done && !active && 'text-muted-foreground'
                  )}
                >
                  {label}
                </span>
              </button>
              {index < stepLabels.length - 1 && (
                <span className={cn('h-0.5 flex-1 rounded', done ? 'bg-primary' : 'bg-border')} />
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-6">
          <AnimatePresence mode="wait">
            {/* ---- step 1: centre */}
            {step === 1 && (
              <StepShell key="s1">
                <h2 className="mb-4 text-lg font-bold">{t.booking.stepCentre}</h2>
                <div className="grid max-h-[30rem] gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
                  {centers.map((c) => (
                    <button
                      key={c._id}
                      type="button"
                      onClick={() => setCenterId(c._id)}
                      className={cn(
                        'rounded-[var(--radius)] border-2 p-4 text-left transition-all',
                        centerId === c._id
                          ? 'border-primary bg-primary/5 shadow-md'
                          : 'border-border hover:border-primary/40 hover:bg-muted'
                      )}
                    >
                      <p className="font-mono text-xs font-bold text-primary">{c.code}</p>
                      <p className="mt-1 font-bold leading-tight">
                        {lang === 'hi' && c.nameHi ? c.nameHi : c.name}
                      </p>
                      <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="mt-0.5 size-3.5 shrink-0" />
                        <span className="line-clamp-1">{c.district}, {c.state}</span>
                      </p>
                      <span
                        className={cn(
                          'mt-2.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold',
                          STATUS_COLORS[c.todayStatus || 'open']
                        )}
                      >
                        {c.todayRemaining} {t.centres.remaining}
                      </span>
                    </button>
                  ))}
                </div>
              </StepShell>
            )}

            {/* ---- step 2: date */}
            {step === 2 && (
              <StepShell key="s2">
                <h2 className="mb-4 text-lg font-bold">{t.booking.stepDate}</h2>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {schedule.map((day) => {
                    const disabled = day.status === 'closed' || day.status === 'full';
                    return (
                      <button
                        key={day.date}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setDate(day.date);
                          setSlotStart('');
                        }}
                        className={cn(
                          'rounded-[var(--radius)] border-2 p-3 text-left transition-all',
                          date === day.date
                            ? 'border-primary bg-primary/5 shadow-md'
                            : 'border-border hover:border-primary/40 hover:bg-muted',
                          disabled && 'cursor-not-allowed opacity-50'
                        )}
                      >
                        <p className="text-xs font-semibold text-muted-foreground">{day.weekday}</p>
                        <p className="text-lg font-extrabold">{dayjs(day.date).format('DD MMM')}</p>
                        <span
                          className={cn(
                            'mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold',
                            STATUS_COLORS[day.status]
                          )}
                        >
                          {day.remaining} {t.centres.remaining}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </StepShell>
            )}

            {/* ---- step 3: slot */}
            {step === 3 && (
              <StepShell key="s3">
                <h2 className="mb-4 text-lg font-bold">
                  {t.booking.stepSlot} · {dayjs(date).format('DD MMM')}
                </h2>
                {slots.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">{t.schedule.noSlots}</p>
                ) : (
                  <div className="grid max-h-[28rem] grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3">
                    {slots.map((s) => (
                      <button
                        key={s.start}
                        type="button"
                        disabled={!s.isAvailable}
                        onClick={() => setSlotStart(s.start)}
                        className={cn(
                          'rounded-[var(--radius)] border-2 p-3 transition-all',
                          slotStart === s.start
                            ? 'border-primary bg-primary/5 shadow-md'
                            : 'border-border hover:border-primary/40 hover:bg-muted',
                          !s.isAvailable && 'cursor-not-allowed border-dashed opacity-50'
                        )}
                      >
                        <p className="font-bold tabular-nums">{s.start}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.isAvailable ? `${s.remaining} ${t.schedule.slotsLeft}` : t.schedule.slotFull}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </StepShell>
            )}

            {/* ---- step 4: crop */}
            {step === 4 && (
              <StepShell key="s4">
                <h2 className="mb-4 text-lg font-bold">{t.booking.stepCrop}</h2>

                <div className="space-y-5">
                  <div>
                    <Label>{t.booking.commodity}</Label>
                    <div className="flex flex-wrap gap-2">
                      {(center?.commodities || []).map((code) => {
                        const item = commodities.find((c) => c.code === code);
                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() => setCommodity(code)}
                            className={cn(
                              'flex items-center gap-2 rounded-[var(--radius)] border-2 px-4 py-2.5 font-semibold transition-colors',
                              commodity === code
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-input hover:bg-muted'
                            )}
                          >
                            <Wheat className="size-4" />
                            {item ? (lang === 'hi' ? item.hi : item.en) : code}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="qty">{t.booking.quantity}</Label>
                    <Input
                      id="qty"
                      inputMode="decimal"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ''))}
                      icon={<Sprout />}
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">{t.booking.quantityHint}</p>
                  </div>

                  <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border-2 border-input p-4 transition-colors hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={priority}
                      onChange={(e) => setPriority(e.target.checked)}
                      className="mt-0.5 size-5 accent-[hsl(var(--primary))]"
                    />
                    <span>
                      <span className="block font-semibold">{t.booking.priority}</span>
                      <span className="block text-xs text-muted-foreground">{t.booking.priorityHint}</span>
                    </span>
                  </label>
                </div>
              </StepShell>
            )}
          </AnimatePresence>

          <div className="mt-7 flex gap-3 border-t pt-5">
            {step > 1 && (
              <Button variant="outline" size="lg" onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft className="size-4" />
                {t.register.back}
              </Button>
            )}
            {step < 4 ? (
              <Button size="lg" className="flex-1" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
                {t.register.next}
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button size="lg" className="flex-1" loading={submitting} disabled={!canNext} onClick={submit}>
                <Ticket className="size-4" />
                {t.booking.confirm}
              </Button>
            )}
          </div>
        </Card>

        {/* ---- summary + AI slot suggestions */}
        <div className="space-y-5">
          <Reveal>
            <Card className="p-6">
              <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                {t.booking.title}
              </h3>
              <div className="space-y-2.5 text-sm">
                <Row label={t.booking.stepCentre} value={center?.name} />
                <Row label={t.common.date} value={date ? dayjs(date).format('DD MMM YYYY') : undefined} />
                <Row label={t.token.slot} value={slot ? `${slot.start} – ${slot.end}` : undefined} />
                <Row
                  label={t.booking.commodity}
                  value={
                    commodity
                      ? lang === 'hi'
                        ? commodities.find((c) => c.code === commodity)?.hi
                        : commodities.find((c) => c.code === commodity)?.en
                      : undefined
                  }
                />
                <Row label={t.token.quantity} value={quantity ? `${quantity} ${t.common.quintals}` : undefined} />
              </div>

              {estimate > 0 && (
                <div className="mt-5 rounded-[var(--radius)] bg-primary/10 p-4">
                  <p className="text-xs font-semibold text-primary">{t.booking.estimate}</p>
                  <p className="mt-1 text-2xl font-extrabold text-primary">{formatINR(estimate)}</p>
                </div>
              )}

              {user && (
                <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">
                  {user.name} ·{' '}
                  <span className="font-mono">{(user as { farmerId?: string }).farmerId}</span>
                </p>
              )}
            </Card>
          </Reveal>

          {suggestions.length > 0 && (
            <Reveal delay={0.1}>
              <Card className="border-secondary/40 bg-secondary/5 p-6">
                <div className="mb-1.5 flex items-center gap-2">
                  <Sparkles className="size-4 text-secondary" />
                  <h3 className="text-sm font-bold">{t.booking.recommended}</h3>
                </div>
                <p className="mb-4 text-xs text-muted-foreground">{t.booking.recommendedHint}</p>

                <div className="space-y-2">
                  {suggestions.slice(0, 4).map((s) => (
                    <button
                      key={`${s.date}-${s.slot_start}`}
                      type="button"
                      onClick={() => {
                        setDate(s.date);
                        setSlotStart(s.slot_start);
                        setStep(4);
                      }}
                      className="flex w-full items-center justify-between rounded-[var(--radius)] border bg-card p-3 text-left transition-colors hover:border-secondary"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold">
                          {dayjs(s.date).format('DD MMM')} · {s.slot_start}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {lang === 'hi' ? s.reason_hi : s.reason_en}
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        <Clock className="size-3" />
                        {humanMinutes(s.expected_wait_minutes)}
                      </Badge>
                    </button>
                  ))}
                </div>
              </Card>
            </Reveal>
          )}
        </div>
      </div>
    </div>
  );
}

function StepShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.25 }}
    >
      {children}
    </motion.div>
  );
}

function Row({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-semibold">{value ?? '—'}</span>
    </div>
  );
}
