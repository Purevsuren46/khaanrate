export type Currency = 'USD' | 'MNT' | 'EUR' | 'CNY' | 'RUB' | 'JPY' | 'KRW' | 'GBP';

export interface ExchangeRates {
  [currency: string]: {
    buy: number;
    stay: number;
    sell: number;
    timestamp: number;
  };
}

export interface BankRate {
  bank: string;
  mnemonic: string;
  rates: {
    [currency in Currency]?: {
      buy: number;
      sell: number;
      source: 'api' | 'scrape' | 'fallback';
      lastUpdated: number;
    };
  };
  status: 'online' | 'degraded' | 'offline';
}

export interface LoanRequest {
  borrowerId: string;
  businessType: string;
  requestedAmount: number; // MNT
  termMonths: number;
  purpose: string;
  sector: string;
  isWomenOwned: boolean;
  dailyRevenue?: number; // last 90d avg
  supplierLocations?: string[];
  supplyChainRisk?: 'low' | 'medium' | 'high';
}

export interface LoanDecision {
  approved: boolean;
  amount: number;
  interestRate: number;
  termMonths: number;
  rarcoc: number;
  cashFlowPredictability: number;
  riskFactors: string[];
  confidence: number;
  bank: string;
  offerId: string;
}

export interface AgentMessage {
  from: string;
  to: string;
  type: 'query' | 'response' | 'event' | 'control';
  payload: any;
  timestamp: number;
  correlationId?: string;
}

export interface SystemConfig {
  maxSingleBorrowerPct: number; // FRC limit default 20
  minRAROC: number;
  targetCashFlowPredictability: number;
  gracePeriodDays: number;
  alertRevenueDropPct: number;
  verificationCostTargetSeconds: number;
  maxAutoApprovalPct: number; // macro-shock guard
}
