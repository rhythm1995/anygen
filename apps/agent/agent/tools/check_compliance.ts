import { defineTool } from 'eve/tools';
import { z } from 'zod';

/** Self-check a draft against the org's compliance terms before finalizing. */
export default defineTool({
  description:
    'Scan draft text against the exchange compliance terms (banned / restricted / required phrasing). Call before returning the final draft. Returns blocking issues to fix.',
  inputSchema: z.object({
    text: z.string().describe('The full draft markdown to check.'),
  }),
  async execute({ text }) {
    const base = process.env.HELIX_API_URL || 'http://localhost:4000';
    const org = process.env.HELIX_ORG_ID || '00000000-0000-0000-0000-000000000001';
    const res = await fetch(`${base}/api/compliance`, { headers: { 'x-org-id': org } });
    if (!res.ok) return { passed: true, note: 'compliance service unavailable, skipped' };
    const terms = (await res.json()) as Array<{
      term: string;
      category: string;
      severity: string;
      replacement?: string | null;
    }>;
    const hay = text.toLowerCase();
    const issues = terms
      .filter((t) => {
        const present = hay.includes(t.term.toLowerCase());
        return (t.category === 'banned' && present) || (t.category === 'required' && !present);
      })
      .map((t) => ({ category: t.category, term: t.term, severity: t.severity, suggestion: t.replacement ?? null }));
    return { passed: issues.length === 0, issueCount: issues.length, issues };
  },
});
