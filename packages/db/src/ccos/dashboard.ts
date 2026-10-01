import type { CCOInteractionSourceRecord, CCOSContentRecord, CCOSInteractionRecord, CCOSNextActionRecord, CCOSPartnershipRecord, CCOSProductRecord, CCOSStoreRecord } from '../repositories/ccos';
import type { PerformanceSnapshot } from './performance';

export type DashboardDomain = {
  stores: CCOSStoreRecord[]; partnerships: CCOSPartnershipRecord[]; products: CCOSProductRecord[];
  contents: CCOSContentRecord[]; nextActions: CCOSNextActionRecord[]; performance: PerformanceSnapshot[];
  interactions: Array<CCOSInteractionRecord & { sources: CCOInteractionSourceRecord[] }>;
};

/** Counts and attention are projections of canonical records, never independent counters. */
export function buildDashboard(domain: DashboardDomain, asOf: Date) {
  const products = new Map(domain.products.map((item) => [item.id, item]));
  const contents = new Map(domain.contents.map((item) => [item.id, item]));
  const interactions = new Map(domain.interactions.map((item) => [item.id, item]));
  const resolve = (action: CCOSNextActionRecord): string[] => {
    const { type, id } = action.target;
    if (type === 'partnership') return [id];
    if (type === 'store') return domain.partnerships.filter((item) => item.storeId === id).map((item) => item.id);
    if (type === 'interaction') return interactions.has(id) ? [interactions.get(id)!.partnershipId] : [];
    const product = type === 'product' ? products.get(id) : products.get(contents.get(id)?.productId ?? '');
    return product ? [product.partnershipId] : [];
  };
  const attention = domain.nextActions.filter((item) => ['open', 'in_progress', 'waiting'].includes(item.status)).map((action) => ({
    ...action, partnershipIds: resolve(action), overdue: action.status !== 'waiting' && action.dueAt !== null && action.dueAt < asOf,
  }));
  const activePartnerships = domain.partnerships.filter((item) => !['completed', 'declined', 'cancelled'].includes(item.status)).map((partnership) => {
    const actions = attention.filter((item) => item.partnershipIds.includes(partnership.id));
    return { ...partnership, actions, waitingReason: actions.find((item) => item.waitingReason)?.waitingReason
      ?? (actions.length ? null : 'No next action recorded — review this partnership.') };
  });
  const sections = {
    overdueActions: attention.filter((item) => item.overdue),
    overdueReplies: attention.filter((item) => item.overdue && /reply|respond|response|contact|follow[ -]up/i.test(`${item.ruleKey ?? ''} ${item.title}`)),
    receivedProducts: domain.products.filter((item) => item.status === 'received'),
    awaitingPublication: domain.contents.filter((item) => ['ready', 'scheduled'].includes(item.status)),
    awaitingAdAuthorization: domain.contents.filter((item) => ['published', 'ads_authorized', 'monitoring'].includes(item.status)
      && (item.adAuthorizationStatus !== 'authorized' || !item.adAuthorizationCode || (item.adAuthorizationExpiresAt !== null && item.adAuthorizationExpiresAt <= asOf))),
    followUp: attention.filter((item) => /follow|repeat|replenish|replacement|stock/i.test(`${item.ruleKey ?? ''} ${item.title}`)),
  };
  return { ...domain, asOf, attention, activePartnerships, sections, counts: {
    brands: domain.stores.length, partnerships: domain.partnerships.length, activePartnerships: activePartnerships.length,
    products: domain.products.length, contents: domain.contents.length, attention: attention.length,
    overdueActions: sections.overdueActions.length, overdueReplies: sections.overdueReplies.length, receivedProducts: sections.receivedProducts.length,
    awaitingPublication: sections.awaitingPublication.length, awaitingAdAuthorization: sections.awaitingAdAuthorization.length,
    followUp: sections.followUp.length, performance: domain.performance.length,
  } };
}
