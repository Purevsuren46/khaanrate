import { LoanRequest, LoanDecision, AgentMessage } from '../types';
import { BankRateService } from '../services/bankRateService';
import { RiskEngine } from '../services/riskEngine';
import { CacheService } from '../services/cacheService';

export class LoanCoordinator {
  private bankRateService: BankRateService;
  private riskEngine: RiskEngine;
  private cache: CacheService;
  private config: any;

  constructor(config: any) {
    this.config = config;
    this.bankRateService = new BankRateService();
    this.riskEngine = new RiskEngine();
    this.cache = new CacheService();
  }

  async evaluate(request: LoanRequest): Promise<LoanDecision> {
    // 1) Cache check
    const cacheKey = `loan:${request.borrowerId}:${request.requestedAmount}`;
    const cached = await this.cache.get<LoanDecision>(cacheKey);
    if (cached) return cached;

    // 2) Gather real-time rates (Tier 1 low-cost, Tier 2 reserved if complex)
    const rates = await this.bankRateService.fetchAllLiveRates();

    // 3) Risk & cash-flow predictability scoring
    const { riskFactors, cfoScore } = await this.riskEngine.evaluate(request);

    // 4) RAROC and predictability calculations
    const offer = this.selectBestOffer(rates, request, riskFactors, cfoScore);

    // 5) Graceful degradation guard
    if (riskFactors.some(f => f.type === 'macro-shock')) {
      offer.autoApprovalPct = Math.min(offer.autoApprovalPct, this.config.maxAutoApprovalPct);
    }

    const decision: LoanDecision = {
      approved: offer.raroc >= this.config.minRAROC && cfoScore >= this.config.targetCashFlowPredictability,
      amount: offer.amount,
      interestRate: offer.interestRate,
      termMonths: request.termMonths,
      rarcoc: offer.raroc,
      cashFlowPredictability: cfoScore,
      riskFactors,
      confidence: offer.confidence,
      bank: offer.bank,
      offerId: `OFFER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    await this.cache.set(cacheKey, decision, this.config.CACHE_TTL_SECONDS);
    return decision;
  }

  private selectBestOffer(rates: any, req: LoanRequest, riskFactors: any[], cfoScore: number) {
    // Simplified selection favoring RAROC + cash-flow predictability, filtered by FRC 20% limit
    let best = { bank: 'XacBank', interestRate: 999, amount: 0, confidence: 0, raroc: 0 };
    // ... selection logic using rates, risk, and cash-flow ...
    return best;
  }
}
