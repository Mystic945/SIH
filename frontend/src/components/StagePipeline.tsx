import { motion } from 'framer-motion';
import { Check, Clock, IndianRupee, PackageCheck, Scale, ShieldCheck, Truck, XCircle } from 'lucide-react';
import { useT } from '@/i18n';
import { cn, formatTime, STAGE_COLORS } from '@/lib/utils';
import type { Stage, StageEvent } from '@/lib/api';

const PIPELINE: Stage[] = ['BOOKED', 'ARRIVED', 'QUALITY_CHECK', 'WEIGHMENT', 'PAYMENT_INITIATED', 'PAID'];

const ICONS: Record<string, typeof Check> = {
  BOOKED: Clock,
  ARRIVED: Truck,
  QUALITY_CHECK: ShieldCheck,
  WEIGHMENT: Scale,
  PAYMENT_INITIATED: IndianRupee,
  PAID: PackageCheck,
};

interface Props {
  stage: Stage;
  history?: StageEvent[];
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

/**
 * The core farmer-facing visual: BOOKED → ARRIVED → QUALITY_CHECK → WEIGHMENT
 * → PAYMENT_INITIATED → PAID, with the completed portion filled and the current
 * step pulsing. Terminal states (cancelled / absent) short-circuit the whole bar.
 */
export function StagePipeline({ stage, history = [], orientation = 'horizontal', className }: Props) {
  const t = useT();
  const isTerminal = stage === 'CANCELLED' || stage === 'NO_SHOW';
  const currentIndex = PIPELINE.indexOf(stage);
  const timestamps = new Map(history.map((h) => [h.stage, h.at]));

  if (isTerminal) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-[var(--radius)] border-2 border-dashed p-4',
          stage === 'CANCELLED'
            ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
            : 'border-orange-300 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/40',
          className
        )}
      >
        <XCircle className={cn('size-6', stage === 'CANCELLED' ? 'text-red-600' : 'text-orange-600')} />
        <div>
          <p className="font-semibold">{t.stages[stage]}</p>
          <p className="text-sm text-muted-foreground">{formatTime(timestamps.get(stage))}</p>
        </div>
      </div>
    );
  }

  if (orientation === 'vertical') {
    return (
      <ol className={cn('relative space-y-0', className)}>
        {PIPELINE.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          const Icon = ICONS[step];
          const at = timestamps.get(step);

          return (
            <li key={step} className="relative flex gap-4 pb-7 last:pb-0">
              {index < PIPELINE.length - 1 && (
                <span
                  className={cn(
                    'absolute left-[19px] top-10 h-[calc(100%-1.5rem)] w-0.5',
                    done ? 'bg-primary' : 'bg-border'
                  )}
                />
              )}
              <motion.div
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: index * 0.07, type: 'spring', stiffness: 220, damping: 18 }}
                className={cn(
                  'relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2',
                  done && 'border-primary bg-primary text-primary-foreground',
                  active && 'border-primary bg-background text-primary',
                  !done && !active && 'border-border bg-muted text-muted-foreground'
                )}
              >
                {done ? <Check className="size-5" /> : <Icon className="size-5" />}
                {active && (
                  <span className="absolute inset-0 animate-pulse-ring rounded-full bg-primary/40" />
                )}
              </motion.div>

              <div className="min-w-0 pt-1.5">
                <p className={cn('font-semibold leading-tight', !done && !active && 'text-muted-foreground')}>
                  {t.stages[step]}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {at ? formatTime(at) : active ? t.token.live : '—'}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  const progressPct = (Math.max(currentIndex, 0) / (PIPELINE.length - 1)) * 100;

  return (
    <div className={cn('w-full', className)}>
      <div className="relative">
        <div className="absolute left-0 right-0 top-5 h-1 rounded-full bg-border" />
        <motion.div
          className="absolute left-0 top-5 h-1 rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progressPct}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />

        <ol className="relative flex justify-between">
          {PIPELINE.map((step, index) => {
            const done = index < currentIndex;
            const active = index === currentIndex;
            const Icon = ICONS[step];

            return (
              <li key={step} className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: index * 0.07, type: 'spring', stiffness: 240, damping: 18 }}
                  className={cn(
                    'relative flex size-10 items-center justify-center rounded-full border-2 bg-background',
                    (done || active) && 'border-primary',
                    done && 'bg-primary text-primary-foreground',
                    active && 'text-primary',
                    !done && !active && 'border-border text-muted-foreground'
                  )}
                >
                  {done ? <Check className="size-5" /> : <Icon className="size-5" />}
                  {active && (
                    <span className="absolute inset-0 animate-pulse-ring rounded-full bg-primary/40" />
                  )}
                </motion.div>
                <span
                  className={cn(
                    'text-[11px] font-semibold leading-tight sm:text-xs',
                    !done && !active && 'text-muted-foreground'
                  )}
                >
                  {t.stages[step]}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  const t = useT();
  const colors = STAGE_COLORS[stage] || STAGE_COLORS.BOOKED;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        colors.bg,
        colors.text,
        className
      )}
    >
      <span className={cn('size-1.5 rounded-full', colors.dot)} />
      {t.stages[stage]}
    </span>
  );
}
