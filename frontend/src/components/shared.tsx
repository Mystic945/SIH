import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, Inbox, Loader2, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { Reveal, SpotlightCard } from '@/components/ui/motion-primitives';

/* --------------------------------------------------------------- page header */

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-7 flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight sm:text-3xl"
        >
          {icon}
          {title}
        </motion.h1>
        {subtitle && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="mt-1.5 max-w-2xl text-muted-foreground"
          >
            {subtitle}
          </motion.p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------- states */

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
      <Loader2 className="size-7 animate-spin text-primary" />
      <p className="text-sm font-medium">{label || t.common.loading}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <Card className="flex flex-col items-center gap-4 border-destructive/30 bg-destructive/5 p-10 text-center">
      <AlertTriangle className="size-9 text-destructive" />
      <div>
        <p className="font-semibold">{t.common.error}</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          {t.common.retry}
        </Button>
      )}
    </Card>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: string;
  action?: { label: string; to: string };
  icon?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-4 border-dashed p-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        {icon || <Inbox className="size-7" />}
      </span>
      <div>
        <p className="text-lg font-semibold">{title}</p>
        {body && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>}
      </div>
      {action && (
        <Button asChild>
          <Link to={action.to}>{action.label}</Link>
        </Button>
      )}
    </Card>
  );
}

/* ----------------------------------------------------------------- stat card */

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = 'primary',
  delay = 0,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  accent?: 'primary' | 'amber' | 'sky' | 'violet' | 'emerald' | 'rose';
  delay?: number;
}) {
  const accents: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    sky: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
    violet: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    emerald: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    rose: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  };

  return (
    <Reveal delay={delay}>
      <SpotlightCard className="h-full p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{value}</p>
            {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          </div>
          {icon && (
            <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', accents[accent])}>
              {icon}
            </span>
          )}
        </div>
      </SpotlightCard>
    </Reveal>
  );
}

/* -------------------------------------------------------------------- footer */

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="mt-20 border-t bg-muted/30">
      <div className="container grid gap-8 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Sprout className="size-5" />
            </span>
            <span className="text-lg font-extrabold tracking-tight">
              Agri<span className="text-primary">Queue</span>
            </span>
          </div>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">{t.hero.subtitle}</p>
        </div>

        <div>
          <p className="mb-3 text-sm font-bold">{t.nav.home}</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link className="hover:text-foreground" to="/centres">{t.nav.centres}</Link></li>
            <li><Link className="hover:text-foreground" to="/track">{t.nav.track}</Link></li>
            <li><Link className="hover:text-foreground" to="/transparency">{t.nav.transparency}</Link></li>
          </ul>
        </div>

        <div>
          <p className="mb-3 text-sm font-bold">{t.nav.staffLogin}</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link className="hover:text-foreground" to="/staff-login">{t.nav.staffLogin}</Link></li>
            <li><Link className="hover:text-foreground" to="/grievances">{t.nav.grievance}</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t py-5">
        <p className="container text-center text-xs text-muted-foreground">
          AgriQueue · Smart India Hackathon prototype · {t.common.poweredBy}
        </p>
      </div>
    </footer>
  );
}
