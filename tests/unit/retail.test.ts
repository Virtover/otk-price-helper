import { describe, expect, it } from 'vitest';
import { rat } from '../../src/core/rational';
import { monthRetail, retailDiscount } from '../../src/core/retail';
import { amountOff, moneyOff, pctOff } from '../../src/ui/format';
import { config, input, list, row } from './helpers';

describe('discounts from the retail price', () => {
  const l = list(input(1000, 1000));
  const cfg = config();

  it('takes the retail price of each month and relates it to the base price', () => {
    expect(monthRetail(l, cfg, 'peak')).toMatchObject({ net: 2257n, gross: 2776n, belowTop: 0n });
    const pre1 = monthRetail(l, cfg, 'pre1');
    expect(pre1).toMatchObject({ net: 2032n, belowTop: 225n });
    expect(pre1.belowTopPct).toEqual(rat(225, 2257));
    // Sale is priced from cost; it is still compared with the regular base price.
    expect(monthRetail(l, cfg, 'sale')).toMatchObject({ net: 1454n, belowTop: 803n });
  });

  it('measures a row from its own month, not from the base price', () => {
    const r = row(l, '100|w2|pre1');
    const d = retailDiscount(monthRetail(l, cfg, 'pre1'), r.netUnit, r.grossUnit);
    expect(d.net).toBe(237n);
    expect(d.gross).toBe(2499n - r.grossUnit);
    expect(d.pct).toEqual(rat(237, 2032));
  });

  it('is zero for the retail row and negative for a price above it', () => {
    const peak = monthRetail(l, cfg, 'peak');
    expect(retailDiscount(peak, 2257n).net).toBe(0n);
    const above = retailDiscount(peak, 2300n);
    expect(above.net).toBe(-43n);
    expect(above.gross).toBeUndefined();
  });

  it('follows an individually edited retail price', () => {
    const edited = list(input(1000, 1000), cfg, { rows: { '1|retail|pre1': 2100n } });
    expect(monthRetail(edited, cfg, 'pre1')).toMatchObject({ net: 2100n, belowTop: 157n });
  });

  it('formats discounts as signed price changes', () => {
    expect(amountOff(237n, 'pl')).toBe('−2,37');
    expect(amountOff(-43n, 'pl')).toBe('+0,43');
    expect(amountOff(0n, 'en')).toBe('0.00');
    expect(moneyOff(237n, 'pl')).toBe('−2,37 zł');
    expect(moneyOff(-237n, 'en')).toBe('+PLN 2.37');
    expect(pctOff(rat(1, 8), 'pl')).toBe('−12,50 %');
    expect(pctOff(rat(-1, 8), 'en')).toBe('+12.50%');
    expect(pctOff(rat(0), 'pl')).toBe('0,00 %');
  });
});
