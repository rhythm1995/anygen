import { defineAgent } from 'eve';
import { pickModel } from '../../lib/model';

/** Final polish / edit pass. */
export default defineAgent({
  description:
    'Polishes a draft: tightens prose, enforces brand voice and house style, fixes compliance issues, and ensures GEO structure is intact. Does not invent new facts.',
  model: pickModel(),
});
