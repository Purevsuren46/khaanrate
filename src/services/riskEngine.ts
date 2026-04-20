import { LoanRequest } from '../types';

export class RiskEngine {
  async evaluate(request: LoanRequest) {
    const riskFactors: string[] = [];
    let cfoScore = 0.8; // placeholder

    // Sector exposure
    if (request.sector === 'cashmere' || request.sector === 'livestock') {
      // check global commodities & Dzud risk via weather API
    }

    // Supplier location exposure
    if (request.supplierLocations) {
      const borderRisk = request.supplierLocations.some(l => l === 'Zamiin-Uud');
      if (borderRisk) riskFactors.push('Supplier located in Zamiin-Uud; high border closure exposure');
    }

    // Macro-shock guard (BOM policy & copper)
    const macroShock = this.detectMacroShock();
    if (macroShock) riskFactors.push('macro-shock detected');

    return { riskFactors, cfoScore };
  }

  private detectMacroShock() {
    // poll BOM policy rate & copper export volume; return boolean
    return false;
  }
}
