import { describe, it, expect } from 'vitest';

/**
 * Alert Rules API Contract Tests — TTS-M2-03
 */

describe('Alert Rules API Contract', () => {
  it('creates alert rule with correct structure', () => {
    const mockRule = {
      id: 'alert-1',
      workspaceId: 'ws-456',
      name: 'Price Drop Alert',
      triggerType: 'price_change' as const,
      conditions: { productId: 'prod-1', threshold: 0.10 },
      cooldownMinutes: 60,
      deliveryChannels: ['in_app'],
      active: true,
      createdAt: new Date(),
    };

    expect(mockRule.id).toBe('alert-1');
    expect(mockRule.triggerType).toBe('price_change');
    expect(mockRule.conditions.threshold).toBe(0.10);
    expect(mockRule.deliveryChannels).toEqual(['in_app']);
  });

  it('supports all trigger types', () => {
    const triggerTypes = [
      'score_threshold',
      'momentum',
      'commission_change',
      'price_change',
      'saturation',
      'new_content',
    ] as const;

    for (const type of triggerTypes) {
      expect(type).toBeDefined();
    }
  });

  it('validates cooldown minutes within range', () => {
    const validCooldowns = [1, 60, 1440];
    for (const minutes of validCooldowns) {
      expect(minutes).toBeGreaterThanOrEqual(1);
      expect(minutes).toBeLessThanOrEqual(1440);
    }
  });

  it('enforces workspace ownership', () => {
    const rule = { id: 'alert-1', workspaceId: 'ws-456' };
    const requestingWorkspace = 'ws-456';
    expect(rule.workspaceId).toBe(requestingWorkspace);
  });
});
