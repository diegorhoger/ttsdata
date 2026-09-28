export { 
  users, sessions, workspaces, tiktokConnections,
  products, productSnapshots, shops, creators, videos,
  productCreatorLinks, opportunityScores, saturationScores,
  trendSignals, watchlists, watchlistItems, alertRules, alertHistory,
  ccosStores, ccosPartnerships, ccosProducts, ccosContents,
  ccosInteractions, ccosNextActions, ccosMetricSnapshots,
  ccosTemplateVersions, ccosTemplateUsage, ccosInteractionSources,
} from './schema';

export { OAuthRepository, type OAuthConfig } from './repositories/oauth';
export {
  CCOSRepository,
  type CCOSPartnershipRecord,
  type CCOSContentRecord,
  type CCOSActionTarget,
  type CCOSNextActionRecord,
  type CCOSNextActionStatus,
  type CCOSProductRecord,
  type CCOSPriority,
  type CCOSStoreRecord,
  type CreateCCOSPartnershipInput,
  type CreateCCOSContentInput,
  type CreateCCOSNextActionInput,
  type CreateCCOSProductInput,
  type CreateCCOSStoreInput,
  type PartnershipType,
  type UpdateCCOSPartnershipInput,
  type UpdateCCOSContentInput,
  type UpdateCCOSNextActionInput,
  type UpdateCCOSProductInput,
  type UpdateCCOSStoreInput,
  type CCOSTemplateType,
  type CreateCCOSTemplateVersionInput,
  type CCOSTemplateVersionRecord,
  type CCOInteractionSourceRecord,
  type CreateCCOSInteractionInput,
  type CCOSInteractionRecord,
} from './repositories/ccos';
export * from './ccos/lifecycle';
export * from './ccos/next-actions';
