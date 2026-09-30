import { Pool, type PoolClient } from 'pg';
import { OPPORTUNITY_ACTIONS, OPPORTUNITY_STATES, OPPORTUNITY_POLICY, OpportunityConflict, OpportunityNotFound, OpportunityValidationError, validateOpportunityEvidence, type OpportunityDecision, type OpportunityActionInput } from '../ccos/opportunities';

export class CCOSOpportunityRepository {
  constructor(private readonly pool: Pool) {}

  async getOpportunity(workspaceId: string, partnershipId: string) {
    const result = await this.pool.query(`SELECT p.id AS partnership_id, COALESCE(s.state, 'UNASSESSED') AS state,
      COALESCE(s.revision, 0) AS revision FROM ccos_partnerships p
      LEFT JOIN ccos_opportunity_states s ON s.workspace_id = p.workspace_id AND s.partnership_id = p.id
      WHERE p.workspace_id = $1 AND p.id = $2`, [workspaceId, partnershipId]);
    return result.rows[0] ? { ...result.rows[0], policy: OPPORTUNITY_POLICY } : null;
  }

  async listHistory(workspaceId: string, partnershipId: string) {
    const result = await this.pool.query(`SELECT * FROM ccos_opportunity_history WHERE workspace_id = $1 AND partnership_id = $2 ORDER BY revision DESC`, [workspaceId, partnershipId]);
    return result.rows;
  }

  private async lock(client: PoolClient, workspaceId: string, partnershipId: string, actorUserId: string) {
    const target = await client.query('SELECT id FROM ccos_partnerships WHERE workspace_id = $1 AND id = $2 FOR NO KEY UPDATE', [workspaceId, partnershipId]);
    if (!target.rowCount) throw new OpportunityNotFound('Partnership not found');
    const actor = await client.query('SELECT id FROM users WHERE workspace_id = $1 AND id = $2', [workspaceId, actorUserId]);
    if (!actor.rowCount) throw new OpportunityValidationError('Actor not found in workspace');
    await client.query('INSERT INTO ccos_opportunity_states(workspace_id, partnership_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [workspaceId, partnershipId]);
    return (await client.query('SELECT state, revision FROM ccos_opportunity_states WHERE workspace_id = $1 AND partnership_id = $2 FOR UPDATE', [workspaceId, partnershipId])).rows[0];
  }

  private async writeHistory(client: PoolClient, workspaceId: string, partnershipId: string, actorUserId: string,
    current: { state: string; revision: number }, state: string, reason: string, evidence: Record<string, unknown>, actionKind?: string, actionId?: string) {
    const updated = await client.query(`UPDATE ccos_opportunity_states SET state = $3, revision = revision + 1, updated_at = now() WHERE workspace_id = $1 AND partnership_id = $2 AND revision = $4`, [workspaceId, partnershipId, state, current.revision]);
    if (updated.rowCount !== 1) throw new OpportunityConflict('Opportunity changed; reload before deciding');
    return (await client.query(`INSERT INTO ccos_opportunity_history(workspace_id,partnership_id,actor_user_id,revision,previous_state,new_state,reason,evidence,action_kind,action_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) RETURNING *`, [workspaceId, partnershipId, actorUserId, current.revision + 1, current.state, state, reason.trim(), JSON.stringify(evidence), actionKind ?? null, actionId ?? null])).rows[0];
  }

  async changeState(workspaceId: string, partnershipId: string, actorUserId: string, input: OpportunityDecision) {
    validateOpportunityEvidence(input.reason, input.evidence);
    if (!OPPORTUNITY_STATES.includes(input.state) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new OpportunityValidationError('Invalid opportunity decision');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await this.lock(client, workspaceId, partnershipId, actorUserId);
      if (current.revision !== input.expectedRevision) throw new OpportunityConflict('Opportunity changed; reload before deciding');
      if (current.state === input.state) throw new OpportunityValidationError('Opportunity state must change');
      const history = await this.writeHistory(client, workspaceId, partnershipId, actorUserId, current, input.state, input.reason, input.evidence);
      await client.query('COMMIT');
      return history;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async createAction(workspaceId: string, partnershipId: string, actorUserId: string, input: OpportunityActionInput) {
    validateOpportunityEvidence(input.reason, input.evidence);
    if (!OPPORTUNITY_ACTIONS.includes(input.kind) || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 255
      || (input.dueAt !== undefined && (!(input.dueAt instanceof Date) || !Number.isFinite(input.dueAt.getTime())))) throw new OpportunityValidationError('Invalid opportunity action');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await this.lock(client, workspaceId, partnershipId, actorUserId);
      // This only creates operator work. It cannot send messages or modify relationship/content lifecycle.
      const action = (await client.query(`INSERT INTO ccos_next_actions(workspace_id,partnership_id,title,rule_key,due_at,owner_user_id,generated_automatically)
        VALUES ($1,$2,$3,$4,$5,$6,false) RETURNING *`, [workspaceId, partnershipId, input.title.trim(), `opportunity.manual-v1.${input.kind}`, input.dueAt ?? null, actorUserId])).rows[0];
      const history = await this.writeHistory(client, workspaceId, partnershipId, actorUserId, current, current.state, input.reason, input.evidence, input.kind, action.id);
      await client.query('COMMIT');
      return { action, history };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
