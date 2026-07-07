import { defineTool } from 'eve/tools';
import { z } from 'zod';

/** Fetch the text of a cited reference URL included in a brief. */
export default defineTool({
  description:
    'Fetch up to 4000 characters of text content from a URL. Use it to read cited references provided in the brief so claims can be grounded and quoted.',
  inputSchema: z.object({
    url: z.string().url().describe('The reference URL to fetch.'),
  }),
  async execute({ url }) {
    const res = await fetch(url, { redirect: 'follow' });
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text') && !ct.includes('json')) {
      return { status: res.status, content_type: ct, content: '[non-text content skipped]' };
    }
    const body = await res.text();
    return { status: res.status, content_type: ct, content: body.slice(0, 4000) };
  },
});
