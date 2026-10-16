import { homedir } from 'node:os';
import { join } from 'node:path';

/** Where the hub keeps its database: the same place the installer expects, outside the program folder. */
export function defaultDataDir(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  if (env.STINGR_DATA_DIR) return env.STINGR_DATA_DIR;
  const share = env.XDG_DATA_HOME || join(home, '.local', 'share');
  return join(share, 'stingr-scout', 'data');
}
