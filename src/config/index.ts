import { SystemConfig } from '../types';

export const DEFAULT_CONFIG: SystemConfig = {
  maxSingleBorrowerPct: 20, // FRC regulatory limit
  minRAROC: 0.12,
  targetCashFlowPredictability: 0.85,
  gracePeriodDays: 7,
  alertRevenueDropPct: 40,
  verificationCostTargetSeconds: 60,
  maxAutoApprovalPct: 0.2 // graceful degradation cap
};

export const RUNTIME_CONFIG = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 3000,
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  BOT_TOKEN: process.env.BOT_TOKEN!,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID!,
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  BOM_API_KEY: process.env.BOM_API_KEY,
  CACHE_TTL_SECONDS: Number(process.env.CACHE_TTL_SECONDS) || 900, // 15 min
  LOG_LEVEL: process.env.LOG_LEVEL || 'info'
} as const;
