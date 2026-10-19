<script setup lang="ts">
import { computed } from 'vue';
import type {
  AccessActionDto,
  AudienceDto,
  ListAccessDto,
  RoleLabelDto,
} from '../../server/http/contracts.ts';
import {
  EVERYONE,
  ONLY_SITE_ADMINS,
  actionLabel,
  actionsFor,
  describeAudience,
  roleIdsOf,
  unseenParticipants,
} from '../lib/access.ts';

const props = defineProps<{
  modelValue: ListAccessDto;
  /** Named roles, plus any role the list uses that has no name yet. */
  roles: readonly RoleLabelDto[];
  /** Seeded lists take no nominations, so that column is left out. */
  seeded: boolean;
  disabled?: boolean;
  idPrefix: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [access: ListAccessDto] }>();

const actions = computed(() => actionsFor(props.seeded));
const set = (action: AccessActionDto, audience: AudienceDto) => {
  emit('update:modelValue', { ...props.modelValue, [action]: audience });
};
const everyone = (action: AccessActionDto) => props.modelValue[action].kind === 'everyone';
const has = (action: AccessActionDto, roleId: string) =>
  roleIdsOf(props.modelValue[action]).includes(roleId);

const allRoleIds = computed(() => props.roles.map((role) => role.roleId));
const allNamed = (action: AccessActionDto) =>
  allRoleIds.value.length > 0 && allRoleIds.value.every((id) => has(action, id));
const someNamed = (action: AccessActionDto) =>
  !allNamed(action) && allRoleIds.value.some((id) => has(action, id));

const toggleEveryone = (action: AccessActionDto, checked: boolean) => {
  set(action, checked ? EVERYONE : ONLY_SITE_ADMINS);
};
const toggleAll = (action: AccessActionDto, checked: boolean) => {
  set(action, checked ? { kind: 'roles', roleIds: [...allRoleIds.value] } : ONLY_SITE_ADMINS);
};
const toggleRole = (action: AccessActionDto, roleId: string, checked: boolean) => {
  const current = roleIdsOf(props.modelValue[action]).filter((id) => id !== roleId);
  set(action, { kind: 'roles', roleIds: checked ? [...current, roleId] : current });
};
const checked = (event: Event) => (event.target as HTMLInputElement).checked;

const unseen = computed(() =>
  unseenParticipants(props.modelValue, props.seeded).map(
    (id) => props.roles.find((role) => role.roleId === id)?.name ?? `Unnamed role (${id})`,
  ),
);
</script>

<template>
  <div class="access-matrix stack">
    <div class="access-table__scroll">
      <table class="access-table" :aria-describedby="`${idPrefix}-help`">
        <thead>
          <tr>
            <th scope="col">Who</th>
            <th v-for="action in actions" :key="action" scope="col">
              {{ actionLabel[action] }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr class="access-table__everyone">
            <th scope="row">
              Everyone on the server
              <span class="meta">Including members without roles</span>
            </th>
            <td v-for="action in actions" :key="action">
              <label class="access-table__cell">
                <input
                  type="checkbox"
                  :checked="everyone(action)"
                  :disabled="disabled"
                  @change="toggleEveryone(action, checked($event))"
                />
                <span class="visually-hidden"
                  >{{ actionLabel[action] }}: Everyone on the server</span
                >
              </label>
            </td>
          </tr>
          <tr v-if="roles.length > 0" class="access-table__all">
            <th scope="row">
              All named roles
              <span class="meta">Select all roles below</span>
            </th>
            <td v-for="action in actions" :key="action">
              <label class="access-table__cell">
                <input
                  type="checkbox"
                  :checked="everyone(action) || allNamed(action)"
                  :indeterminate="!everyone(action) && someNamed(action)"
                  :disabled="disabled || everyone(action)"
                  @change="toggleAll(action, checked($event))"
                />
                <span class="visually-hidden">{{ actionLabel[action] }}: All named roles</span>
              </label>
            </td>
          </tr>
          <tr v-for="role in roles" :key="role.roleId">
            <th scope="row">{{ role.name }}</th>
            <td v-for="action in actions" :key="action">
              <label class="access-table__cell">
                <input
                  type="checkbox"
                  :checked="everyone(action) || has(action, role.roleId)"
                  :disabled="disabled || everyone(action)"
                  @change="toggleRole(action, role.roleId, checked($event))"
                />
                <span class="visually-hidden">{{ actionLabel[action] }}: {{ role.name }}</span>
              </label>
            </td>
          </tr>
          <tr class="access-table__admins">
            <th scope="row">
              Site admins
              <span class="meta">Set by the site’s configuration</span>
            </th>
            <td v-for="action in actions" :key="action">
              <span class="access-table__always">Always</span>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Result</th>
            <td v-for="action in actions" :key="action" :data-action="action">
              {{ describeAudience(modelValue[action], roles) }}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div :id="`${idPrefix}-help`" class="meta stack">
      <p>
        <strong>Everyone on the server</strong> includes members with no roles at all.
        <strong>All named roles</strong> covers only the roles named on the Roles page, so members
        without one of them are left out.
      </p>
      <p>
        A column with nothing ticked means only site admins. Site admins can always view, nominate
        and rate, whatever their roles.
      </p>
    </div>
    <p v-if="unseen.length > 0" class="notice" role="status">
      {{ unseen.join(', ') }} can take part but can’t view the list, so they won’t be able to. Tick
      View for them too.
    </p>
  </div>
</template>
