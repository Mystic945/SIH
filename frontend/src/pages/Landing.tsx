import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertCircle, ArrowRight, BadgeIndianRupee, BellRing, CalendarCheck, Clock,
  IndianRupee, LineChart, MessageSquareWarning, Radio, ScrollText, Search,
  ShieldCheck, Smartphone, Sprout, Timer, Users, Wheat,
} from 'lucide-react';

import { api } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AuroraBackground, Marquee, NumberTicker, PulseDot, Reveal,
  ShinyText, SpotlightCard, TiltCard, fadeUp, stagger,
} from '@/components/ui/motion-primitives';
import { StagePipeline } from '@/components/StagePipeline';
import { formatINR } from '@/lib/utils';

interface Overview {
  totals: { centers: number; farmers: number; quintals_procured: number; amount_disbursed: number };
  today: { tokens_booked: number; tokens_served: number; avg_turnaround_minutes: number };
}

const SOLUTION_ICONS = [CalendarCheck, Radio, ScrollText, BellRing, MessageSquareWarning, LineChart];
const PROBLEM_ICONS = [Clock, AlertCircle, IndianRupee];

export default function Landing() {
  const { t, lang } = useI18n();
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    // Served by FastAPI through the Express proxy; the page degrades gracefully
    // to static copy if the analytics service is not running.
    api
      .get('/intel/analytics/overview')
      .then(({ data }) => setOverview(data.data))
      .catch(() => setOverview(null));
  }, []);

  const stats = [
    {
      label: t.stats.centres,
      value: overview?.totals.centers ?? 6,
      icon: <Sprout className="size-5" />,
    },
    {
      label: t.stats.farmers,
      value: overview?.totals.farmers ?? 72,
      icon: <Users className="size-5" />,
    },
    {
      label: t.stats.quintals,
      value: Math.round(overview?.totals.quintals_procured ?? 0),
      icon: <Wheat className="size-5" />,
    },
    {
      label: t.stats.avgWait,
      value: Math.round(overview?.today.avg_turnaround_minutes ?? 0),
      suffix: ' min',
      icon: <Timer className="size-5" />,
    },
  ];

  return (
    <div className="overflow-x-hidden">
      {/* ------------------------------------------------------------- hero */}
      <section className="relative">
        <AuroraBackground />
        <div className="absolute inset-0 grid-backdrop" aria-hidden />

        <div className="container relative grid items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <motion.div variants={stagger(0.09)} initial="hidden" animate="show">
            <motion.div variants={fadeUp}>
              <Badge variant="secondary" className="gap-2 px-3 py-1.5">
                <PulseDot color="bg-secondary" />
                {t.hero.badge}
              </Badge>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="mt-5 text-balance text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl"
            >
              {t.hero.title}
            </motion.h1>

            <motion.p variants={fadeUp} className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              {t.hero.subtitle}
            </motion.p>

            <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="xl" variant="glow">
                <Link to="/book">
                  {t.hero.ctaPrimary}
                  <ArrowRight className="size-5" />
                </Link>
              </Button>
              <Button asChild size="xl" variant="outline">
                <Link to="/track">
                  <Search className="size-5" />
                  {t.hero.ctaSecondary}
                </Link>
              </Button>
            </motion.div>

            <motion.p variants={fadeUp} className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
              <Smartphone className="size-4 shrink-0" />
              {t.hero.trustLine}
            </motion.p>
          </motion.div>

          {/* Live token card — the product in one glance */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          >
            <TiltCard>
              <Card className="glass-panel overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between border-b bg-primary px-5 py-3 text-primary-foreground">
                  <span className="flex items-center gap-2 text-sm font-bold">
                    <PulseDot color="bg-white" />
                    {t.token.live}
                  </span>
                  <span className="font-mono text-xs opacity-90">MP-HSG-0409-047</span>
                </div>

                <div className="space-y-5 p-6">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t.token.yourToken}
                      </p>
                      <p className="text-5xl font-extrabold tracking-tight text-primary">
                        #<NumberTicker value={47} />
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t.token.estWait}
                      </p>
                      <p className="text-3xl font-extrabold tracking-tight">
                        <NumberTicker value={40} suffix=" min" />
                      </p>
                    </div>
                  </div>

                  <div className="rounded-[var(--radius)] bg-muted/60 p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t.token.position}</span>
                      <span className="font-bold">
                        <NumberTicker value={12} /> {t.token.ahead}
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
                      <motion.div
                        className="h-full rounded-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: '62%' }}
                        transition={{ duration: 1.4, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  </div>

                  <div>
                    <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t.token.pipeline}
                    </p>
                    <StagePipeline stage="WEIGHMENT" />
                  </div>
                </div>
              </Card>
            </TiltCard>
          </motion.div>
        </div>

        {/* SMS ticker — shows the notification layer without a phone on stage */}
        <div className="border-y bg-card/60 py-4 backdrop-blur">
          <Marquee speed={45}>
            {[
              lang === 'hi'
                ? 'AgriQueue: टोकन MP-HSG-0409-047 — 12 किसान आगे, लगभग 40 मिनट'
                : 'AgriQueue: Token MP-HSG-0409-047 — 12 farmers ahead, approx 40 min',
              lang === 'hi'
                ? 'AgriQueue: रु 54,562 का भुगतान शुरू. खाता ...4471 में 48 घंटे में'
                : 'AgriQueue: Payment of Rs 54,562 initiated. Credit to A/C ...4471 within 48 hrs',
              lang === 'hi'
                ? 'AgriQueue: आपकी बारी नजदीक है. कृपया केंद्र पहुंचें.'
                : 'AgriQueue: Your turn is near. Please reach the centre.',
              lang === 'hi'
                ? 'AgriQueue: टोकन PB-LDH-0409-112 — तौल पूर्ण, शुद्ध 21.4 क्विंटल'
                : 'AgriQueue: Token PB-LDH-0409-112 — weighment done, net 21.4 quintals',
            ].map((text, i) => (
              <span
                key={i}
                className="flex items-center gap-2.5 whitespace-nowrap rounded-full border bg-background px-4 py-2 text-sm text-muted-foreground"
              >
                <BellRing className="size-4 shrink-0 text-secondary" />
                {text}
              </span>
            ))}
          </Marquee>
        </div>
      </section>

      {/* ----------------------------------------------------------- stats */}
      <section className="container py-16">
        <Reveal className="mb-8 text-center">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            <ShinyText>{t.stats.title}</ShinyText>
          </h2>
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 0.07}>
              <SpotlightCard className="h-full p-6 text-center">
                <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {stat.icon}
                </span>
                <p className="mt-4 text-3xl font-extrabold tracking-tight">
                  <NumberTicker value={stat.value} suffix={stat.suffix} />
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>

        {overview && (
          <Reveal delay={0.25}>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {t.stats.disbursed}:{' '}
              <span className="font-bold text-foreground">
                {formatINR(overview.totals.amount_disbursed, true)}
              </span>
              {' · '}
              {t.stats.tokensToday}:{' '}
              <span className="font-bold text-foreground">{overview.today.tokens_booked}</span>
            </p>
          </Reveal>
        )}
      </section>

      {/* --------------------------------------------------------- problem */}
      <section className="border-y bg-muted/30 py-16">
        <div className="container">
          <Reveal className="mb-10 max-w-2xl">
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{t.problem.title}</h2>
          </Reveal>

          <div className="grid gap-5 md:grid-cols-3">
            {t.problem.items.map((item, i) => {
              const Icon = PROBLEM_ICONS[i];
              return (
                <Reveal key={item.title} delay={i * 0.09}>
                  <Card className="h-full border-l-4 border-l-destructive/60 p-6">
                    <Icon className="size-6 text-destructive" />
                    <h3 className="mt-4 text-lg font-bold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                  </Card>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- solution */}
      <section className="container py-16">
        <Reveal className="mb-10 max-w-2xl">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{t.solution.title}</h2>
        </Reveal>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {t.solution.items.map((item, i) => {
            const Icon = SOLUTION_ICONS[i];
            return (
              <Reveal key={item.title} delay={i * 0.07}>
                <SpotlightCard className="h-full p-6">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </SpotlightCard>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ---------------------------------------------------- how it works */}
      <section className="border-y bg-muted/30 py-16">
        <div className="container">
          <Reveal className="mb-10 text-center">
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{t.howItWorks.title}</h2>
          </Reveal>

          <div className="relative grid gap-6 md:grid-cols-4">
            <div className="absolute left-0 right-0 top-6 hidden h-0.5 bg-border md:block" aria-hidden />
            {t.howItWorks.steps.map((step, i) => (
              <Reveal key={step.title} delay={i * 0.1} className="relative">
                <div className="flex flex-col items-center text-center md:items-start md:text-left">
                  <span className="relative z-10 flex size-12 items-center justify-center rounded-full border-4 border-background bg-primary text-lg font-extrabold text-primary-foreground shadow-lg shadow-primary/25">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-base font-bold">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- cta */}
      <section className="container py-20">
        <Reveal>
          <Card className="relative overflow-hidden border-primary/20 bg-primary p-10 text-center text-primary-foreground sm:p-14">
            <AuroraBackground className="opacity-40" />
            <div className="relative">
              <ShieldCheck className="mx-auto size-11" />
              <h2 className="mt-5 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
                {t.hero.title}
              </h2>
              <p className="mx-auto mt-4 max-w-xl opacity-90">{t.tagline}</p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button asChild size="xl" variant="secondary">
                  <Link to="/register">
                    {t.auth.register}
                    <ArrowRight className="size-5" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="xl"
                  variant="outline"
                  className="border-white/40 bg-white/10 text-primary-foreground hover:bg-white/20 hover:text-primary-foreground"
                >
                  <Link to="/transparency">
                    <BadgeIndianRupee className="size-5" />
                    {t.nav.transparency}
                  </Link>
                </Button>
              </div>
            </div>
          </Card>
        </Reveal>
      </section>
    </div>
  );
}
