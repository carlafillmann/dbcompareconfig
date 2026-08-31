const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'dbcompareconfig-bec7c';
const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyCv_NA0-mxOBSYtF_boOJluyV9DO1BHAGo';

const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

type FirestoreValue = { stringValue?: string; integerValue?: string | number; booleanValue?: boolean };
type FirestoreDocument = { name: string; fields?: Record<string, FirestoreValue> };

export type FirestoreConnection = {
  id: string;
  name: string;
  environmentType: 'Produção' | 'Homologação' | 'Teste' | 'Espelho' | 'Nimitz' | 'Interna' | 'Desenvolvimento';
  databaseType: 'oracle' | 'sqlserver' | 'postgresql';
  host: string;
  port: number;
  database: string;
  username: string;
};

// Perfil do usuário. `themePreference` é um campo interno: é persistido no
// Firestore, mas não é exibido no formulário de cadastro de usuários.
export type UserThemePreference = 'light' | 'dark';
export type FirestoreUserProfile = {
  id: string;
  username: string;
  name: string;
  role: 'Comum' | 'Administrador';
  email?: string;
  createdAt: string;
  active: boolean;
  themePreference: UserThemePreference;
  passwordHash: string;
};

const text = (value: unknown) => ({ stringValue: String(value) });
const integer = (value: number) => ({ integerValue: String(value) });
const fieldsFor = (connection: Omit<FirestoreConnection, 'id'>) => ({
  name: text(connection.name), environmentType: text(connection.environmentType), databaseType: text(connection.databaseType),
  host: text(connection.host), port: integer(connection.port), database: text(connection.database), username: text(connection.username),
});
const fromDocument = (document: FirestoreDocument): FirestoreConnection => {
  const fields = document.fields || {};
  const value = (field: string) => fields[field]?.stringValue || '';
  return { id: document.name.split('/').pop() || '', name: value('name'), environmentType: value('environmentType') as FirestoreConnection['environmentType'], databaseType: value('databaseType') as FirestoreConnection['databaseType'], host: value('host'), port: Number(fields.port?.integerValue || 0), database: value('database'), username: value('username') };
};

async function request(path: string, options?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}${path.includes('?') ? '&' : '?'}key=${apiKey}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  const body = await response.json().catch(() => ({ error: { message: 'Resposta inválida do Firestore.' } }));
  if (!response.ok) throw new Error(body.error?.message || 'Não foi possível acessar o Firestore.');
  return body;
}

export async function listConnections() {
  const result = await request('/connections');
  return ((result.documents || []) as FirestoreDocument[]).map(fromDocument).sort((first, second) => first.name.localeCompare(second.name, 'pt-BR'));
}

export async function createConnection(connection: Omit<FirestoreConnection, 'id'>) {
  await request('/?collectionId=connections', { method: 'POST', body: JSON.stringify({ fields: fieldsFor(connection) }) });
}

export async function updateConnection(connection: FirestoreConnection) {
  await request(`/connections/${encodeURIComponent(connection.id)}`, { method: 'PATCH', body: JSON.stringify({ fields: fieldsFor(connection) }) });
}

export async function deleteConnection(id: string) {
  await request(`/connections/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Atualiza somente a preferência interna de aparência do perfil autenticado. */
export async function updateUserTheme(userId: string, themePreference: UserThemePreference) {
  await request(`/users/${encodeURIComponent(userId)}?updateMask.fieldPaths=themePreference`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: { themePreference: text(themePreference) } }),
  });
}

const userFieldsFor = (user: Omit<FirestoreUserProfile, 'id'>) => ({
  username: text(user.username), name: text(user.name), role: text(user.role), email: text(user.email || ''),
  createdAt: text(user.createdAt), active: { booleanValue: user.active }, themePreference: text(user.themePreference), passwordHash: text(user.passwordHash),
});

const userFromDocument = (document: FirestoreDocument): FirestoreUserProfile => {
  const fields = document.fields || {};
  const value = (field: string) => fields[field]?.stringValue || '';
  return { id: document.name.split('/').pop() || '', username: value('username'), name: value('name'), role: value('role') as FirestoreUserProfile['role'], email: value('email') || undefined, createdAt: value('createdAt'), active: fields.active?.booleanValue !== false, themePreference: (value('themePreference') || 'light') as UserThemePreference, passwordHash: value('passwordHash') };
};

export async function listUsers() {
  const result = await request('/users');
  return ((result.documents || []) as FirestoreDocument[]).map(userFromDocument).sort((first, second) => first.name.localeCompare(second.name, 'pt-BR'));
}

export async function createUser(user: Omit<FirestoreUserProfile, 'id'>) {
  await request('/?collectionId=users', { method: 'POST', body: JSON.stringify({ fields: userFieldsFor(user) }) });
}

export async function updateUser(user: FirestoreUserProfile) {
  await request(`/users/${encodeURIComponent(user.id)}`, { method: 'PATCH', body: JSON.stringify({ fields: userFieldsFor(user) }) });
}
