import Fastify, { type FastifyRequest } from '../../apps/api/node_modules/fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerCCOSRoutes } from '../../apps/api/src/routes/ccos';
import { errorHandler } from '../../apps/api/src/lib/errors';
import { OpportunityConflict, OpportunityNotFound, OPPORTUNITY_ACTIONS } from '../../packages/db/src/ccos/opportunities';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const partnershipId = '33333333-3333-4333-8333-333333333333';
const path = `/partnerships/${partnershipId}/opportunity`;
const decision = { state: 'TESTING', expectedRevision: 0, reason: 'Review initial results', evidence: { source: 'operator', orders: 0 } };
const setup = async (role = 'owner') => {
  const repository = { getOpportunity: vi.fn().mockResolvedValue({ state: 'UNASSESSED', revision: 0 }), listHistory: vi.fn().mockResolvedValue([]), changeState: vi.fn().mockResolvedValue({ revision: 1 }), createAction: vi.fn().mockResolvedValue({ action: { generated_automatically: false }, history: { revision: 1 } }) };
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await registerCCOSRoutes(app, { opportunityRepository: repository, authenticate: async (request: FastifyRequest) => { request.auth = { workspaceId, userId, email: 'operator@example.test', planCode: 'test', role: role as 'owner' }; } });
  return { app, repository };
};

describe('human-reviewed opportunity API', () => {
  it('binds tenant and actor to authentication, never body fields', async () => {
    const { app, repository } = await setup();
    try {
      expect((await app.inject({ method: 'PATCH', url: path, payload: decision })).statusCode).toBe(200);
      expect(repository.changeState).toHaveBeenCalledWith(workspaceId, partnershipId, userId, decision);
      for (const field of ['workspaceId', 'actorUserId', 'generatedAutomatically', 'threshold']) {
        expect((await app.inject({ method: 'PATCH', url: path, payload: { ...decision, [field]: 'spoof' } })).statusCode).toBe(400);
      }
    } finally { await app.close(); }
  });
  it('rejects missing reasons/evidence, invalid states and stale CAS revisions', async () => {
    const { app, repository } = await setup();
    try {
      for (const body of [{ ...decision, state: 'completed' }, { ...decision, evidence: {} }, { ...decision, reason: ' ' }, { ...decision, expectedRevision: -1 }]) {
        expect((await app.inject({ method: 'PATCH', url: path, payload: body })).statusCode).toBe(400);
      }
      expect(repository.changeState).not.toHaveBeenCalled();
      repository.changeState.mockRejectedValue(new OpportunityConflict('Changed'));
      expect((await app.inject({ method: 'PATCH', url: path, payload: decision })).statusCode).toBe(409);
    } finally { await app.close(); }
  });
  it('supports all typed manual actions without send or automatic flags', async () => {
    const { app, repository } = await setup();
    try {
      for (const kind of OPPORTUNITY_ACTIONS) {
        const body = { kind, title: 'Operator task', reason: 'Human review', evidence: { note: 'Follow-up evidence' } };
        expect((await app.inject({ method: 'POST', url: `${path}/actions`, payload: body })).statusCode).toBe(201);
        expect(repository.createAction).toHaveBeenLastCalledWith(workspaceId, partnershipId, userId, body);
      }
      expect((await app.inject({ method: 'POST', url: `${path}/actions`, payload: { kind: 'new_creative', title: 'Send', reason: 'Review', evidence: { note: 'evidence' }, send: true } })).statusCode).toBe(400);
    } finally { await app.close(); }
  });
  it('denies read-only writes and returns stable 404 for hidden partnerships', async () => {
    const { app, repository } = await setup('member');
    try {
      expect((await app.inject({ method: 'PATCH', url: path, payload: decision })).statusCode).toBe(403);
      expect(repository.changeState).not.toHaveBeenCalled();
      repository.getOpportunity.mockResolvedValue(null);
      expect((await app.inject({ method: 'GET', url: path })).statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: `${path}/history` })).statusCode).toBe(404);
    } finally { await app.close(); }
    const writer = await setup();
    try {
      writer.repository.changeState.mockRejectedValue(new OpportunityNotFound('Partnership not found'));
      expect((await writer.app.inject({ method: 'PATCH', url: path, payload: decision })).statusCode).toBe(404);
    } finally { await writer.app.close(); }
  });
});
