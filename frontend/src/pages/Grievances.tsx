import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import { AlertTriangle, Clock, MessageSquareWarning, Plus, Send, Ticket } from 'lucide-react';

import { api, errorMessage, type Booking, type Center, type Grievance } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, LoadingState, PageHeader } from '@/components/shared';
import { Reveal } from '@/components/ui/motion-primitives';
import { cn, relativeTime } from '@/lib/utils';

interface CategoryMeta {
  code: string;
  en: string;
  hi: string;
}

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  IN_REVIEW: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  RESOLVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

export default function Grievances() {
  const { t, lang } = useI18n();
  const [params] = useSearchParams();

  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [categories, setCategories] = useState<CategoryMeta[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(Boolean(params.get('booking')));
  const [submitting, setSubmitting] = useState(false);
  const [active, setActive] = useState<Grievance | null>(null);
  const [reply, setReply] = useState('');

  const [form, setForm] = useState({
    centerId: '',
    bookingId: params.get('booking') || '',
    category: '',
    subject: '',
    description: '',
  });

  const load = async () => {
    try {
      const [mine, meta, myBookings, centreList] = await Promise.all([
        api.get('/grievances/mine'),
        api.get('/grievances/meta'),
        api.get('/bookings/mine?status=all'),
        api.get('/centers'),
      ]);
      setGrievances(mine.data.data);
      setCategories(meta.data.data.categories);
      setBookings(myBookings.data.data);
      setCenters(centreList.data.data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Pre-fill the centre when the farmer arrived from a specific token.
  useEffect(() => {
    if (!form.bookingId || form.centerId) return;
    const booking = bookings.find((b) => b._id === form.bookingId);
    if (booking?.center?._id) setForm((f) => ({ ...f, centerId: booking.center._id }));
  }, [form.bookingId, bookings]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit = useMemo(
    () =>
      Boolean(form.centerId && form.category && form.subject.trim().length >= 5 && form.description.trim().length >= 10),
    [form]
  );

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data } = await api.post('/grievances', {
        centerId: form.centerId,
        bookingId: form.bookingId || undefined,
        category: form.category,
        subject: form.subject,
        description: form.description,
      });
      toast.success(data.message);
      setOpen(false);
      setForm({ centerId: '', bookingId: '', category: '', subject: '', description: '' });
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const sendReply = async () => {
    if (!active || reply.trim().length < 2) return;
    try {
      const { data } = await api.post(`/grievances/${active._id}/reply`, { message: reply });
      setActive(data.data);
      setReply('');
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const label = (code: string) => {
    const found = categories.find((c) => c.code === code);
    return found ? (lang === 'hi' ? found.hi : found.en) : code;
  };

  if (loading) return <LoadingState />;

  return (
    <div className="container py-10">
      <PageHeader
        title={t.grievance.title}
        subtitle={t.grievance.subtitle}
        icon={<MessageSquareWarning className="size-7 text-primary" />}
        actions={
          <Button size="lg" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            {t.grievance.raise}
          </Button>
        }
      />

      {grievances.length === 0 ? (
        <EmptyState title={t.grievance.empty} icon={<MessageSquareWarning className="size-7" />} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {grievances.map((grievance, index) => (
            <Reveal key={grievance._id} delay={Math.min(index * 0.05, 0.3)}>
              <Card
                className="cursor-pointer p-5 transition-shadow hover:shadow-lg"
                onClick={() => setActive(grievance)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{grievance.ticketId}</p>
                    <h3 className="mt-1 truncate font-bold">{grievance.subject}</h3>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-1 text-xs font-bold',
                      STATUS_STYLES[grievance.status]
                    )}
                  >
                    {t.status[grievance.status]}
                  </span>
                </div>

                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{grievance.description}</p>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="muted">{label(grievance.category)}</Badge>
                  <Badge variant={grievance.priority === 'HIGH' ? 'danger' : 'muted'}>
                    {t.status[grievance.priority]}
                  </Badge>
                  {grievance.isBreached && (
                    <Badge variant="danger">
                      <AlertTriangle className="size-3" />
                      {t.grievance.overdue}
                    </Badge>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-3.5" />
                    {relativeTime(grievance.createdAt)}
                  </span>
                  <span>
                    {grievance.responses.length} {t.grievance.conversation}
                  </span>
                </div>
              </Card>
            </Reveal>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------- raise dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t.grievance.raise}</DialogTitle>
            <DialogDescription>{t.grievance.subtitle}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>{t.grievance.category}</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t.common.selectPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {lang === 'hi' ? c.hi : c.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t.grievance.relatedToken}</Label>
              <Select
                value={form.bookingId || 'none'}
                onValueChange={(v) => setForm((f) => ({ ...f, bookingId: v === 'none' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t.grievance.noToken} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.grievance.noToken}</SelectItem>
                  {bookings.map((b) => (
                    <SelectItem key={b._id} value={b._id}>
                      {b.tokenCode} · {dayjs(b.slotDate).format('DD MMM')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t.grievance.centre}</Label>
              <Select value={form.centerId} onValueChange={(v) => setForm((f) => ({ ...f, centerId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t.common.selectPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {centers.map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.code} · {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="subject">{t.grievance.subject}</Label>
              <Input
                id="subject"
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder={t.grievance.subjectPlaceholder}
                maxLength={120}
              />
            </div>

            <div>
              <Label htmlFor="description">{t.grievance.description}</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t.grievance.descriptionPlaceholder}
                maxLength={2000}
              />
            </div>

            <Button size="lg" className="w-full" loading={submitting} disabled={!canSubmit} onClick={submit}>
              {t.grievance.submit}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------------- detail dialog */}
      <Dialog open={Boolean(active)} onOpenChange={(v) => !v && setActive(null)}>
        <DialogContent className="max-w-xl">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle>{active.subject}</DialogTitle>
                <DialogDescription>
                  {t.grievance.ticket} {active.ticketId} · {t.grievance.raisedOn}{' '}
                  {dayjs(active.createdAt).format('DD MMM YYYY')}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap gap-2">
                <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', STATUS_STYLES[active.status])}>
                  {t.status[active.status]}
                </span>
                <Badge variant="muted">{label(active.category)}</Badge>
                <Badge variant={active.priority === 'HIGH' ? 'danger' : 'muted'}>
                  {t.status[active.priority]}
                </Badge>
                <Badge variant="outline">
                  {t.grievance.slaNote} {active.slaHours} {t.grievance.hours}
                </Badge>
              </div>

              <p className="rounded-[var(--radius)] bg-muted p-4 text-sm leading-relaxed">
                {active.description}
              </p>

              {active.booking && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Ticket className="size-4" />
                  <span className="font-mono">{active.booking.tokenCode}</span>
                </p>
              )}

              <div>
                <h4 className="mb-2.5 text-sm font-bold">{t.grievance.conversation}</h4>
                {active.responses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  <ol className="space-y-2.5">
                    <AnimatePresence>
                      {active.responses.map((response, index) => (
                        <motion.li
                          key={index}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn(
                            'rounded-[var(--radius)] p-3.5 text-sm',
                            response.role === 'FARMER'
                              ? 'ml-6 bg-primary/10'
                              : 'mr-6 bg-muted'
                          )}
                        >
                          <p className="mb-1 text-xs font-bold text-muted-foreground">
                            {response.by} · {relativeTime(response.at)}
                          </p>
                          {response.message}
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ol>
                )}
              </div>

              {active.resolutionNote && (
                <div className="rounded-[var(--radius)] border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    {t.grievance.resolution}
                  </p>
                  {active.resolutionNote}
                </div>
              )}

              {!['RESOLVED', 'REJECTED'].includes(active.status) && (
                <div className="flex gap-2 border-t pt-4">
                  <Input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={t.grievance.replyPlaceholder}
                    onKeyDown={(e) => e.key === 'Enter' && sendReply()}
                  />
                  <Button onClick={sendReply} disabled={reply.trim().length < 2}>
                    <Send className="size-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
