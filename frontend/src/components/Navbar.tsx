import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3, Bell, CalendarCheck, ChevronDown, LayoutDashboard, LogOut,
  Menu, MessageSquareWarning, Moon, Search, Sprout, Sun, Ticket, User, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { cn, initials } from '@/lib/utils';

function useTheme() {
  const [dark, setDark] = useState(() => localStorage.getItem('agriqueue.theme') === 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('agriqueue.theme', dark ? 'dark' : 'light');
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useI18n();

  return (
    <div className={cn('flex items-center rounded-full border bg-card p-0.5', compact && 'scale-95')}>
      {(['hi', 'en'] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          className={cn(
            'relative rounded-full px-3 py-1.5 text-xs font-bold transition-colors',
            lang === code ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {lang === code && (
            <motion.span
              layoutId="lang-pill"
              className="absolute inset-0 rounded-full bg-primary"
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            />
          )}
          <span className="relative">{code === 'hi' ? 'हिं' : 'EN'}</span>
        </button>
      ))}
    </div>
  );
}

export function Navbar() {
  const { t } = useI18n();
  const { user, isFarmer, isStaff, signOut } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const farmerLinks = [
    { to: '/centres', label: t.nav.centres, icon: Sprout },
    { to: '/book', label: t.nav.book, icon: CalendarCheck },
    { to: '/my-tokens', label: t.nav.myTokens, icon: Ticket },
    { to: '/grievances', label: t.nav.grievance, icon: MessageSquareWarning },
    { to: '/alerts', label: t.nav.notifications, icon: Bell },
  ];

  const staffLinks = [
    { to: '/admin', label: t.nav.dashboard, icon: LayoutDashboard },
    { to: '/admin/schedule', label: t.nav.schedule, icon: CalendarCheck },
    { to: '/admin/grievances', label: t.nav.grievance, icon: MessageSquareWarning },
    { to: '/admin/analytics', label: t.nav.reports, icon: BarChart3 },
  ];

  const publicLinks = [
    { to: '/centres', label: t.nav.centres, icon: Sprout },
    { to: '/track', label: t.nav.track, icon: Search },
    { to: '/transparency', label: t.nav.transparency, icon: BarChart3 },
  ];

  const links = isStaff ? staffLinks : isFarmer ? farmerLinks : publicLinks;

  const handleSignOut = () => {
    signOut();
    setMenuOpen(false);
    setOpen(false);
    navigate('/');
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full transition-all duration-300',
        scrolled ? 'border-b bg-background/85 backdrop-blur-xl' : 'bg-transparent'
      )}
    >
      <nav className="container flex h-16 items-center justify-between gap-4">
        <Link to={isStaff ? '/admin' : '/'} className="flex shrink-0 items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <Sprout className="size-5" />
          </span>
          <span className="text-lg font-extrabold tracking-tight">
            Agri<span className="text-primary">Queue</span>
          </span>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/admin'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <LanguageToggle />

          <button
            type="button"
            onClick={toggle}
            aria-label="Toggle theme"
            className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-ring"
          >
            {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </button>

          {user ? (
            <div className="relative hidden lg:block">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3 transition-colors hover:bg-muted focus-ring"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {initials(user.name)}
                </span>
                <span className="max-w-[8rem] truncate text-sm font-semibold">{user.name}</span>
                <ChevronDown className={cn('size-4 transition-transform', menuOpen && 'rotate-180')} />
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.97 }}
                      transition={{ duration: 0.16 }}
                      className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-[var(--radius)] border bg-card shadow-xl"
                    >
                      <div className="border-b px-4 py-3">
                        <p className="truncate font-semibold">{user.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {user.role === 'FARMER'
                            ? `${(user as { farmerId?: string }).farmerId} · +91 ${(user as { phone?: string }).phone}`
                            : `${user.role} · ${(user as { center?: { name?: string } }).center?.name ?? ''}`}
                        </p>
                      </div>
                      {isFarmer && (
                        <Link
                          to="/profile"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium hover:bg-muted"
                        >
                          <User className="size-4" />
                          {t.nav.profile}
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-muted"
                      >
                        <LogOut className="size-4" />
                        {t.nav.logout}
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <Button asChild size="sm" className="hidden lg:inline-flex">
              <Link to="/login">{t.nav.login}</Link>
            </Button>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            className="flex size-10 items-center justify-center rounded-full hover:bg-muted focus-ring lg:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden border-b bg-background lg:hidden"
          >
            <div className="container space-y-1 py-4">
              {links.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/admin'}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-[var(--radius)] px-4 py-3 text-base font-semibold transition-colors',
                      isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                    )
                  }
                >
                  <Icon className="size-5" />
                  {label}
                </NavLink>
              ))}

              <div className="border-t pt-3">
                {user ? (
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-3 rounded-[var(--radius)] px-4 py-3 text-base font-semibold text-destructive hover:bg-muted"
                  >
                    <LogOut className="size-5" />
                    {t.nav.logout}
                  </button>
                ) : (
                  <Button asChild className="w-full" size="lg">
                    <Link to="/login" onClick={() => setOpen(false)}>
                      {t.nav.login}
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
