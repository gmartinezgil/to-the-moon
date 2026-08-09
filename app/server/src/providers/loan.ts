import type { LoanProvider, LoanQuote } from './types';

// No public self-serve API exists for Ledn. This provider keeps the LTV math
// live (real price feed) and leaves the credit execution to a future partner/DeFi
// integration. See docs/implementation-plan.md.
export class MockLoanProvider implements LoanProvider {
  readonly name = 'mock';
  private ltvPct = 50;

  async quote(collateralBtc: number, priceMxn: number): Promise<LoanQuote> {
    const collateralValue = collateralBtc * priceMxn;
    return {
      ltvPct: this.ltvPct,
      availableMxn: collateralValue * (this.ltvPct / 100),
      terms: 'Ledn collateral loan (partner integration pending)',
    };
  }
}

export function createLoanProvider(): LoanProvider {
  return new MockLoanProvider();
}
