import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Building2, Lock, User } from 'lucide-react';

import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { AuroraBackground, Reveal } from '@/components/ui/motion-primitives';

const DEMO_ACCOUNTS = [
  { username: 'admin', label: 'District Admin — all centres' },
  { username: 'mphsg', label: 'Narmadapuram, MP' },
  { username: 'pbldh', label: 'Ludhiana, Punjab' },
  { username: 'upbly', label: 'Bareilly, UP' },
];

export default function StaffLogin() {
  const { t } = useI18n();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/staff/login', form);
      signIn(data.data.token, data.data.user);
      toast.success(data.message);
      navigate('/admin', { replace: true });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[85vh] items-center justify-center px-5 py-14">
      <AuroraBackground className="opacity-60" />

      <Reveal className="relative w-full max-w-md">
        <Card className="p-8 shadow-xl">
          <div className="mb-7 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-foreground text-background">
              <Building2 className="size-7" />
            </span>
            <h1 className="mt-4 text-2xl font-extrabold tracking-tight">{t.auth.staffTitle}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{t.auth.staffSubtitle}</p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <Label htmlFor="username">{t.auth.username}</Label>
              <Input
                id="username"
                autoComplete="username"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                icon={<User />}
              />
            </div>

            <div>
              <Label htmlFor="password">{t.auth.password}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                icon={<Lock />}
              />
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={loading}
              disabled={!form.username || !form.password}
            >
              {t.auth.signIn}
            </Button>
          </form>

          <div className="mt-7 border-t pt-5">
            <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Demo accounts · password <span className="font-mono">admin123</span>
            </p>
            <div className="space-y-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.username}
                  type="button"
                  onClick={() => setForm({ username: account.username, password: 'admin123' })}
                  className="flex w-full items-center justify-between rounded-[var(--radius)] bg-muted px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  <span className="font-mono font-bold">{account.username}</span>
                  <span className="text-xs text-muted-foreground">{account.label}</span>
                </button>
              ))}
            </div>

            <Link
              to="/login"
              className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              {t.auth.backToFarmer}
            </Link>
          </div>
        </Card>
      </Reveal>
    </div>
  );
}
