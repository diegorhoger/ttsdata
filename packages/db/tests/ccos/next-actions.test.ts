import { describe, expect, it } from 'vitest';
import { getNextActionRule, NEXT_ACTION_STATUS_INVENTORY, type NextActionEntityStatus } from '../../src/ccos/next-actions';

describe('CCOS deterministic next-action rules', () => {
  const inputs: NextActionEntityStatus[] = [
    ...NEXT_ACTION_STATUS_INVENTORY.partnership.map((status) => ({ type: 'partnership' as const, status })),
    ...NEXT_ACTION_STATUS_INVENTORY.product.map((status) => ({ type: 'product' as const, status })),
    ...NEXT_ACTION_STATUS_INVENTORY.content.map((status) => ({ type: 'content' as const, status })),
  ];

  it('has a stable, well-formed rule for every declared status', () => {
    expect(inputs).toHaveLength(
      NEXT_ACTION_STATUS_INVENTORY.partnership.length
      + NEXT_ACTION_STATUS_INVENTORY.product.length
      + NEXT_ACTION_STATUS_INVENTORY.content.length,
    );

    for (const input of inputs) {
      const result = getNextActionRule(input);
      expect(result.ruleKey).toMatch(/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/);
      expect(result.title.trim().length).toBeGreaterThan(0);
      expect(['low', 'normal', 'high', 'urgent']).toContain(result.priority);
      expect(result.targetType).toBe(input.type);

      if (result.kind === 'action') {
        expect(result.action.trim().length).toBeGreaterThan(0);
      } else {
        expect(result.reason.trim().length).toBeGreaterThan(0);
        expect(result.action).toBeNull();
        expect(['waiting', 'terminal']).toContain(result.kind);
      }
    }
  });

  it('returns the same result for repeated identical inputs', () => {
    for (const input of inputs) {
      expect(getNextActionRule(input)).toEqual(getNextActionRule(input));
    }
  });

  it('marks partnership and product terminal states explicitly', () => {
    const terminalInputs: NextActionEntityStatus[] = [
      { type: 'partnership', status: 'completed' },
      { type: 'partnership', status: 'declined' },
      { type: 'partnership', status: 'cancelled' },
      { type: 'product', status: 'completed' },
      { type: 'product', status: 'declined' },
      { type: 'product', status: 'cancelled' },
    ];

    for (const input of terminalInputs) {
      const result = getNextActionRule(input);
      expect(result.kind).toBe('terminal');
      if (result.kind === 'terminal') {
        expect(result.reason).toBeTruthy();
        expect(result.action).toBeNull();
      }
    }
  });
});
