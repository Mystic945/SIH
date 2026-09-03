import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const required = (key, fallback) => {
  const value = process.env[key] ?? fallback;
  if (value === undefined) throw new Error(`Missing required env var: ${key}`);
  return value;
};

export const env = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: required('MONGO_URI', 'mongodb://127.0.0.1:27017/agriqueue'),
  dbName: process.env.MONGO_DB_NAME || 'agriqueue',
  jwtSecret: required('JWT_SECRET', 'agriqueue-dev-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(','),
  fastapiUrl: (process.env.FASTAPI_URL || 'http://localhost:8000').replace(/\/$/, ''),
  internalApiKey: process.env.INTERNAL_API_KEY || 'agriqueue-internal-key',
  smsProvider: process.env.SMS_PROVIDER || 'MOCK',
  smsSenderId: process.env.SMS_SENDER_ID || 'AGRIQ',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
};
