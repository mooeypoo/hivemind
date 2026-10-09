import { describe, expect, test } from 'vitest';
import { MAX_ROLE_LABELS, validateRoleLabels } from './role-labels.ts';

const problems = (labels: { roleId: string; name: string }[]) => {
  const result = validateRoleLabels(labels);
  return result.ok ? [] : (result.error.details ?? []);
};

describe('role labels', () => {
  test('are cleaned and sorted by name', () => {
    const result = validateRoleLabels([
      { roleId: ' 900000000000000002 ', name: ' Moderators ' },
      { roleId: '900000000000000001', name: 'Film   Club' },
    ]);
    expect(result.ok && result.value).toEqual([
      { roleId: '900000000000000001', name: 'Film Club' },
      { roleId: '900000000000000002', name: 'Moderators' },
    ]);
  });

  test('report every problem by row', () => {
    expect(
      problems([
        { roleId: 'Moderators', name: 'Mods' },
        { roleId: '900000000000000001', name: '' },
        { roleId: '900000000000000001', name: 'mods' },
      ]),
    ).toEqual([
      'Row 1: “Moderators” is not a Discord role ID.',
      'Row 2: the name must be 1 to 60 characters.',
      'Row 3: this role ID is already listed.',
      'Row 3: this name is already used.',
    ]);
  });

  test(`allow at most ${String(MAX_ROLE_LABELS)}`, () => {
    const many = Array.from({ length: MAX_ROLE_LABELS + 1 }, (_, i) => ({
      roleId: `9000000000${String(i).padStart(8, '0')}`,
      name: `Role ${String(i)}`,
    }));
    expect(problems(many)).toEqual([`At most ${String(MAX_ROLE_LABELS)} roles.`]);
  });
});
