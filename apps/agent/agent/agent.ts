import { defineAgent } from 'eve';
import { pickModel } from './lib/model';

/**
 * Helix content-production agent.
 *
 * Model: a direct provider instance (no AI Gateway) so the agent is fully
 * self-hostable. Set OPENAI_API_KEY (preferred) or ANTHROPIC_API_KEY.
 *
 * Durability: the self-hosted Postgres Workflow world (see vercel-labs/steve).
 * Requires the three WORKFLOW_* env vars in .env.example, and the pinned
 * @workflow/world-postgres beta that matches eve's bundled @workflow/core.
 */
export default defineAgent({
  model: pickModel(),
  // Self-hosted durable execution (replaces Vercel Workflow).
  experimental: {
    workflow: {
      world: '@workflow/world-postgres',
    },
  },
});
