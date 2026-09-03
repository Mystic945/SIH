import { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Clock, MessageSquareWarning, Search, XCircle } from 'lucide-react';

import { api, errorMessage, type Grievance } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, LoadingState, PageHeader, StatCard } from '@/components/shared';
import { Reveal } from '@/components/ui/motion-primitives';
import { getSocket, joinAdmin } from '@/lib/socket';
import { cn, relativeTime } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  IN_REVIEW: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  RESOLVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

interface Summary {
  total: number;
  slaBreached: number;
  OPEN?: number;
  IN_REVIEW?: number;
  RESOLVED?: number;
  REJECTED?: number;
}

export default function AdminGrievances() {
  const { t } = useI18n();
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, slaBreached: 0 });
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const [active, setActive] = useState<Grievance | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/admin/grievances${status === 'all' ? '' : `?status=${status}`}`);
      setGrievances(data.data);
      setSummary(data.summary);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    joinAdmin();
    const socket = getSocket();
    const onUpdate = () => load();
    socket.on('grievance:updated', onUpdate);
    return () => {
      socket.off('grievance:updated', onUpdate);
    };
  }, [load]);

  const respond = async (nextStatus?: string) => {
    if (!active || message.trim().length < 2) {
      toast.error(t.admin.responsePlaceholder);
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.patch(`/admin/grievances/${active._id}`, {
        message,
        status: nextStatus,
        resolutionNote: nextStatus === 'RESOLVED' ? message : undefined,
      });
      toast.success(data.message);
      setActive(null);
      setMessage('');
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const visible = grievances.filter((g) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [g.ticketId, g.subject, g.farmer?.name, g.farmer?.phone].some((field) =>
      String(field || '').toLowerCase().includes(q)
    );
  });

  if (loading) return <LoadingState />;

  return (
    <div className="container py-10">
      <PageHeader
        title={t.admin.grievanceQueue}
        icon={<MessageSquareWarning className="size-7 text-primary" />}
        actions={
          <>
            <Input
              placeholder={t.common.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              icon={<Search />}
              className="w-full sm:w-56"
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.myTokens.all}</SelectItem>
                {(['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'] as const).map((s) => (
                  <SelectItem key={s} value={s}>{t.status[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      <div className="mb-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t.status.OPEN} value={summary.OPEN ?? 0} icon={<Clock className="size-5" />} accent="amber" />
        <StatCard label={t.status.IN_REVIEW} value={summary.IN_REVIEW ?? 0} icon={<Search className="size-5" />} accent="sky" delay={0.06} />
        <StatCard label={t.status.RESOLVED} value={summary.RESOLVED ?? 0} icon={<CheckCircle2 className="size-5" />} accent="emerald" delay={0.12} />
        <StatCard label={t.admin.slaBreached} value={summary.slaBreached} icon={<AlertTriangle className="size-5" />} accent="rose" delay={0.18} />
      </div>

      {visible.length === 0 ? (
        <EmptyState title={t.grievance.empty} icon={<MessageSquareWarning className="size-7" />} />
      ) : (
        <div className="space-y-3">
          {visible.map((grievance, index) => (
            <Reveal key={grievance._id} delay={Math.min(index * 0.04, 0.3)}>
              <Card
                className={cn(
                  'cursor-pointer p-5 transition-shadow hover:shadow-lg',
                  grievance.isBreached && 'border-l-4 border-l-destructive'
                )}
                onClick={() => {
                  setActive(grievance);
                  setMessage('');
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{grievance.ticketId}</span>
                      <span
                        className={cn('rounded-full px-2 py-0.5 text-xs font-bold', STATUS_STYLES[grievance.status])}
                      >
                        {t.status[grievance.status]}
                      </span>
                      <Badge variant={grievance.priority === 'HIGH' ? 'danger' : 'muted'}>
                        {t.status[grievance.priority]}
                      </Badge>
                      {grievance.isBreached && (
                        <Badge variant="danger">
                          <AlertTriangle className="size-3" />
                          {t.admin.slaBreached}
                        </Badge>
                      )}
                    </div>

                    <h3 className="mt-1.5 font-bold">{grievance.subject}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{grievance.description}</p>

                    <p className="mt-2.5 text-xs text-muted-foreground">
                      {grievance.farmer?.name} · +91 {grievance.farmer?.phone} · {grievance.center?.code}
                      {grievance.booking?.tokenCode ? ` · ${grievance.booking.tokenCode}` : ''}
                    </p>
                  </div>

                  <div className="text-right text-xs text-muted-foreground">
                    <p>{relativeTime(grievance.createdAt)}</p>
                    <p className="mt-1">
                      {grievance.ageHours}h / {grievance.slaHours}h
                    </p>
                  </div>
                </div>
              </Card>
            </Reveal>
          ))}
        </div>
      )}

      <Dialog open={Boolean(active)} onOpenChange={(v) => !v && setActive(null)}>
        <DialogContent className="max-w-xl">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle>{active.subject}</DialogTitle>
                <DialogDescription>
                  {active.ticketId} · {active.farmer?.name} · +91 {active.farmer?.phone} ·{' '}
                  {dayjs(active.createdAt).format('DD MMM YYYY')}
                </DialogDescription>
              </DialogHeader>

              <p className="rounded-[var(--radius)] bg-muted p-4 text-sm leading-relaxed">
                {active.description}
              </p>

              {active.booking && (
                <div className="rounded-[var(--radius)] border p-3.5 text-sm">
                  <p className="font-mono text-xs text-muted-foreground">{active.booking.tokenCode}</p>
                  <p className="mt-1">
                    {active.booking.commodity} · {active.booking.quantityQuintals} {t.common.quintals} ·{' '}
                    {dayjs(active.booking.slotDate).format('DD MMM')}
                  </p>
                </div>
              )}

              {active.responses.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-bold">{t.grievance.conversation}</h4>
                  <ol className="space-y-2">
                    {active.responses.map((response, index) => (
                      <li
                        key={index}
                        className={cn(
                          'rounded-[var(--radius)] p-3 text-sm',
                          response.role === 'FARMER' ? 'bg-primary/10' : 'bg-muted'
                        )}
                      >
                        <p className="mb-1 text-xs font-bold text-muted-foreground">
                          {response.by} · {relativeTime(response.at)}
                        </p>
                        {response.message}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {!['RESOLVED', 'REJECTED'].includes(active.status) ? (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="response">{t.admin.respond}</Label>
                    <Textarea
                      id="response"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={t.admin.responsePlaceholder}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" loading={saving} onClick={() => respond('IN_REVIEW')}>
                      {t.admin.markReview}
                    </Button>
                    <Button loading={saving} onClick={() => respond('RESOLVED')}>
                      <CheckCircle2 className="size-4" />
                      {t.admin.markResolved}
                    </Button>
                    <Button variant="destructive" loading={saving} onClick={() => respond('REJECTED')}>
                      <XCircle className="size-4" />
                      {t.admin.reject}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-[var(--radius)] border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide">{t.grievance.resolution}</p>
                  {active.resolutionNote}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
