
import { DomainError } from '../errors/domain.error.js';
import { convertAmount, crossRate, formatAmount, parseAmount } from './money.js';

describe('money', () => {
  describe('parseAmount', () => {
    it.each([
      ['1', 1_000_000n],
      ['0.000001', 1n],
      ['1500.25', 1_500_250_000n],
      ['1000000000000', 1_000_000_000_000_000_000n],
    ])('parses %s', (input, expected) => {
      expect(parseAmount(input)).toBe(expected);
    });

    it.each(['0', '0.000000', '-1', '1.1234567', '1e5', '01', '.5', '5.', ' 5', 'abc', '1000000000000.000001'])(
      'rejects %j',
      (input) => {
        expect(() => parseAmount(input)).toThrow(DomainError);
      },
    );
  });

  it('formats micro-units with six decimals', () => {
    expect(formatAmount(1_500_250_000n)).toBe('1500.250000');
    expect(formatAmount(1n)).toBe('0.000001');
    expect(formatAmount(0n)).toBe('0.000000');
    expect(formatAmount(-2_500_000n)).toBe('-2.500000');
  });

  it('round-trips parse and format', () => {
    expect(formatAmount(parseAmount('98765.4321'))).toBe('98765.432100');
  });

  describe('convertAmount', () => {
    it('converts through USD exactly when the ratio terminates', () => {
      expect(convertAmount(1_500_000_000n, '1500', '1')).toBe(1_000_000n);
      expect(convertAmount(1_000_000n, '15', '1500')).toBe(100_000_000n);
    });

    it('rounds down when the ratio does not terminate', () => {
      expect(convertAmount(1_000_000n, '3', '1')).toBe(333_333n);
      expect(convertAmount(1n, '1500', '1')).toBe(0n);
    });
  });

  it('formats cross rates without exponent notation', () => {
    expect(crossRate('1500', '1')).toBe('0.000666666666666666');
    expect(crossRate('1', '1500')).toBe('1500');
  });
});
