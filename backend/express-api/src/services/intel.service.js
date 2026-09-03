import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Thin client for the FastAPI intelligence service.
 *
 * The two backends are deliberately split by responsibility:
 *   Express  → transactional writes (bookings, stages, auth, grievances)
 *   FastAPI  → analytics, forecasting and ETA modelling over the same Atlas DB
 *
 * Express fronts FastAPI so the browser only ever talks to one origin, and a
 * FastAPI outage degrades the analytics panels instead of breaking the app.
 */
export async function callIntel(path, { method = 'GET', body, timeoutMs = 8000 } = {}) {
  const url = `${env.fastapiUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': env.internalApiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const err = new Error(data?.detail || `Intelligence service returned ${response.status}`);
      err.statusCode = response.status;
      throw err;
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      logger.warn(`FastAPI timeout on ${path}`);
      const e = new Error('Analytics service did not respond in time');
      e.statusCode = 504;
      throw e;
    }
    if (err.cause?.code === 'ECONNREFUSED') {
      logger.warn(`FastAPI unreachable at ${env.fastapiUrl} — start it with: uvicorn app.main:app --reload`);
      const e = new Error('Analytics service is offline. Start the FastAPI service on port 8000.');
      e.statusCode = 503;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Health probe used by GET /health to report the dual-backend status. */
export async function intelHealth() {
  try {
    const data = await callIntel('/health', { timeoutMs: 2500 });
    return { reachable: true, ...data };
  } catch (err) {
    return { reachable: false, error: err.message };
  }
}
