import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);

export async function connectDB() {
  try {
    const conn = await mongoose.connect(env.mongoUri, {
      dbName: env.dbName,
      serverSelectionTimeoutMS: 15000,
      autoIndex: !env.isProd,
    });
    logger.success(`MongoDB connected → ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (err) {
    logger.error(`MongoDB connection failed: ${err.message}`);
    logger.warn('Check MONGO_URI in backend/express-api/.env and whitelist your IP in Atlas → Network Access.');
    process.exit(1);
  }
}

export async function disconnectDB() {
  await mongoose.connection.close();
}
