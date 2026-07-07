import { defineAgent } from 'eve';
import { pickModel } from '../../lib/model';

/** Structured GEO content writer (AI-engine-optimized). */
export default defineAgent({
  description:
    'Writes Generative-Engine-Optimized content (geo_faq, geo_explainer, geo_comparison, geo_definition). Direct-answer first, every claim sourced, FAQ section, entity-rich. Loads the geo-checklist skill.',
  model: pickModel(),
});
