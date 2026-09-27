export const PRODUCT_STATUSES = [
  'proposed', 'selected', 'sample_requested', 'sample_approved', 'shipped', 'received',
  'content_queue', 'in_production', 'content_live', 'monitoring', 'declined', 'cancelled',
  'out_of_stock', 'replacement_needed', 'paused', 'completed',
] as const;

export const PARTNERSHIP_STATUSES = [
  'lead', 'contacted', 'negotiating', 'active', 'waiting', 'paused', 'completed',
  'declined', 'cancelled',
] as const;

export type PartnershipStatus = (typeof PARTNERSHIP_STATUSES)[number];

const PARTNERSHIP_TRANSITIONS: Readonly<Record<PartnershipStatus, readonly PartnershipStatus[]>> = {
  lead: ['contacted', 'declined', 'cancelled'],
  contacted: ['negotiating', 'waiting', 'declined', 'cancelled'],
  negotiating: ['active', 'waiting', 'paused', 'declined', 'cancelled'],
  active: ['waiting', 'paused', 'completed', 'cancelled'],
  waiting: ['contacted', 'negotiating', 'active', 'paused', 'cancelled'],
  paused: ['contacted', 'negotiating', 'active', 'waiting', 'cancelled'],
  completed: [],
  declined: [],
  cancelled: [],
};

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

const PRODUCT_TRANSITIONS: Readonly<Record<ProductStatus, readonly ProductStatus[]>> = {
  proposed: ['selected', 'declined', 'cancelled'],
  selected: ['sample_requested', 'declined', 'cancelled'],
  sample_requested: ['sample_approved', 'declined', 'cancelled', 'out_of_stock'],
  sample_approved: ['shipped', 'cancelled', 'out_of_stock'],
  shipped: ['received', 'replacement_needed', 'cancelled'],
  received: ['content_queue', 'replacement_needed', 'paused'],
  content_queue: ['in_production', 'paused', 'cancelled'],
  in_production: ['content_live', 'paused', 'cancelled'],
  content_live: ['monitoring', 'in_production'],
  monitoring: ['in_production', 'completed', 'paused'],
  replacement_needed: ['sample_requested', 'shipped', 'cancelled'],
  out_of_stock: ['sample_requested', 'cancelled'],
  paused: ['content_queue', 'in_production', 'monitoring', 'cancelled'],
  declined: [],
  cancelled: [],
  completed: [],
};

export const CONTENT_STATUSES = [
  'idea', 'planned', 'filming', 'editing', 'ready', 'scheduled', 'published',
  'ads_authorized', 'monitoring', 'completed',
] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

const CONTENT_TRANSITIONS: Readonly<Record<ContentStatus, readonly ContentStatus[]>> = {
  idea: ['planned'],
  planned: ['filming'],
  filming: ['editing'],
  editing: ['filming', 'ready'],
  ready: ['editing', 'scheduled', 'published'],
  scheduled: ['ready', 'published'],
  published: ['ads_authorized', 'monitoring'],
  ads_authorized: ['monitoring'],
  monitoring: ['completed'],
  completed: [],
};

export function canTransitionProduct(from: ProductStatus, to: ProductStatus): boolean {
  return PRODUCT_TRANSITIONS[from].includes(to);
}

export function canTransitionPartnership(from: PartnershipStatus, to: PartnershipStatus): boolean {
  return PARTNERSHIP_TRANSITIONS[from].includes(to);
}

export function canTransitionContent(from: ContentStatus, to: ContentStatus): boolean {
  return CONTENT_TRANSITIONS[from].includes(to);
}

export function assertProductTransition(from: ProductStatus, to: ProductStatus): void {
  if (!canTransitionProduct(from, to)) {
    throw new Error(`Invalid CCOS product transition: ${from} -> ${to}`);
  }
}

export function assertPartnershipTransition(from: PartnershipStatus, to: PartnershipStatus): void {
  if (!canTransitionPartnership(from, to)) {
    throw new Error(`Invalid CCOS partnership transition: ${from} -> ${to}`);
  }
}

export function assertContentTransition(from: ContentStatus, to: ContentStatus): void {
  if (!canTransitionContent(from, to)) {
    throw new Error(`Invalid CCOS content transition: ${from} -> ${to}`);
  }
}
