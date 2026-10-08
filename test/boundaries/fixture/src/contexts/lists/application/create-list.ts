import type { ListId } from '../domain/list.ts';
export const makeCreateList = () => (id: ListId) => id;
