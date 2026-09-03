import { useEffect, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { BarChart3, Banknote, Building2, CheckCircle2, Timer, Users, Wheat } from 'lucide-react';

import { api, errorMessage } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ErrorState, LoadingState, PageHeader, StatCard } from '@/components/shared';
import { NumberTicker, PulseDot, Reveal } from '@/components/ui/motion-primitives';
import { cn, formatDuration, formatINR, formatNumber } from '@/lib/utils';

const PALETTE = ['#15803d', '#f59e0b', '#0ea5e9', '#8b5cf6', '#ef4444', '#14b8a6'];

interface Overview {
  date: string;
  totals: { centers: number; farmers: number; tokens_all_time: number; quintals_procured: number; amount_disbursed: number };
  today: { tokens_booked: number; tokens_served: number; quintals: number; amount: number; avg_turnaround_minutes: number };
  by_commodity: { commodity: string; tokens: number; quintals: number; amount: number }[];
  by_state: { state: string; tokens: number; quintals: number; amount: number }[];
  top_centers: { center_id: string; name: string; code: string; district: string; state: string; booked: number; served: number; capacity: number; load_pct: number }[];
  grievances: { total: number; open: number; in_review: number; resolved: number; resolution_rate_pct: number };
}

interface Trend {
  date: string;
  booked: number;
  served: number;
  quintals: number;
  amount: number;
  avg_turnaround_minutes: number;
}

export default function Transparency() {
  const { t } = useI18n();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [overviewRes, trendsRes] = await Promise.all([
        api.get('/intel/analytics/overview'),
        api.get('/intel/analytics/trends?days=14'),
      ]);
      setOverview(overviewRes.data.data);
      setTrends(trendsRes.data.data);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Public board refreshes on a slow interval; no socket needed here.
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  if (loading) return <LoadingState />;
  if (error || !overview) {
    return <div className="container py-10"><ErrorState message={error} onRetry={load} /></div>;
  }

  const chartTrends = trends.map((point) => ({
    ...point,
    label: dayjs(point.date).format('DD MMM'),
  }));

  return (
    <div className="container py-10">
      <PageHeader
        title={t.transparency.title}
        subtitle={t.transparency.subtitle}
        icon={<BarChart3 className="size-7 text-primary" />}
        actions={
          <Badge variant="success" className="px-3 py-2">
            <PulseDot />
            {t.token.live} · {dayjs(overview.date).format('DD MMM YYYY')}
          </Badge>
        }
      />

      {/* --------------------------------------------------------- headline */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t.stats.centres}
          value={<NumberTicker value={overview.totals.centers} />}
          hint={`${formatNumber(overview.totals.farmers)} ${t.stats.farmers.toLowerCase()}`}
          icon={<Building2 className="size-5" />}
        />
        <StatCard
          label={t.stats.quintals}
          value={<NumberTicker value={Math.round(overview.totals.quintals_procured)} />}
          hint={`${t.common.today}: ${formatNumber(overview.today.quintals)}`}
          icon={<Wheat className="size-5" />}
          accent="amber"
          delay={0.06}
        />
        <StatCard
          label={t.stats.disbursed}
          value={formatINR(overview.totals.amount_disbursed, true)}
          hint={`${t.common.today}: ${formatINR(overview.today.amount, true)}`}
          icon={<Banknote className="size-5" />}
          accent="emerald"
          delay={0.12}
        />
        <StatCard
          label={t.stats.avgWait}
          value={formatDuration(overview.today.avg_turnaround_minutes)}
          hint={`${overview.today.tokens_served} / ${overview.today.tokens_booked} ${t.admin.completed.toLowerCase()}`}
          icon={<Timer className="size-5" />}
          accent="sky"
          delay={0.18}
        />
      </div>

      {/* ----------------------------------------------------------- trend */}
      <Reveal delay={0.1} className="mt-6">
        <Card className="p-6">
          <h2 className="mb-5 text-lg font-bold">{t.transparency.trend}</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartTrends} margin={{ top: 5, right: 5, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="bookedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#15803d" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#15803d" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="servedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '0.75rem',
                    fontSize: 13,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <Area
                  type="monotone"
                  dataKey="booked"
                  name={t.admin.booked}
                  stroke="#15803d"
                  strokeWidth={2.5}
                  fill="url(#bookedFill)"
                />
                <Area
                  type="monotone"
                  dataKey="served"
                  name={t.admin.completed}
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  fill="url(#servedFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </Reveal>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* ------------------------------------------------- by commodity */}
        <Reveal delay={0.12}>
          <Card className="p-6">
            <h2 className="mb-5 text-lg font-bold">{t.transparency.byCommodity}</h2>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={overview.by_commodity}
                    dataKey="quintals"
                    nameKey="commodity"
                    innerRadius="52%"
                    outerRadius="82%"
                    paddingAngle={3}
                  >
                    {overview.by_commodity.map((_, index) => (
                      <Cell key={index} fill={PALETTE[index % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`${formatNumber(value)} ${t.common.quintals}`, '']}
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '0.75rem',
                      fontSize: 13,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Reveal>

        {/* ----------------------------------------------------- by state */}
        <Reveal delay={0.16}>
          <Card className="p-6">
            <h2 className="mb-5 text-lg font-bold">{t.transparency.byState}</h2>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overview.by_state} margin={{ top: 5, right: 5, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="state"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                    interval={0}
                    angle={-18}
                    textAnchor="end"
                    height={58}
                  />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    formatter={(value: number) => [`${formatNumber(value)} ${t.common.quintals}`, '']}
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '0.75rem',
                      fontSize: 13,
                    }}
                  />
                  <Bar dataKey="quintals" radius={[6, 6, 0, 0]}>
                    {overview.by_state.map((_, index) => (
                      <Cell key={index} fill={PALETTE[index % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Reveal>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* -------------------------------------------------- top centres */}
        <Reveal delay={0.2}>
          <Card className="p-6">
            <h2 className="mb-5 text-lg font-bold">{t.transparency.busiest}</h2>
            <div className="space-y-3">
              {overview.top_centers.map((center) => (
                <div key={center.center_id} className="rounded-[var(--radius)] bg-muted/50 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{center.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {center.district}, {center.state}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold tabular-nums">
                        {center.booked} / {center.capacity}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.transparency.loadPct} {center.load_pct}%
                      </p>
                    </div>
                  </div>
                  <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-border">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        center.load_pct >= 95 ? 'bg-destructive'
                          : center.load_pct >= 75 ? 'bg-amber-500'
                            : 'bg-primary'
                      )}
                      style={{ width: `${Math.min(center.load_pct, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>

        {/* -------------------------------------------------- grievances */}
        <Reveal delay={0.24}>
          <Card className="p-6">
            <h2 className="mb-5 text-lg font-bold">{t.transparency.grievanceHealth}</h2>

            <div className="text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-7" />
              </span>
              <p className="mt-4 text-4xl font-extrabold tracking-tight">
                <NumberTicker value={overview.grievances.resolution_rate_pct} decimals={1} suffix="%" />
              </p>
              <p className="text-sm text-muted-foreground">{t.transparency.resolutionRate}</p>
            </div>

            <dl className="mt-6 space-y-2.5 text-sm">
              <Row label={t.status.OPEN} value={overview.grievances.open} />
              <Row label={t.status.IN_REVIEW} value={overview.grievances.in_review} />
              <Row label={t.status.RESOLVED} value={overview.grievances.resolved} />
              <Row label="Total" value={overview.grievances.total} bold />
            </dl>

            <div className="mt-6 flex items-center gap-2 rounded-[var(--radius)] bg-muted p-3.5 text-xs text-muted-foreground">
              <Users className="size-4 shrink-0" />
              {t.transparency.dataNote}
            </div>
          </Card>
        </Reveal>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between border-b pb-2 last:border-0', bold && 'font-bold')}>
      <dt className={cn(!bold && 'text-muted-foreground')}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
