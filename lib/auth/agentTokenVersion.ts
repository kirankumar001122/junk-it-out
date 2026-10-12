import type { JwtPayload } from './jwt';

export async function validateAgentTokenVersion(
  payload: JwtPayload,
  lookupVersion: (agentId: string) => Promise<number | null>
): Promise<JwtPayload | null> {
  if (payload.role !== 'AGENT') return payload;
  if (!payload.agentId) return null;
  try {
    const currentVersion = await lookupVersion(payload.agentId);
    if (currentVersion === null) return null;
    return (payload.tokenVersion ?? 1) >= currentVersion ? payload : null;
  } catch {
    return null;
  }
}
