import type { HubConfig } from '@stingr/shared';
import { matchForm, pitForm } from '../../shared/test/fixtures';

export const CONFIG: HubConfig = {
  event: { key: '2027test', name: 'Test Event' },
  forms: [matchForm(), pitForm()],
  schedule: [
    { matchKey: 'qm1', red: [5098, 0, 3], blue: [4, 5, 6] },
    { matchKey: 'qm2', red: [7, 8, 9], blue: [10, 11, 12] },
  ],
  teams: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 5098],
  appBuild: 'hub-build',
};
