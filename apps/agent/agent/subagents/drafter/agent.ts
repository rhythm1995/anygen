import { defineAgent } from 'eve';
import { pickModel } from '../../lib/model';

/** Long-form operations content drafter. */
export default defineAgent({
  description:
    'Writes long-form operations content (announcements, market analysis, trading guides, educational). Grounds every fact via query_kb, follows brand tone, ends market/trading pieces with the risk disclaimer.',
  model: pickModel(),
});
