import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const DEFAULT_ORG_ID =
  process.env.HELIX_ORG_ID || '00000000-0000-0000-0000-000000000001';

/**
 * Resolves the acting org id. Internal tool, single default org — trusts the
 * `x-org-id` header when present, otherwise the configured default.
 */
export const Org = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const header = ctx.switchToHttp().getRequest().headers['x-org-id'];
  return typeof header === 'string' && header.length ? header : DEFAULT_ORG_ID;
});
