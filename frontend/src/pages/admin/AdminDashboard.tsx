import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import {
  BellRing, CheckCircle2, ChevronRight, Clock, LayoutDashboard, MessageSquareWarning,
  Radio, Scale, Search, Truck, UserX, Users,
} from 'lucide-react';

import { api, errorMessage, type Booking, type QueueSnapshot, type Stage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ErrorState, LoadingState, PageHeader, StatCard } from '@/components/shared';
import { NumberTicker, PulseDot, Reveal } from '@/components/ui/motion-primitives';
import { StageBadge, StagePipeline } from '@/components/StagePipeline';
import { getSocket, joinAdmin, joinCenter } from '@/lib/socket';
import { cn, formatDuration, formatINR, humanMinutes, todayISO } from '@/lib/utils';

const NEXT_STAGE: Record<string, Stage> = {
  BOOKED: 'ARRIVED',
  ARRIVED: 'QUALITY_CHECK',
  QUALITY_CHECK: 'WEIGHMENT',
  WEIGHMENT: 'PAYMENT_INITIATED',
  PAYMENT_INITIATED: 'PAID',
};

export default function AdminDashboard() {
  const { t, lang } = useI18n();
  const { user } = useAuth();

  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [date, setDate] = useState(todayISO());
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [active, setActive] = useState<Booking | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    note: '',
    moisturePct: '',
    grade: 'A',
    grossQuintals: '',
    netQuintals: '',
    bags: '',
  });

  const centerId = (user as { center?: { _id?: string } })?.center?._id;

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/admin/dashboard?date=${date}`);
      setSnapshot(data.data);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    joinAdmin();
    if (centerId) joinCenter(centerId);
    const socket = getSocket();
    const onQueue = () => load();
    socket.on('queue:updated', onQueue);
    return () => {
      socket.off('queue:updated', onQueue);
    };
  }, [centerId, load]);

  const filtered = useMemo(() => {
    if (!snapshot) return [];
    const q = query.trim().toLowerCase();
    return snapshot.queue.filter((item) => {
      if (stageFilter !== 'all' && item.stage !== stageFilter) return false;
      if (!q) return true;
      return [item.tokenCode, item.farmer?.name, item.farmer?.phone, item.farmer?.farmerId].some((field) =>
        String(field || '').toLowerCase().includes(q)
      );
    });
  }, [snapshot, query, stageFilter]);

  const openStageDialog = (booking: Booking) => {
    setActive(booking);
    setForm({
      note: '',
      moisturePct: String(booking.quality?.moisturePct ?? ''),
      grade: booking.quality?.grade || 'A',
      grossQuintals: String(booking.weighment?.grossQuintals ?? booking.quantityQuintals ?? ''),
      netQuintals: String(booking.weighment?.netQuintals ?? ''),
      bags: String(booking.weighment?.bags ?? ''),
    });
  };

  /** The single action that moves a farmer down the pipeline. */
  const advance = async (booking: Booking, stage?: Stage) => {
    setSaving(true);
    try {
      const next = stage || NEXT_STAGE[booking.stage];
      const payload: Record<string, unknown> = { stage: next, note: form.note || undefined };

      if (next === 'WEIGHMENT' || booking.stage === 'QUALITY_CHECK') {
        payload.quality = {
          moisturePct: form.moisturePct ? Number(form.moisturePct) : undefined,
          grade: form.grade,
        };
      }
      if (next === 'PAYMENT_INITIATED' || booking.stage === 'WEIGHMENT') {
        payload.weighment = {
          grossQuintals: form.grossQuintals ? Number(form.grossQuintals) : undefined,
          netQuintals: form.netQuintals ? Number(form.netQuintals) : undefined,
          bags: form.bags ? Number(form.bags) : undefined,
        };
      }

      const { data } = await api.patch(`/admin/bookings/${booking._id}/stage`, payload);
      toast.success(data.message);
      setActive(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const notify = async (booking: Booking) => {
    try {
      await api.post(`/admin/bookings/${booking._id}/notify`, {});
      toast.success(`${t.admin.notify} → ${booking.farmer?.name}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const markNoShow = async (booking: Booking) => {
    try {
      await api.patch(`/admin/bookings/${booking._id}/no-show`, {});
      toast.success(t.admin.noShow);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (loading) return <LoadingState />;
  if (error || !snapshot) {
    return <div className="container py-10"><ErrorState message={error} onRetry={load} /></div>;
  }

  const { stats } = snapshot;

  return (
    <div className="container py-10">
      <PageHeader
        title={t.admin.title}
        subtitle={lang === 'hi' && snapshot.center.nameHi ? snapshot.center.nameHi : snapshot.center.name}
        icon={<LayoutDashboard className="size-7 text-primary" />}
        actions={
          <>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-auto"
            />
            <Badge variant="success" className="px-3 py-2">
              <PulseDot />
              {t.token.live}
            </Badge>
          </>
        }
      />

      {/* ----------------------------------------------------------- stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label={t.admin.booked}
          value={<NumberTicker value={stats.totalBooked} />}
          hint={`${stats.capacityUsedPct}% ${t.transparency.loadPct.toLowerCase()}`}
          icon={<Users className="size-5" />}
        />
        <StatCard
          label={t.admin.arrived}
          value={<NumberTicker value={stats.inCentre} />}
          hint={`${stats.waiting} ${t.schedule.booked}`}
          icon={<Truck className="size-5" />}
          accent="sky"
          delay={0.05}
        />
        <StatCard
          label={t.admin.completed}
          value={<NumberTicker value={stats.completed} />}
          hint={formatINR(snapshot.payments?.amountPaid, true)}
          icon={<CheckCircle2 className="size-5" />}
          accent="emerald"
          delay={0.1}
        />
        <StatCard
          label={t.admin.capacityLeft}
          value={<NumberTicker value={stats.capacityLeft} />}
          hint={`${t.centres.capacity}: ${snapshot.center.dailyCapacity}`}
          icon={<Scale className="size-5" />}
          accent="amber"
          delay={0.15}
        />
        <StatCard
          label={t.admin.avgTurnaround}
          value={formatDuration(stats.avgTurnaroundMins)}
          hint={`${snapshot.center.activeCounters} ${t.centres.counters}`}
          icon={<Clock className="size-5" />}
          accent="violet"
          delay={0.2}
        />
        <StatCard
          label={t.admin.openComplaints}
          value={<NumberTicker value={snapshot.openGrievances ?? 0} />}
          icon={<MessageSquareWarning className="size-5" />}
          accent="rose"
          delay={0.25}
        />
      </div>

      {/* ----------------------------------------------------- now serving */}
      {snapshot.nowServing && (
        <Reveal delay={0.1} className="mt-6">
          <Card className="border-primary/30 bg-primary/5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div className="flex items-center gap-4">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <Radio className="size-7" />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {t.admin.nowServing}
                  </p>
                  <p className="text-3xl font-extrabold tracking-tight">
                    #{snapshot.nowServing.tokenNumber}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {snapshot.nowServing.farmer?.name} · {snapshot.nowServing.farmer?.village}
                  </p>
                </div>
              </div>

              <div className="flex-1 sm:min-w-[18rem] sm:max-w-md">
                <StagePipeline stage={snapshot.nowServing.stage} />
              </div>

              <Button size="lg" onClick={() => openStageDialog(snapshot.nowServing!)}>
                {t.admin.advance}
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </Card>
        </Reveal>
      )}

      {/* ---------------------------------------------------------- queue */}
      <Reveal delay={0.15} className="mt-6">
        <Card className="p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">
              {t.admin.todayQueue}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {filtered.length} / {snapshot.queue.length}
              </span>
            </h2>

            <div className="flex flex-wrap gap-2">
              <Input
                placeholder={t.admin.searchToken}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                icon={<Search />}
                className="w-full sm:w-64"
              />
              <Select value={stageFilter} onValueChange={setStageFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder={t.admin.allStages} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.admin.allStages}</SelectItem>
                  {Object.keys(NEXT_STAGE).map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {t.stages[stage as Stage]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="py-14 text-center text-sm text-muted-foreground">{t.admin.emptyQueue}</p>
          ) : (
            <div className="space-y-2.5">
              <AnimatePresence initial={false}>
                {filtered.map((item) => (
                  <motion.div
                    key={item._id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className={cn(
                      'flex flex-wrap items-center gap-4 rounded-[var(--radius)] border p-4 transition-colors hover:bg-muted/50',
                      item.inService && 'border-primary/40 bg-primary/5',
                      item.priority && 'border-l-4 border-l-secondary'
                    )}
                  >
                    <div className="w-14 shrink-0 text-center">
                      <p className="text-2xl font-extrabold tabular-nums">#{item.tokenNumber}</p>
                      <p className="text-[10px] text-muted-foreground">
                        #{item.position} in line
                      </p>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{item.farmer?.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.farmer?.village} · +91 {item.farmer?.phone} · {item.commodity}{' '}
                        {item.quantityQuintals} {t.common.quintals}
                      </p>
                    </div>

                    <div className="hidden text-center sm:block">
                      <p className="text-xs text-muted-foreground">{t.token.slot}</p>
                      <p className="font-semibold tabular-nums">{item.slotStart}</p>
                    </div>

                    <div className="hidden text-center md:block">
                      <p className="text-xs text-muted-foreground">{t.token.estWait}</p>
                      <p className="font-semibold tabular-nums">{humanMinutes(item.etaMins)}</p>
                    </div>

                    <StageBadge stage={item.stage} />

                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        title={t.admin.notify}
                        onClick={() => notify(item)}
                      >
                        <BellRing className="size-4" />
                      </Button>
                      {item.stage === 'BOOKED' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title={t.admin.noShow}
                          className="text-destructive"
                          onClick={() => markNoShow(item)}
                        >
                          <UserX className="size-4" />
                        </Button>
                      )}
                      <Button size="sm" onClick={() => openStageDialog(item)}>
                        {item.stage === 'BOOKED' ? t.admin.markArrived : t.admin.advance}
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </Card>
      </Reveal>

      {/* -------------------------------------------------- stage dialog */}
      <Dialog open={Boolean(active)} onOpenChange={(v) => !v && setActive(null)}>
        <DialogContent>
          {active && (
            <>
              <DialogHeader>
                <DialogTitle>
                  #{active.tokenNumber} · {active.farmer?.name}
                </DialogTitle>
                <DialogDescription>
                  {active.tokenCode} · {active.commodity} · {active.quantityQuintals} {t.common.quintals}
                </DialogDescription>
              </DialogHeader>

              <StagePipeline stage={active.stage} history={active.stageHistory} />

              <div className="space-y-4">
                {/* Quality fields matter when leaving QUALITY_CHECK */}
                {active.stage === 'QUALITY_CHECK' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="moisture">{t.token.moisture} (%)</Label>
                      <Input
                        id="moisture"
                        inputMode="decimal"
                        value={form.moisturePct}
                        onChange={(e) => setForm((f) => ({ ...f, moisturePct: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>{t.token.grade}</Label>
                      <Select value={form.grade} onValueChange={(v) => setForm((f) => ({ ...f, grade: v }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['A', 'B', 'C', 'REJECTED'].map((g) => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Weighment fields decide the payable amount */}
                {active.stage === 'WEIGHMENT' && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label htmlFor="gross">{t.token.gross}</Label>
                      <Input
                        id="gross"
                        inputMode="decimal"
                        value={form.grossQuintals}
                        onChange={(e) => setForm((f) => ({ ...f, grossQuintals: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="net">{t.token.net}</Label>
                      <Input
                        id="net"
                        inputMode="decimal"
                        value={form.netQuintals}
                        onChange={(e) => setForm((f) => ({ ...f, netQuintals: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="bags">{t.token.bags}</Label>
                      <Input
                        id="bags"
                        inputMode="numeric"
                        value={form.bags}
                        onChange={(e) => setForm((f) => ({ ...f, bags: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <Label htmlFor="note">
                    {t.admin.details} <span className="font-normal text-muted-foreground">({t.common.optional})</span>
                  </Label>
                  <Textarea
                    id="note"
                    className="min-h-[70px]"
                    value={form.note}
                    onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setActive(null)}>
                  {t.common.close}
                </Button>
                <Button loading={saving} onClick={() => advance(active)}>
                  {t.stages[NEXT_STAGE[active.stage]] || t.admin.advance}
                  <ChevronRight className="size-4" />
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
