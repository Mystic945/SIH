import axios, { AxiosError } from 'axios';

const BASE = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL: `${BASE}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

export const TOKEN_KEY = 'agriqueue.token';

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string; details?: { field: string; message: string }[] }>) => {
    // An expired session should drop the user at sign-in, not at a blank screen.
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/')) {
      localStorage.removeItem(TOKEN_KEY);
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

/** Normalises Axios/Zod/Mongoose error shapes into one readable string. */
export function errorMessage(error: unknown): string {
  const axiosError = error as AxiosError<{
    message?: string;
    details?: { field: string; message: string }[];
  }>;
  const data = axiosError?.response?.data;
  if (data?.details?.length) {
    return data.details.map((d) => d.message).join(', ');
  }
  if (data?.message) return data.message;
  if (axiosError?.code === 'ERR_NETWORK') {
    return 'Cannot reach the server. Is the Express API running on port 5000?';
  }
  return (error as Error)?.message || 'Something went wrong';
}

/* ------------------------------------------------------------------ types */

export type Stage =
  | 'BOOKED'
  | 'ARRIVED'
  | 'QUALITY_CHECK'
  | 'WEIGHMENT'
  | 'PAYMENT_INITIATED'
  | 'PAID'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface Center {
  _id: string;
  code: string;
  name: string;
  nameHi?: string;
  district: string;
  state: string;
  address: string;
  commodities: string[];
  dailyCapacity: number;
  activeCounters: number;
  openTime: string;
  closeTime: string;
  contactPhone?: string;
  inchargeName?: string;
  todayBooked?: number;
  todayRemaining?: number;
  todayStatus?: 'open' | 'filling' | 'full';
}

export interface Farmer {
  _id: string;
  name: string;
  phone: string;
  farmerId: string;
  village?: string;
  district?: string;
  state?: string;
  landAcres?: number;
  bankLast4?: string;
  preferredLanguage: 'en' | 'hi';
  role?: 'FARMER';
}

export interface StaffUser {
  _id: string;
  name: string;
  username: string;
  role: 'ADMIN' | 'STAFF';
  center: Center;
}

export interface StageEvent {
  stage: Stage;
  at: string;
  by: string;
  note?: string;
}

export interface Booking {
  _id: string;
  tokenNumber: number;
  tokenCode: string;
  farmer: Farmer;
  center: Center;
  slotDate: string;
  slotStart: string;
  slotEnd: string;
  commodity: string;
  quantityQuintals: number;
  stage: Stage;
  stageHistory: StageEvent[];
  progressPct: number;
  priority: boolean;
  arrivedAt?: string;
  completedAt?: string;
  quality?: { moisturePct?: number; grade?: string; remarks?: string };
  weighment?: { grossQuintals?: number; netQuintals?: number; bags?: number };
  payment?: {
    ratePerQuintal?: number;
    amount?: number;
    status?: 'PENDING' | 'INITIATED' | 'PAID' | 'FAILED';
    utr?: string;
    initiatedAt?: string;
    paidAt?: string;
  };
  createdAt: string;
}

export interface QueueItem extends Booking {
  position: number;
  ahead: number;
  etaMins: number;
  etaAt: string;
  inService: boolean;
}

export interface QueueSnapshot {
  center: Center;
  date: string;
  queue: QueueItem[];
  nowServing: QueueItem | null;
  stats: {
    totalBooked: number;
    waiting: number;
    inCentre: number;
    completed: number;
    cancelled: number;
    capacityLeft: number;
    capacityUsedPct: number;
    avgTurnaroundMins: number;
    counts: Record<string, number>;
  };
  openGrievances?: number;
  weekTrend?: { date: string; booked: number; served: number; quintals: number }[];
  payments?: { amountPaid: number; quintalsPaid: number };
}

export interface Position {
  date: string;
  center: Partial<Center>;
  nowServing: { tokenCode: string; stage: Stage } | null;
  position: number | null;
  ahead: number;
  etaMins: number;
  etaAt: string | null;
  totalInQueue: number;
}

export interface ScheduleDay {
  date: string;
  weekday: string;
  isOpen: boolean;
  dailyCapacity: number;
  booked: number;
  remaining: number;
  status: 'open' | 'filling' | 'full' | 'closed';
  note?: string;
  noteHi?: string;
  commodities: string[];
  slots?: Slot[];
}

export interface Slot {
  start: string;
  end: string;
  capacity: number;
  booked: number;
  remaining: number;
  isOpen?: boolean;
  isAvailable?: boolean;
  loadPct?: number;
}

export interface Grievance {
  _id: string;
  ticketId: string;
  farmer: Farmer;
  booking?: Booking;
  center: Center;
  category: string;
  subject: string;
  description: string;
  status: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  responses: { by: string; role: string; message: string; at: string }[];
  slaHours: number;
  isBreached?: boolean;
  ageHours?: number;
  resolutionNote?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface AppNotification {
  _id: string;
  phone: string;
  channel: 'SMS' | 'IVR' | 'WHATSAPP' | 'APP';
  template: string;
  message: string;
  lang: 'en' | 'hi';
  status: string;
  dispatchedBy: 'express' | 'fastapi';
  booking?: { tokenCode: string; slotDate: string; stage: Stage };
  farmer?: { name: string; phone: string };
  createdAt: string;
}

export interface Commodity {
  code: string;
  en: string;
  hi: string;
  msp: number;
}
