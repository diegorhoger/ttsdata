/** UI choices mirror the domain; the API remains authoritative and revalidates every write. */
export const productTransitions: Record<string, readonly string[]> = {
  proposed: ['selected', 'declined', 'cancelled'], selected: ['sample_requested', 'declined', 'cancelled'],
  sample_requested: ['sample_approved', 'declined', 'cancelled', 'out_of_stock'], sample_approved: ['shipped', 'cancelled', 'out_of_stock'],
  shipped: ['received', 'replacement_needed', 'cancelled'], received: ['content_queue', 'replacement_needed', 'paused'],
  content_queue: ['in_production', 'paused', 'cancelled'], in_production: ['content_live', 'paused', 'cancelled'],
  content_live: ['monitoring', 'in_production'], monitoring: ['in_production', 'completed', 'paused'],
  replacement_needed: ['sample_requested', 'shipped', 'cancelled'], out_of_stock: ['sample_requested', 'cancelled'],
  paused: ['content_queue', 'in_production', 'monitoring', 'cancelled'], declined: [], cancelled: [], completed: [],
};
export const contentTransitions: Record<string, readonly string[]> = {
  idea: ['planned'], planned: ['filming'], filming: ['editing'], editing: ['filming', 'ready'],
  ready: ['editing', 'scheduled', 'published'], scheduled: ['ready', 'published'], published: ['ads_authorized', 'monitoring'],
  ads_authorized: ['monitoring'], monitoring: [],
};
export const partnershipTransitions: Record<string, readonly string[]> = {
  lead: ['contacted', 'declined', 'cancelled'], contacted: ['negotiating', 'waiting', 'declined', 'cancelled'],
  negotiating: ['active', 'waiting', 'paused', 'declined', 'cancelled'], active: ['waiting', 'paused', 'completed', 'cancelled'],
  waiting: ['contacted', 'negotiating', 'active', 'paused', 'cancelled'], paused: ['contacted', 'negotiating', 'active', 'waiting', 'cancelled'],
  completed: [], declined: [], cancelled: [],
};
