import {
  CONTENT_STATUSES,
  PARTNERSHIP_STATUSES,
  PRODUCT_STATUSES,
  type ContentStatus,
  type PartnershipStatus,
  type ProductStatus,
} from './lifecycle';

export type NextActionTargetType = 'partnership' | 'product' | 'content';
export type NextActionPriority = 'low' | 'normal' | 'high' | 'urgent';
export type NextActionEntityStatus =
  | { type: 'partnership'; status: PartnershipStatus }
  | { type: 'product'; status: ProductStatus }
  | { type: 'content'; status: ContentStatus };

interface RuleMetadata {
  /** Stable identifier suitable for persistence and deduplication. */
  ruleKey: string;
  title: string;
  priority: NextActionPriority;
  targetType: NextActionTargetType;
}

export type NextActionRuleResult =
  | (RuleMetadata & { kind: 'action'; action: string })
  | (RuleMetadata & { kind: 'waiting'; reason: string; action: null })
  | (RuleMetadata & { kind: 'terminal'; reason: string; action: null });

type Rule = NextActionRuleResult;

const partnershipRules: Readonly<Record<PartnershipStatus, Rule>> = {
  lead: { kind: 'action', ruleKey: 'partnership.lead.contact', title: 'Contact the store', priority: 'high', targetType: 'partnership', action: 'Send an introduction or respond to the inbound invite.' },
  contacted: { kind: 'action', ruleKey: 'partnership.contacted.follow-up', title: 'Follow up with the store', priority: 'normal', targetType: 'partnership', action: 'Record the response or follow up on the outstanding contact.' },
  negotiating: { kind: 'action', ruleKey: 'partnership.negotiating.confirm-terms', title: 'Confirm partnership terms', priority: 'high', targetType: 'partnership', action: 'Resolve open terms and record the agreed deliverables.' },
  active: { kind: 'action', ruleKey: 'partnership.active.manage', title: 'Manage active partnership', priority: 'normal', targetType: 'partnership', action: 'Review deliverables and create or advance associated product work.' },
  waiting: { kind: 'waiting', ruleKey: 'partnership.waiting.external-response', title: 'Waiting for partnership response', priority: 'low', targetType: 'partnership', action: null, reason: 'Progress depends on an external response; resume when new information arrives.' },
  paused: { kind: 'waiting', ruleKey: 'partnership.paused.manual-resume', title: 'Partnership paused', priority: 'low', targetType: 'partnership', action: null, reason: 'Work is intentionally paused and requires an explicit resume decision.' },
  completed: { kind: 'terminal', ruleKey: 'partnership.completed', title: 'Partnership complete', priority: 'low', targetType: 'partnership', action: null, reason: 'The partnership is complete; no further action is generated.' },
  declined: { kind: 'terminal', ruleKey: 'partnership.declined', title: 'Partnership declined', priority: 'low', targetType: 'partnership', action: null, reason: 'The opportunity was declined; no further action is generated.' },
  cancelled: { kind: 'terminal', ruleKey: 'partnership.cancelled', title: 'Partnership cancelled', priority: 'low', targetType: 'partnership', action: null, reason: 'The partnership was cancelled; no further action is generated.' },
};

const productRules: Readonly<Record<ProductStatus, Rule>> = {
  proposed: { kind: 'action', ruleKey: 'product.proposed.evaluate', title: 'Evaluate product proposal', priority: 'normal', targetType: 'product', action: 'Review fit and decide whether to select or decline the product.' },
  selected: { kind: 'action', ruleKey: 'product.selected.request-sample', title: 'Request a sample', priority: 'high', targetType: 'product', action: 'Request the sample and record the request with the partner.' },
  sample_requested: { kind: 'action', ruleKey: 'product.sample-requested.confirm', title: 'Track sample approval', priority: 'normal', targetType: 'product', action: 'Confirm sample approval or resolve availability with the partner.' },
  sample_approved: { kind: 'action', ruleKey: 'product.sample-approved.track-shipment', title: 'Arrange shipment', priority: 'high', targetType: 'product', action: 'Request dispatch details and record tracking information.' },
  shipped: { kind: 'action', ruleKey: 'product.shipped.confirm-receipt', title: 'Confirm product receipt', priority: 'high', targetType: 'product', action: 'Track delivery and confirm the sample was received in good condition.' },
  received: { kind: 'action', ruleKey: 'product.received.plan-content', title: 'Plan product content', priority: 'normal', targetType: 'product', action: 'Add the product to the content queue and define the deliverable.' },
  content_queue: { kind: 'action', ruleKey: 'product.content-queue.start-production', title: 'Start content production', priority: 'normal', targetType: 'product', action: 'Create or begin the associated content deliverable.' },
  in_production: { kind: 'action', ruleKey: 'product.in-production.publish-content', title: 'Complete and publish content', priority: 'high', targetType: 'product', action: 'Finish production and record the published content.' },
  content_live: { kind: 'action', ruleKey: 'product.content-live.monitor', title: 'Monitor live content', priority: 'normal', targetType: 'product', action: 'Review performance and outstanding partner commitments.' },
  monitoring: { kind: 'action', ruleKey: 'product.monitoring.review', title: 'Review product campaign', priority: 'low', targetType: 'product', action: 'Review campaign outcomes and decide whether to continue, pause, or complete.' },
  declined: { kind: 'terminal', ruleKey: 'product.declined', title: 'Product declined', priority: 'low', targetType: 'product', action: null, reason: 'The product was declined; no further action is generated.' },
  cancelled: { kind: 'terminal', ruleKey: 'product.cancelled', title: 'Product cancelled', priority: 'low', targetType: 'product', action: null, reason: 'The product work was cancelled; no further action is generated.' },
  out_of_stock: { kind: 'waiting', ruleKey: 'product.out-of-stock.restock', title: 'Waiting for product availability', priority: 'low', targetType: 'product', action: null, reason: 'The product is unavailable; resume when it is back in stock or cancel it.' },
  replacement_needed: { kind: 'action', ruleKey: 'product.replacement-needed.request', title: 'Resolve product replacement', priority: 'high', targetType: 'product', action: 'Coordinate a replacement with the partner and record its shipment.' },
  paused: { kind: 'waiting', ruleKey: 'product.paused.manual-resume', title: 'Product work paused', priority: 'low', targetType: 'product', action: null, reason: 'Work is intentionally paused and requires an explicit resume decision.' },
  completed: { kind: 'terminal', ruleKey: 'product.completed', title: 'Product work complete', priority: 'low', targetType: 'product', action: null, reason: 'The product work is complete; no further action is generated.' },
};

const contentRules: Readonly<Record<ContentStatus, Rule>> = {
  idea: { kind: 'action', ruleKey: 'content.idea.plan', title: 'Plan content', priority: 'normal', targetType: 'content', action: 'Turn the idea into a defined concept and production plan.' },
  planned: { kind: 'action', ruleKey: 'content.planned.film', title: 'Film content', priority: 'normal', targetType: 'content', action: 'Capture the planned content.' },
  filming: { kind: 'action', ruleKey: 'content.filming.edit', title: 'Edit content', priority: 'normal', targetType: 'content', action: 'Select footage and begin editing.' },
  editing: { kind: 'action', ruleKey: 'content.editing.finish', title: 'Finish the edit', priority: 'normal', targetType: 'content', action: 'Complete the edit or return to filming if more footage is needed.' },
  ready: { kind: 'action', ruleKey: 'content.ready.schedule', title: 'Schedule content', priority: 'high', targetType: 'content', action: 'Approve the final asset and schedule or publish it.' },
  scheduled: { kind: 'action', ruleKey: 'content.scheduled.publish', title: 'Publish scheduled content', priority: 'high', targetType: 'content', action: 'Publish the content at the planned time and record its URL.' },
  published: { kind: 'action', ruleKey: 'content.published.authorize-or-monitor', title: 'Record authorization and monitor content', priority: 'normal', targetType: 'content', action: 'Record any ad authorization and monitor published performance.' },
  ads_authorized: { kind: 'action', ruleKey: 'content.ads-authorized.monitor', title: 'Monitor authorized content', priority: 'normal', targetType: 'content', action: 'Track authorized ad usage and content performance.' },
  monitoring: { kind: 'action', ruleKey: 'content.monitoring.review', title: 'Review content performance', priority: 'low', targetType: 'content', action: 'Review performance and record campaign outcomes.' },
};

/** Pure status-based rule lookup. It deliberately takes no clock or provider dependency. */
export function getNextActionRule(input: NextActionEntityStatus): NextActionRuleResult {
  switch (input.type) {
    case 'partnership': return partnershipRules[input.status];
    case 'product': return productRules[input.status];
    case 'content': return contentRules[input.status];
  }
}

/** Status inventory exposed for consumers that need to build exhaustive views. */
export const NEXT_ACTION_STATUS_INVENTORY = {
  partnership: PARTNERSHIP_STATUSES,
  product: PRODUCT_STATUSES,
  content: CONTENT_STATUSES,
} as const;
