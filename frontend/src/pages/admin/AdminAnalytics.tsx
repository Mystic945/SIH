import { useCallback, useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { BarChart3, Radio, Send, Sparkles, TrendingUp, Users } from 'lucide-react';

import { api, errorMessage, type AppNotification } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Textarea } from '@/components/ui/input';
import { ErrorState, LoadingState, PageHeader, StatCard } from '@/components/shared';
import { Reveal } from '@/components/ui/motion-primitives';
import { cn, formatDuration, formatINR, formatNumber, relativeTime, todayISO } from '@/lib/utils';

interface CenterAnalytics {
  center_name: string;
  date: string;
  funnel: Record<string, number>;
  hourly_load: { hour: string; booked: number; served: number }[];
  stage_durations: { stage: string; avg_minutes: number; p90_minutes: number; samples: number }[];
  avg_wait_minutes: number;
  avg_turnaround_minutes: number;
  throughput_per_hour: number;
  capacity_used_pct: number;
  quintals_procured: number;
  amount_disbursed: number;
  no_show_rate_pct: number;
}

interface Forecast {
  center_name: string;
  method: string;
  baseline_daily_avg: number;
  points: {
    date: string;
    weekday: string;
    predicted_footfall: number;
    lower_bound: number;
    upper_bound: number;
    recommended_counters: number;
    congestion_risk: 'low' | 'medium' | 'high';
  }[];
}

const RISK_STYLES: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  high: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

export default function AdminAnalytics() {
  const { t } = useI18n();
  const { user } = useAuth();
  const centerId = (user as { center?: { _id?: string } })?.center?._id;

  const [analytics, setAnalytics] = useState<CenterAnalytics | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [trends, setTrends] = useState<{ date: string; booked: number; served: number }[]>([]);
  const [outbox, setOutbox] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [broadcast, setBroadcast] = useState({
    date: todayISO(),
    messageEn: 'AgriQueue: Please carry your Farmer ID and bank passbook when you arrive at the centre.',
    messageHi: 'AgriQueue: केंद्र पर आते समय कृपया अपना किसान ID और बैंक पासबुक साथ लाएं।',
  });
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!centerId) return;
    try {
      const [analyticsRes, forecastRes, trendsRes, outboxRes] = await Promise.all([
        api.get(`/intel/analytics/center/${centerId}`),
        api.get(`/intel/forecast/${centerId}?days=7`),
        api.get(`/intel/analytics/trends?center_id=${centerId}&days=14`),
        api.get('/notifications/feed?limit=25'),
      ]);
      setAnalytics(analyticsRes.data.data);
      setForecast(forecastRes.data.data);
      setTrends(trendsRes.data.data);
      setOutbox(outboxRes.data.data);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [centerId]);

  useEffect(() => {
    load();
  }, [load]);

  const sendBroadcast = async () => {
    if (!centerId) return;
    setSending(true);
    try {
      const { data } = await api.post('/intel/admin/notify/broadcast', {
        center_id: centerId,
        date: broadcast.date,
        stages: ['BOOKED'],
        channel: 'SMS',
        message_en: broadcast.messageEn,
        message_hi: broadcast.messageHi,
      });
      toast.success(`${data.data.dispatched} / ${data.data.matched} alerts dispatched`);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  if (loading) return <LoadingState />;
  if (error || !analytics) {
    return <div className="container py-10"><ErrorState message={error} onRetry={load} /></div>;
  }

  const funnelData = ['BOOKED', 'ARRIVED', 'QUALITY_CHECK', 'WEIGHMENT', 'PAYMENT_INITIATED', 'PAID'].map(
    (stage) => ({ stage: t.stages[stage as keyof typeof t.stages], count: analytics.funnel[stage] || 0 })
  );

  const trendData = trends.map((point) => ({ ...point, label: dayjs(point.date).format('DD MMM') }));

  return (
    <div className="container py-10">
      <PageHeader
        title={t.admin.analytics}
        subtitle={`${analytics.center_name} · ${dayjs(analytics.date).format('DD MMM YYYY')}`}
        icon={<BarChart3 className="size-7 text-primary" />}
        actions={
          <Badge variant="outline" className="px-3 py-2">
            <Sparkles className="size-3.5" />
            FastAPI
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label={t.admin.avgTurnaround} value={formatDuration(analytics.avg_turnaround_minutes)} icon={<TrendingUp className="size-5" />} />
        <StatCard label="Avg wait" value={formatDuration(analytics.avg_wait_minutes)} icon={<Users className="size-5" />} accent="sky" delay={0.05} />
        <StatCard label="Throughput / hr" value={analytics.throughput_per_hour} icon={<Radio className="size-5" />} accent="violet" delay={0.1} />
        <StatCard label={t.transparency.loadPct} value={`${analytics.capacity_used_pct}%`} icon={<BarChart3 className="size-5" />} accent="amber" delay={0.15} />
        <StatCard label={t.stats.quintals} value={formatNumber(analytics.quintals_procured, 1)} icon={<TrendingUp className="size-5" />} accent="emerald" delay={0.2} />
        <StatCard label="No-show rate" value={`${analytics.no_show_rate_pct}%`} hint={formatINR(analytics.amount_disbursed, true)} icon={<Users className="size-5" />} accent="rose" delay={0.25} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* ---------------------------------------------------- hourly load */}
        <Reveal delay={0.1}>
          <Card className="p-6">
            <h2 className="mb-5 text-lg font-bold">Hourly load</h2>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.hourly_load} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
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
                  <Bar dataKey="booked" name={t.admin.booked} fill="#15803d" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="served" name={t.admin.completed} fill="#f59e0b" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Reveal>

        {/* -------------------------------------------------------- funnel */}
        <Reveal delay={0.14}>
          <Card className="p-6">
            <h2 className="mb-5 text-lg font-bold">Pipeline funnel</h2>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData} layout="vertical" margin={{ top: 5, right: 16, left: 24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis
                    type="category"
                    dataKey="stage"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                    width={96}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '0.75rem',
                      fontSize: 13,
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 5, 5, 0]}>
                    {funnelData.map((_, index) => (
                      <Cell
                        key={index}
                        fill={['#64748b', '#0ea5e9', '#8b5cf6', '#f59e0b', '#6366f1', '#16a34a'][index]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Reveal>
      </div>

      {/* --------------------------------------------------------- forecast */}
      {forecast && (
        <Reveal delay={0.18} className="mt-6">
          <Card className="p-6">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">{t.admin.forecast}</h2>
              <Badge variant="muted">baseline {forecast.baseline_daily_avg}/day</Badge>
            </div>
            <p className="mb-5 text-xs text-muted-foreground">{forecast.method}</p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {forecast.points.map((point) => (
                <div key={point.date} className="rounded-[var(--radius)] border p-3.5">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {point.weekday} · {dayjs(point.date).format('DD MMM')}
                  </p>
                  <p className="mt-1 text-2xl font-extrabold tabular-nums">{point.predicted_footfall}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {point.lower_bound}–{point.upper_bound}
                  </p>
                  <span
                    className={cn(
                      'mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold',
                      RISK_STYLES[point.congestion_risk]
                    )}
                  >
                    {point.congestion_risk}
                  </span>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {point.recommended_counters} {t.admin.recommendedCounters}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
      )}

      {/* ---------------------------------------------------------- trend */}
      <Reveal delay={0.22} className="mt-6">
        <Card className="p-6">
          <h2 className="mb-5 text-lg font-bold">{t.transparency.trend}</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
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
                <Line type="monotone" dataKey="booked" name={t.admin.booked} stroke="#15803d" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="served" name={t.admin.completed} stroke="#f59e0b" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </Reveal>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* ----------------------------------------------------- broadcast */}
        <Reveal delay={0.26}>
          <Card className="p-6">
            <h2 className="text-lg font-bold">{t.admin.broadcast}</h2>
            <p className="mb-5 mt-1 text-xs text-muted-foreground">{t.admin.broadcastHint}</p>

            <div className="space-y-4">
              <div>
                <Label htmlFor="bdate">{t.common.date}</Label>
                <Input
                  id="bdate"
                  type="date"
                  value={broadcast.date}
                  onChange={(e) => setBroadcast((b) => ({ ...b, date: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="men">English</Label>
                <Textarea
                  id="men"
                  className="min-h-[70px]"
                  value={broadcast.messageEn}
                  onChange={(e) => setBroadcast((b) => ({ ...b, messageEn: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="mhi">हिन्दी</Label>
                <Textarea
                  id="mhi"
                  className="min-h-[70px]"
                  value={broadcast.messageHi}
                  onChange={(e) => setBroadcast((b) => ({ ...b, messageHi: e.target.value }))}
                />
              </div>
              <Button className="w-full" size="lg" loading={sending} onClick={sendBroadcast}>
                <Send className="size-4" />
                {t.admin.broadcast}
              </Button>
              <p className="text-xs text-muted-foreground">
                Each farmer receives the version matching the language on their profile.
              </p>
            </div>
          </Card>
        </Reveal>

        {/* -------------------------------------------------------- outbox */}
        <Reveal delay={0.3}>
          <Card className="p-6">
            <h2 className="mb-5 text-lg font-bold">{t.admin.outbox}</h2>
            <div className="max-h-[26rem] space-y-2.5 overflow-y-auto pr-1">
              {outbox.map((notification) => (
                <div key={notification._id} className="rounded-[var(--radius)] border p-3.5 text-sm">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <Badge variant="muted">{notification.channel}</Badge>
                    <Badge variant={notification.dispatchedBy === 'fastapi' ? 'secondary' : 'default'}>
                      {notification.dispatchedBy === 'fastapi' ? 'FastAPI' : 'Express'}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {relativeTime(notification.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    +91 {notification.phone}
                    {notification.farmer?.name ? ` · ${notification.farmer.name}` : ''}
                  </p>
                  <p className="mt-1 line-clamp-2 leading-relaxed" lang={notification.lang}>
                    {notification.message}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
      </div>

      {/* ------------------------------------------------- stage durations */}
      <Reveal delay={0.34} className="mt-6">
        <Card className="p-6">
          <h2 className="mb-5 text-lg font-bold">Measured stage durations (last 7 days)</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2.5 pr-3 font-semibold">Stage</th>
                  <th className="pb-2.5 pr-3 font-semibold">Average</th>
                  <th className="pb-2.5 pr-3 font-semibold">P90</th>
                  <th className="pb-2.5 font-semibold">Samples</th>
                </tr>
              </thead>
              <tbody>
                {analytics.stage_durations.map((row) => (
                  <tr key={row.stage} className="border-b last:border-0">
                    <td className="py-2.5 pr-3 font-semibold">
                      {t.stages[row.stage as keyof typeof t.stages]}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums">{row.avg_minutes} min</td>
                    <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">{row.p90_minutes} min</td>
                    <td className="py-2.5 tabular-nums text-muted-foreground">{row.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            These measured values feed every ETA shown to farmers, so the estimate improves as the
            centre processes more tokens.
          </p>
        </Card>
      </Reveal>
    </div>
  );
}
