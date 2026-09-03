import { useState } from 'react';
import toast from 'react-hot-toast';
import { Banknote, MapPin, Phone, Sprout, User } from 'lucide-react';

import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Label } from '@/components/ui/input';
import { PageHeader } from '@/components/shared';
import { Reveal } from '@/components/ui/motion-primitives';
import { cn, initials } from '@/lib/utils';

export default function Profile() {
  const { t } = useI18n();
  const { user, updateUser } = useAuth();
  const { setLang } = useI18n();
  const [saving, setSaving] = useState(false);

  const farmer = user as unknown as {
    name: string; phone: string; farmerId: string; village?: string;
    district?: string; state?: string; landAcres?: number; bankLast4?: string;
    preferredLanguage: 'en' | 'hi';
  };

  const [form, setForm] = useState({
    name: farmer?.name || '',
    village: farmer?.village || '',
    district: farmer?.district || '',
    state: farmer?.state || '',
    landAcres: String(farmer?.landAcres ?? ''),
    bankLast4: farmer?.bankLast4 || '',
    preferredLanguage: farmer?.preferredLanguage || 'hi',
  });

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch('/auth/me', {
        ...form,
        landAcres: Number(form.landAcres || 0),
        bankLast4: form.bankLast4 || undefined,
      });
      updateUser(data.data.user);
      setLang(form.preferredLanguage);
      toast.success(data.message);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="container py-10">
      <PageHeader title={t.nav.profile} icon={<User className="size-7 text-primary" />} />

      <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[1fr_1.5fr]">
        <Reveal>
          <Card className="p-6 text-center">
            <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-primary text-2xl font-extrabold text-primary-foreground">
              {initials(farmer.name)}
            </span>
            <h2 className="mt-4 text-xl font-bold">{farmer.name}</h2>
            <p className="mt-1 font-mono text-sm text-muted-foreground">{farmer.farmerId}</p>

            <div className="mt-5 space-y-2.5 text-left text-sm">
              <div className="flex items-center gap-2.5 rounded-[var(--radius)] bg-muted p-3">
                <Phone className="size-4 shrink-0 text-muted-foreground" />
                <span className="font-semibold">+91 {farmer.phone}</span>
              </div>
              <div className="flex items-center gap-2.5 rounded-[var(--radius)] bg-muted p-3">
                <MapPin className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {farmer.village}, {farmer.district}
                </span>
              </div>
              {farmer.bankLast4 && (
                <div className="flex items-center gap-2.5 rounded-[var(--radius)] bg-muted p-3">
                  <Banknote className="size-4 shrink-0 text-muted-foreground" />
                  <span>A/C •••• {farmer.bankLast4}</span>
                </div>
              )}
            </div>

            <Badge variant="success" className="mt-4">
              <Sprout className="size-3" />
              {farmer.landAcres} acres
            </Badge>
          </Card>
        </Reveal>

        <Reveal delay={0.1}>
          <Card className="p-6">
            <h2 className="mb-5 text-lg font-bold">{t.nav.profile}</h2>

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">{t.register.name}</Label>
                <Input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="village">{t.register.village}</Label>
                  <Input id="village" value={form.village} onChange={(e) => set('village', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="district">{t.register.district}</Label>
                  <Input id="district" value={form.district} onChange={(e) => set('district', e.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="state">{t.register.state}</Label>
                  <Input id="state" value={form.state} onChange={(e) => set('state', e.target.value)} />
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

              <div>
                <Label htmlFor="bank">{t.register.bank}</Label>
                <Input
                  id="bank"
                  inputMode="numeric"
                  maxLength={4}
                  value={form.bankLast4}
                  onChange={(e) => set('bankLast4', e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
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
                <p className="mt-1.5 text-xs text-muted-foreground">
                  SMS alerts are sent in this language.
                </p>
              </div>

              <Button size="lg" className="w-full" loading={saving} onClick={save}>
                {t.common.save}
              </Button>
            </div>
          </Card>
        </Reveal>
      </div>
    </div>
  );
}
