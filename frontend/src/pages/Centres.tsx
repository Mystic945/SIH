import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, MapPin, Phone, Search, Sprout, Users, Warehouse } from 'lucide-react';

import { api, errorMessage, type Center, type Commodity } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/shared';
import { Reveal, SpotlightCard } from '@/components/ui/motion-primitives';
import { cn, STATUS_COLORS } from '@/lib/utils';

interface Filters {
  states: string[];
  districts: { state: string; district: string }[];
  commodities: Commodity[];
}

export default function Centres() {
  const { t, lang } = useI18n();
  const [centers, setCenters] = useState<Center[]>([]);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [query, setQuery] = useState('');
  const [state, setState] = useState('all');
  const [district, setDistrict] = useState('all');
  const [commodity, setCommodity] = useState('all');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [centersRes, filtersRes] = await Promise.all([
        api.get('/centers'),
        api.get('/centers/filters'),
      ]);
      setCenters(centersRes.data.data);
      setFilters(filtersRes.data.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const districtOptions = useMemo(() => {
    if (!filters) return [];
    const list = state === 'all' ? filters.districts : filters.districts.filter((d) => d.state === state);
    return Array.from(new Set(list.map((d) => d.district))).sort();
  }, [filters, state]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return centers.filter((c) => {
      if (state !== 'all' && c.state !== state) return false;
      if (district !== 'all' && c.district !== district) return false;
      if (commodity !== 'all' && !c.commodities.includes(commodity)) return false;
      if (!q) return true;
      return [c.name, c.code, c.district, c.state, c.address].some((field) =>
        field?.toLowerCase().includes(q)
      );
    });
  }, [centers, query, state, district, commodity]);

  const statusLabel = (status?: string) =>
    status === 'full' ? t.schedule.full : status === 'filling' ? t.schedule.filling : t.schedule.open;

  if (loading) return <LoadingState />;
  if (error) return <div className="container py-10"><ErrorState message={error} onRetry={load} /></div>;

  return (
    <div className="container py-10">
      <PageHeader
        title={t.centres.title}
        subtitle={t.centres.subtitle}
        icon={<Warehouse className="size-7 text-primary" />}
      />

      <Card className="mb-7 p-4">
        <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <Input
            placeholder={t.centres.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            icon={<Search />}
          />

          <Select
            value={state}
            onValueChange={(v) => {
              setState(v);
              setDistrict('all');
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t.centres.allStates} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.centres.allStates}</SelectItem>
              {filters?.states.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={district} onValueChange={setDistrict}>
            <SelectTrigger>
              <SelectValue placeholder={t.centres.allDistricts} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.centres.allDistricts}</SelectItem>
              {districtOptions.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={commodity} onValueChange={setCommodity}>
            <SelectTrigger>
              <SelectValue placeholder={t.centres.allCommodities} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.centres.allCommodities}</SelectItem>
              {filters?.commodities.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {lang === 'hi' ? c.hi : c.en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {visible.length === 0 ? (
        <EmptyState title={t.centres.noResults} icon={<Search className="size-7" />} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((center, index) => {
            const loadPct = Math.round(
              ((center.todayBooked ?? 0) / Math.max(center.dailyCapacity, 1)) * 100
            );

            return (
              <Reveal key={center._id} delay={Math.min(index * 0.05, 0.3)}>
                <SpotlightCard className="flex h-full flex-col p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-bold text-primary">{center.code}</p>
                      <h3 className="mt-1 text-lg font-bold leading-tight">
                        {lang === 'hi' && center.nameHi ? center.nameHi : center.name}
                      </h3>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2.5 py-1 text-xs font-bold',
                        STATUS_COLORS[center.todayStatus || 'open']
                      )}
                    >
                      {statusLabel(center.todayStatus)}
                    </span>
                  </div>

                  {/* Fixed height keeps the card grid aligned whether the
                      address wraps to one line or two. */}
                  <p className="mt-3 flex min-h-[2.75rem] items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="mt-0.5 size-4 shrink-0" />
                    <span className="line-clamp-2">{center.address}</span>
                  </p>

                  <div className="mt-4 flex min-h-[1.75rem] flex-wrap gap-1.5">
                    {center.commodities.map((code) => {
                      const item = filters?.commodities.find((c) => c.code === code);
                      return (
                        <Badge key={code} variant="muted">
                          <Sprout className="size-3" />
                          {item ? (lang === 'hi' ? item.hi : item.en) : code}
                        </Badge>
                      );
                    })}
                  </div>

                  <div className="mt-5 space-y-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="size-4" />
                        {t.centres.timings}
                      </span>
                      <span className="font-semibold">
                        {center.openTime} – {center.closeTime}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="size-4" />
                        {t.centres.counters}
                      </span>
                      <span className="font-semibold">{center.activeCounters}</span>
                    </div>
                    {center.contactPhone && (
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="size-4" />
                          {t.common.phone}
                        </span>
                        <a href={`tel:${center.contactPhone}`} className="font-semibold text-primary hover:underline">
                          {center.contactPhone}
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 rounded-[var(--radius)] bg-muted/60 p-3.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t.centres.todayLoad}</span>
                      <span className="font-bold">
                        {center.todayBooked ?? 0} / {center.dailyCapacity}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          loadPct >= 100 ? 'bg-destructive' : loadPct >= 80 ? 'bg-amber-500' : 'bg-primary'
                        )}
                        style={{ width: `${Math.min(loadPct, 100)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {center.todayRemaining ?? 0} {t.centres.remaining}
                    </p>
                  </div>

                  <div className="mt-auto flex gap-2 pt-5">
                    <Button asChild variant="outline" className="flex-1">
                      <Link to={`/centres/${center._id}`}>{t.centres.viewSchedule}</Link>
                    </Button>
                    <Button asChild className="flex-1">
                      <Link to={`/book?center=${center._id}`}>{t.centres.bookHere}</Link>
                    </Button>
                  </div>
                </SpotlightCard>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}
