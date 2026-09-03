import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ArrowLeft, KeyRound, Phone, ShieldCheck, Sprout } from 'lucide-react';

import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { AuroraBackground, Reveal } from '@/components/ui/motion-primitives';

export default function Login() {
  const { t } = useI18n();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const otpRef = useRef<HTMLInputElement>(null);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/my-tokens';

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const requestOtp = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!/^[6-9]\d{9}$/.test(phone)) {
      toast.error(t.auth.phonePlaceholder);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/farmer/request-otp', { phone });
      setStep('otp');
      setCooldown(30);
      setDevOtp(data.data.devOtp ?? null);
      toast.success(`${t.auth.otpSent} +91 ${phone}`);
      setTimeout(() => otpRef.current?.focus(), 120);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/farmer/verify-otp', { phone, otp });
      signIn(data.data.token, data.data.user);
      toast.success(`${t.auth.signIn} ✓`);
      navigate(from, { replace: true });
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        toast('Let us get you registered first', { icon: '👋' });
        navigate('/register', { state: { phone, otp } });
        return;
      }
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[85vh] items-center justify-center px-5 py-14">
      <AuroraBackground className="opacity-70" />

      <Reveal className="relative w-full max-w-md">
        <Card className="p-8 shadow-xl">
          <div className="mb-7 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
              <Sprout className="size-7" />
            </span>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight">{t.auth.farmerTitle}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{t.auth.farmerSubtitle}</p>
          </div>

          {step === 'phone' ? (
            <form onSubmit={requestOtp} className="space-y-5">
              <div>
                <Label htmlFor="phone">{t.auth.phone}</Label>
                <div className="flex gap-2">
                  <span className="flex h-12 shrink-0 items-center rounded-[var(--radius)] border-2 border-input bg-muted px-3.5 font-semibold text-muted-foreground">
                    +91
                  </span>
                  <Input
                    id="phone"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={10}
                    placeholder={t.auth.phonePlaceholder}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    icon={<Phone />}
                  />
                </div>
              </div>

              <Button type="submit" size="lg" className="w-full" loading={loading}>
                {t.auth.sendOtp}
              </Button>
            </form>
          ) : (
            <motion.form
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              onSubmit={verify}
              className="space-y-5"
            >
              <div className="flex items-center justify-between rounded-[var(--radius)] bg-muted px-4 py-3">
                <span className="text-sm">
                  <span className="text-muted-foreground">{t.auth.otpSent} </span>
                  <span className="font-bold">+91 {phone}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    setOtp('');
                    setDevOtp(null);
                  }}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  {t.auth.changeNumber}
                </button>
              </div>

              <div>
                <Label htmlFor="otp">{t.auth.otp}</Label>
                <Input
                  id="otp"
                  ref={otpRef}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder={t.auth.otpPlaceholder}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="text-center font-mono text-2xl tracking-[0.5em]"
                  icon={<KeyRound />}
                />
              </div>

              {devOtp && (
                <div className="flex items-center gap-2 rounded-[var(--radius)] border border-dashed border-secondary bg-secondary/10 px-4 py-2.5 text-sm">
                  <ShieldCheck className="size-4 shrink-0 text-secondary" />
                  <span>
                    Demo OTP: <span className="font-mono font-bold">{devOtp}</span>
                  </span>
                </div>
              )}

              <Button type="submit" size="lg" className="w-full" loading={loading} disabled={otp.length !== 6}>
                {t.auth.verify}
              </Button>

              <button
                type="button"
                disabled={cooldown > 0}
                onClick={() => requestOtp()}
                className="w-full text-sm font-semibold text-primary disabled:text-muted-foreground"
              >
                {cooldown > 0 ? `${t.auth.resendIn} ${cooldown}s` : t.auth.resend}
              </button>
            </motion.form>
          )}

          <div className="mt-7 space-y-3 border-t pt-5 text-center text-sm">
            <p className="text-muted-foreground">
              {t.auth.newHere}{' '}
              <Link to="/register" className="font-bold text-primary hover:underline">
                {t.auth.register}
              </Link>
            </p>
            <p className="rounded-[var(--radius)] bg-muted px-3 py-2 text-xs text-muted-foreground">
              {t.auth.demoNote}
            </p>
            <Link
              to="/staff-login"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              {t.nav.staffLogin}
            </Link>
          </div>
        </Card>
      </Reveal>
    </div>
  );
}
