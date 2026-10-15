import type { FormDef } from '../src/types';

export function matchForm(version = 1): FormDef {
  return {
    kind: 'match',
    version,
    assets: { field: 'data:image/png;base64,iVBORw0KGgo=' },
    sections: [
      {
        id: 'auto', title: 'Auto', questions: [
          { key: 'auto_leave', label: 'Left starting zone', type: 'toggle', required: true, default: false, points: 3 },
          { key: 'auto_coral', label: 'Coral scored', type: 'counter', required: true, min: 0, step: 1, default: 0, points: 4 },
          { key: 'start_pos', label: 'Start position', type: 'fieldmap', required: false, assetId: 'field', maxPoints: 1, mirrorForRed: true },
        ],
      },
      {
        id: 'endgame', title: 'Endgame', questions: [
          {
            key: 'climb', label: 'Climb', type: 'choice', required: true, display: 'buttons', options: [
              { value: 'none', label: 'None', points: 0 },
              { value: 'shallow', label: 'Shallow', points: 6 },
              { value: 'deep', label: 'Deep', points: 12 },
            ],
          },
          { key: 'climb_time', label: 'Climb time', type: 'timer', required: false },
        ],
      },
      {
        id: 'notes', title: 'Notes', questions: [
          { key: 'defense', label: 'Defense rating', type: 'rating', required: false, max: 5 },
          { key: 'zones', label: 'Zones used', type: 'multi', required: false, options: [{ value: 'near', label: 'Near' }, { value: 'far', label: 'Far' }] },
          { key: 'comments', label: 'Comments', type: 'text', required: false, multiline: true },
        ],
      },
    ],
  };
}

export function pitForm(version = 1): FormDef {
  return {
    kind: 'pit',
    version,
    assets: {},
    sections: [
      {
        id: 'robot', title: 'Robot', questions: [
          { key: 'drivetrain', label: 'Drivetrain', type: 'choice', required: true, display: 'dropdown', options: [{ value: 'swerve', label: 'Swerve' }, { value: 'tank', label: 'Tank' }] },
          { key: 'weight_lb', label: 'Weight (lb)', type: 'number', required: false, integer: false, min: 0, max: 200 },
        ],
      },
    ],
  };
}
