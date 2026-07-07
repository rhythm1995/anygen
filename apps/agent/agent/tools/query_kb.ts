import { defineTool } from 'eve/tools';
import { z } from 'zod';

/**
 * Search the exchange knowledge base. The agent MUST call this before stating
 * any factual or numeric claim, so fees/tokenomics/market data are grounded.
 */
export default defineTool({
  description:
    'Search the Helix exchange knowledge base (product facts, market data, FAQs, competitor intel) by keyword. Always call before stating any factual or numeric claim. Returns up to 5 grounded items.',
  inputSchema: z.object({
    query: z.string().describe('Keywords or a short question to search the knowledge base.'),
  }),
  async execute({ query }) {
    const base = process.env.HELIX_API_URL || 'http://localhost:4000';
    const org = process.env.HELIX_ORG_ID || '00000000-0000-0000-0000-000000000001';
    const res = await fetch(`${base}/api/knowledge?q=${encodeURIComponent(query)}`, {
      headers: { 'x-org-id': org },
    });
    if (!res.ok) return { error: `kb_unavailable (${res.status})`, items: [] };
    const items = (await res.json()) as Array<{
      title: string;
      content: string;
      tags: string[];
    }>;
    return {
      items: items.slice(0, 5).map((i) => ({ title: i.title, content: i.content, tags: i.tags })),
    };
  },
});
