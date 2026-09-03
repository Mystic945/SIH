import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import dayjs from 'dayjs';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Indian digit grouping: 12,34,567 rather than 1,234,567. */
export function formatINR(value?: number, compact = false) {
  if (value == null) return '—';
  if (compact && value >= 1e7) return `₹${(value / 1e7).toFixed(2)} Cr`;
  if (compact && value >= 1e5) return `₹${(value / 1e5).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function formatNumber(value?: number, dp = 0) {
  if (value == null) return '—';
  return value.toLocaleString('en-IN', { maximumFractionDigits: dp });
}

export function formatDate(date?: string, pattern = 'DD MMM YYYY') {
  if (!date) return '—';
  return dayjs(date).format(pattern);
}

export function formatTime(date?: string) {
  if (!date) return '—';
  return dayjs(date).format('hh:mm A');
}

export function relativeTime(date?: string) {
  if (!date) return '—';
  const diff = dayjs().diff(dayjs(date), 'minute');
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff} min ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)} hr ago`;
  return `${Math.floor(diff / 1440)} d ago`;
}

/**
 * Waiting time, from the farmer's point of view — zero means "you are up now".
 * For an elapsed duration use formatDuration instead, where "now" would be wrong.
 */
export function humanMinutes(mins?: number) {
  if (mins == null) return '—';
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/** An elapsed duration such as average turnaround: "12 min", "1 hr 5 min". */
export function formatDuration(mins?: number) {
  if (mins == null) return '—';
  if (mins <= 0) return '—';
  if (mins < 1) return '<1 min';
  const rounded = Math.round(mins);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

export function todayISO() {
  return dayjs().format('YYYY-MM-DD');
}

export const STAGE_COLORS: Record<string, { bg: string; text: string; dot: string; hex: string }> = {
  BOOKED: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300', dot: 'bg-slate-500', hex: '#64748b' },
  ARRIVED: { bg: 'bg-sky-100 dark:bg-sky-950', text: 'text-sky-700 dark:text-sky-300', dot: 'bg-sky-500', hex: '#0ea5e9' },
  QUALITY_CHECK: { bg: 'bg-violet-100 dark:bg-violet-950', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500', hex: '#8b5cf6' },
  WEIGHMENT: { bg: 'bg-amber-100 dark:bg-amber-950', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500', hex: '#f59e0b' },
  PAYMENT_INITIATED: { bg: 'bg-indigo-100 dark:bg-indigo-950', text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500', hex: '#6366f1' },
  PAID: { bg: 'bg-emerald-100 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500', hex: '#16a34a' },
  CANCELLED: { bg: 'bg-red-100 dark:bg-red-950', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500', hex: '#dc2626' },
  NO_SHOW: { bg: 'bg-orange-100 dark:bg-orange-950', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-500', hex: '#ea580c' },
};

export const STATUS_COLORS: Record<string, string> = {
  open: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  filling: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  full: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  closed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export function initials(name?: string) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}
