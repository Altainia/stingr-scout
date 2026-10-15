import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The tablet app's build id: what tablets compare against to notice an update. */
export function resolveAppBuild(appDist: string, fromEnv: string | undefined = process.env.STINGR_APP_BUILD): string {
  if (fromEnv) return fromEnv;
  try {
    const parsed = JSON.parse(readFileSync(join(appDist, 'build.json'), 'utf8')) as { build?: unknown };
    if (typeof parsed.build === 'string' && parsed.build) return parsed.build;
  } catch {
    // not built yet
  }
  return 'dev';
}
