import { collection } from './db.js';

const MANAGEMENT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];

export const isManager = (user) => MANAGEMENT_ROLES.includes(user?.role);
export const isAdmin = (user) => ADMIN_ROLES.includes(user?.role);
export const isEmployee = (user) => user?.role === 'EMPLOYEE';

const unique = (values) => [...new Set(values.filter(Boolean))];

/**
 * Identifiants clients visibles par un employé :
 * - clients dont il est propriétaire ;
 * - clients de projets qu'il manage ;
 * - clients de tâches qui lui sont assignées.
 */
export async function visibleClientIds(user) {
  if (!isEmployee(user)) return null;
  const [owned, managed, assigned] = await Promise.all([
    collection('clients').distinct('id', { owner_id: user.id }),
    collection('projects').distinct('client_id', { manager_id: user.id }),
    collection('tasks').distinct('client_id', { assignee_id: user.id }),
  ]);
  return unique([...owned, ...managed, ...assigned]);
}

export async function visibleClientFilter(user) {
  const ids = await visibleClientIds(user);
  return ids ? { id: { $in: ids } } : {};
}

export async function canAccessClient(user, clientId) {
  if (!clientId) return false;
  if (!isEmployee(user)) return true;
  const ids = await visibleClientIds(user);
  return ids.includes(clientId);
}

/** Écriture fiche/document : managers partout, employés propriétaires du client. */
export async function canWriteClient(user, clientId) {
  if (isManager(user)) return true;
  if (!isEmployee(user)) return false;
  const client = await collection('clients').findOne(
    { id: clientId },
    { projection: { _id: 0, owner_id: 1 } },
  );
  return Boolean(client && client.owner_id === user.id);
}

/** Un employé voit un projet s'il le manage ou s'il a une tâche assignée dessus. */
export async function canAccessProject(user, projectId) {
  if (!projectId) return false;
  if (!isEmployee(user)) return true;
  const project = await collection('projects').findOne(
    { id: projectId },
    { projection: { _id: 0, manager_id: 1 } },
  );
  if (!project) return false;
  if (project.manager_id === user.id) return true;
  const assigned = await collection('tasks').countDocuments(
    { project_id: projectId, assignee_id: user.id },
    { limit: 1 },
  );
  return assigned > 0;
}

export async function accessibleProjectIds(user) {
  if (!isEmployee(user)) return null;
  const [managed, assigned] = await Promise.all([
    collection('projects').distinct('id', { manager_id: user.id }),
    collection('tasks').distinct('project_id', { assignee_id: user.id }),
  ]);
  return unique([...managed, ...assigned]);
}
