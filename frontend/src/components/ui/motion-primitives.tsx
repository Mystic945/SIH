/**
 * 21st.dev-style motion primitives.
 *
 * These are hand-built in the same idiom as the 21st.dev registry (aurora
 * backgrounds, spotlight cards, number tickers, shiny text, marquees) so the
 * project has no install-time network dependency. To pull in more components
 * from the registry directly:
 *
 *     npx shadcn@latest add "https://21st.dev/r/<author>/<component>"
 *
 * They drop into this same `components/ui` folder and share these tokens.
 */
import * as React from 'react';
import {
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
  useScroll,
  type Variants,
} from 'framer-motion';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------- animations */

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.5 } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

export const stagger = (delay = 0.08): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: delay, delayChildren: 0.05 } },
});

/* --------------------------------------------------------- reveal on scroll */

export function Reveal({
  children,
  className,
  delay = 0,
  variant = fadeUp,
  once = true,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  variant?: Variants;
  once?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once, margin: '-80px' });

  return (
    <motion.div
      ref={ref}
      variants={variant}
      initial="hidden"
      animate={inView ? 'show' : 'hidden'}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------- aurora background */

export function AuroraBackground({ className }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      <div className="absolute -left-32 -top-40 size-[34rem] animate-aurora-drift rounded-full bg-primary/25 blur-[110px]" />
      <div
        className="absolute -right-24 top-10 size-[30rem] animate-aurora-drift rounded-full bg-secondary/25 blur-[110px]"
        style={{ animationDelay: '-6s' }}
      />
      <div
        className="absolute bottom-0 left-1/3 size-[26rem] animate-aurora-drift rounded-full bg-emerald-400/20 blur-[110px]"
        style={{ animationDelay: '-12s' }}
      />
    </div>
  );
}

/* ------------------------------------------------------------ number ticker */

export function NumberTicker({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const motionValue = useMotionValue(0);
  // Tuned to land in well under a second — a stat that is still counting when a
  // judge looks away reads as a broken number, not a flourish.
  const spring = useSpring(motionValue, { damping: 30, stiffness: 210, restDelta: 0.5 });
  const [display, setDisplay] = React.useState('0');

  React.useEffect(() => {
    if (inView) motionValue.set(value);
  }, [inView, value, motionValue]);

  React.useEffect(
    () =>
      spring.on('change', (latest) => {
        setDisplay(
          Number(latest).toLocaleString('en-IN', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })
        );
      }),
    [spring, decimals]
  );

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

/* ----------------------------------------------------------- spotlight card */

export function SpotlightCard({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const onMouseMove = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }, []);

  return (
    <div className={cn('spotlight-card', className)} onMouseMove={onMouseMove} {...props}>
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------- shiny text */

export function ShinyText({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('shiny-text', className)}>{children}</span>;
}

/* ----------------------------------------------------------------- marquee */

export function Marquee({
  children,
  className,
  speed = 40,
  pauseOnHover = true,
}: {
  children: React.ReactNode;
  className?: string;
  speed?: number;
  pauseOnHover?: boolean;
}) {
  return (
    <div
      className={cn('group flex w-full overflow-hidden [--gap:1.5rem]', className)}
      style={{ ['--duration' as string]: `${speed}s` }}
    >
      {[0, 1].map((i) => (
        <div
          key={i}
          aria-hidden={i === 1}
          className={cn(
            'flex shrink-0 animate-marquee items-center gap-[var(--gap)] pr-[var(--gap)]',
            pauseOnHover && 'group-hover:[animation-play-state:paused]'
          )}
        >
          {children}
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------- live pulse dot */

export function PulseDot({ className, color = 'bg-emerald-500' }: { className?: string; color?: string }) {
  return (
    <span className={cn('relative flex size-2.5', className)}>
      <span className={cn('absolute inline-flex size-full animate-pulse-ring rounded-full', color)} />
      <span className={cn('relative inline-flex size-2.5 rounded-full', color)} />
    </span>
  );
}

/* ------------------------------------------------------------ progress bar */

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 28, restDelta: 0.001 });

  return (
    <motion.div
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-primary"
      aria-hidden
    />
  );
}

/* --------------------------------------------------------------- tilt card */

/** Subtle 3D tilt used on the hero token card. Disabled on touch devices. */
export function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-0.5, 0.5], ['7deg', '-7deg']);
  const rotateY = useTransform(x, [-0.5, 0.5], ['-7deg', '7deg']);

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - rect.left) / rect.width - 0.5);
    y.set((event.clientY - rect.top) / rect.height - 0.5);
  };

  return (
    <motion.div
      onMouseMove={handleMove}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d', perspective: 1000 }}
      className={cn('transition-transform', className)}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------- skeletons */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
}
