import { err, ok, type DomainError, type Result } from '../../../shared/kernel/index.ts';
import { listsErrors } from '../domain/errors.ts';
import type { List } from '../domain/list.ts';

export interface SettingsExpectation {
  readonly expectedSettingsVersion?: number;
}

export const checkSettingsVersion = (
  list: List,
  expectation: SettingsExpectation,
): Result<void, DomainError> =>
  expectation.expectedSettingsVersion !== undefined &&
  expectation.expectedSettingsVersion !== (list.settingsVersion ?? 0)
    ? err(listsErrors.settingsChanged)
    : ok(undefined);
