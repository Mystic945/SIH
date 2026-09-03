import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ArrowLeft, ArrowRight, Banknote, Check, KeyRound, MapPin, Phone, ShieldCheck, User } from 'lucide-react';

import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AuroraBackground, Reveal } from '@/components/ui/motion-primitives';
import { cn } from '@/lib/utils';

const STATES = [
  'Madhya Pradesh', 'Punjab', 'Uttar Pradesh', 'Maharashtra', 'Rajasthan',
  'Telangana', 'Haryana', 'Bihar', 'Gujarat', 'Karnataka', 'West Bengal', 'Odisha',
];

export default function Register() {
  const { t } = useI18n();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = location.state as { phone?: string; otp?: string } | null;

  const [step, setStep] = useState(prefill?.otp ? 2 : 1);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [devOtp, setDevOtp] = useState<string | null>(null);

  const [form, setForm] = useState({
    phone: prefill?.phone || '',
    otp: prefill?.otp || '',
    name: '',
    village: '',
    district: '',
    state: '',
    landAcres: '',
    aadhaarLast4: '',
    bankLast4: '',
    preferredLanguage: 'hi' as 'hi' | 'en',
  });

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const sendOtp = async () => {
    if (!/^[6-9]\d{9}$/.test(form.phone)) {
      toast.error(t.auth.phonePlaceholder);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/farmer/request-otp', { phone: form.phone });
      if (data.data.isRegistered) {
        toast('This number is already registered — please sign in', { icon: 'ℹ️' });
        navigate('/login', { state: { phone: form.phone } });
        return;
      }
      setDevOtp(data.data.devOtp ?? null);
      setCooldown(30);
      setStep(2);
      toast.success(`${t.auth.otpSent} +91 ${form.phone}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    setLoading(true);
    try {
      const payload = {
        ...form,
        landAcres: Number(form.landAcres || 0),
        aadhaarLast4: form.aadhaarLast4 || undefined,
        bankLast4: form.bankLast4 || undefined,
      };
      const { data } = await api.post('/auth/farmer/register', payload);
      signIn(data.data.token, data.data.user);
      toast.success('Registration complete 🎉');
      navigate('/book', { replace: true });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const canContinue =
    step === 1
      ? /^[6-9]\d{9}$/.test(form.phone)
      : step === 2
        ? form.otp.length === 6
        : Boolean(form.name.trim() && form.village.trim() && form.district.trim() && form.state);

  const steps = [t.auth.phone, t.auth.otp, t.register.title];

  return (
    <div className="relative flex min-h-[85vh] items-center justify-center px-5 py-14">
      <AuroraBackground className="opacity-70" />

      <Reveal className="relative w-full max-w-lg">
        <Card className="p-8 shadow-xl">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-extrabold tracking-tight">{t.register.title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{t.register.subtitle}</p>
          </div>

          {/* step rail */}
          <div className="mb-7 flex items-center gap-2">
            {steps.map((label, index) => {
              const num = index + 1;
              const done = step > num;
              const active = step === num;
              return (
                <div key={label} className="flex flex-1 items-center gap-2">
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors',
                      done && 'bg-primary text-primary-foreground',
                      active && 'border-2 border-primary text-primary',
                      !done && !active && 'bg-muted text-muted-foreground'
                    )}
                  >
                    {done ? <Check className="size-4" /> : num}
                  </span>
                  {index < steps.length - 1 && (
                    <span className={cn('h-0.5 flex-1 rounded', done ? 'bg-primary' : 'bg-border')} />
                  )}
                </div>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="s1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-5"
              >
                <div>
                  <Label htmlFor="phone">{t.auth.phone}</Label>
                  <div className="flex gap-2">
                    <span className="flex h-12 shrink-0 items-center rounded-[var(--radius)] border-2 border-input bg-muted px-3.5 font-semibold text-muted-foreground">
                      +91
                    </span>
                    <Input
                      id="phone"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder={t.auth.phonePlaceholder}
                      value={form.phone}
                      onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                      icon={<Phone />}
                    />
                  </div>
                </div>
                <Button size="lg" className="w-full" loading={loading} disabled={!canContinue} onClick={sendOtp}>
                  {t.auth.sendOtp}
                  <ArrowRight className="size-4" />
                </Button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="s2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-5"
              >
                <div>
                  <Label htmlFor="otp">{t.auth.otp}</Label>
                  <Input
                    id="otp"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder={t.auth.otpPlaceholder}
                    value={form.otp}
                    onChange={(e) => set('otp', e.target.value.replace(/\D/g, '').slice(0, 6))}
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

                <div className="flex gap-3">
                  <Button variant="outline" size="lg" onClick={() => setStep(1)}>
                    <ArrowLeft className="size-4" />
                    {t.register.back}
                  </Button>
                  <Button size="lg" className="flex-1" disabled={!canContinue} onClick={() => setStep(3)}>
                    {t.register.next}
                    <ArrowRight className="size-4" />
                  </Button>
                </div>

                <button
                  type="button"
                  disabled={cooldown > 0}
                  onClick={sendOtp}
                  className="w-full text-sm font-semibold text-primary disabled:text-muted-foreground"
                >
                  {cooldown > 0 ? `${t.auth.resendIn} ${cooldown}s` : t.auth.resend}
                </button>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="s3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <div>
                  <Label htmlFor="name">{t.register.name}</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    icon={<User />}
                    placeholder={t.register.name}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="village">{t.register.village}</Label>
                    <Input
                      id="village"
                      value={form.village}
                      onChange={(e) => set('village', e.target.value)}
                      icon={<MapPin />}
                    />
                  </div>
                  <div>
                    <Label htmlFor="district">{t.register.district}</Label>
                    <Input id="district" value={form.district} onChange={(e) => set('district', e.target.value)} />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>{t.register.state}</Label>
                    <Select value={form.state} onValueChange={(v) => set('state', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder={t.common.selectPlaceholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {STATES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="land">{t.register.landAcres}</Label>
                    <Input
                      id="land"
                      inputMode="decimal"
                      value={form.landAcres}
                      onChange={(e) => set('landAcres', e.target.value.replace(/[^\d.]/g, ''))}
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="aadhaar">
                      {t.register.aadhaar}{' '}
                      <span className="font-normal text-muted-foreground">({t.common.optional})</span>
                    </Label>
                    <Input
                      id="aadhaar"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="XXXX"
                      value={form.aadhaarLast4}
                      onChange={(e) => set('aadhaarLast4', e.target.value.replace(/\D/g, '').slice(0, 4))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bank">
                      {t.register.bank}{' '}
                      <span className="font-normal text-muted-foreground">({t.common.optional})</span>
                    </Label>
                    <Input
                      id="bank"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="XXXX"
                      value={form.bankLast4}
                      onChange={(e) => set('bankLast4', e.target.value.replace(/\D/g, '').slice(0, 4))}
                      icon={<Banknote />}
                    />
                  </div>
                </div>

                <div>
                  <Label>{t.register.language}</Label>
                  <div className="flex gap-2">
                    {(['hi', 'en'] as const).map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => set('preferredLanguage', code)}
                        className={cn(
                          'flex-1 rounded-[var(--radius)] border-2 py-3 font-semibold transition-colors',
                          form.preferredLanguage === code
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-input hover:bg-muted'
                        )}
                      >
                        {code === 'hi' ? 'हिन्दी' : 'English'}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="rounded-[var(--radius)] bg-muted px-3.5 py-2.5 text-xs text-muted-foreground">
                  🔒 {t.register.privacy}
                </p>

                <div className="flex gap-3 pt-1">
                  <Button variant="outline" size="lg" onClick={() => setStep(2)}>
                    <ArrowLeft className="size-4" />
                  </Button>
                  <Button size="lg" className="flex-1" loading={loading} disabled={!canContinue} onClick={submit}>
                    {t.register.submit}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="mt-6 border-t pt-5 text-center text-sm text-muted-foreground">
            <Link to="/login" className="font-bold text-primary hover:underline">
              {t.auth.backToFarmer}
            </Link>
          </p>
        </Card>
      </Reveal>
    </div>
  );
}
