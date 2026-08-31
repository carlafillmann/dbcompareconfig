import { getApp, getApps, initializeApp } from "firebase/app";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  updateDoc,
} from "firebase/firestore";

const projectId =
  process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "dbcompareconfig-bec7c";
const apiKey =
  process.env.EXPO_PUBLIC_FIREBASE_API_KEY ||
  "AIzaSyCv_NA0-mxOBSYtF_boOJluyV9DO1BHAGo";

const app = getApps().length
  ? getApp()
  : initializeApp({
      apiKey,
      projectId,
      authDomain: `${projectId}.firebaseapp.com`,
    });
const firestore = getFirestore(app);

const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

type FirestoreValue = {
  stringValue?: string;
  integerValue?: string | number;
  booleanValue?: boolean;
};
type FirestoreDocument = {
  name: string;
  fields?: Record<string, FirestoreValue>;
};

export type FirestoreConnection = {
  id: string;
  name: string;
  environmentType:
    | "Produção"
    | "Homologação"
    | "Teste"
    | "Espelho"
    | "Nimitz"
    | "Interna"
    | "Desenvolvimento";
  databaseType: "oracle" | "sqlserver" | "postgresql";
  host: string;
  port: number;
  database: string;
  username: string;
  ownerUserId: string;
};

// Perfil do usuário. `themePreference` é um campo interno: é persistido no
// Firestore, mas não é exibido no formulário de cadastro de usuários.
export type UserThemePreference = "light" | "dark";
export type ApiVersionSettings = { latestVersion: string };
export type FirestoreParameterGroup = {
  id: string;
  description: string;
  parameterCodes: string[];
};
export type FirestoreUserProfile = {
  id: string;
  username: string;
  name: string;
  role: "Comum" | "Administrador";
  email?: string;
  createdAt: string;
  active: boolean;
  themePreference: UserThemePreference;
  ignoredParameters: string[];
  passwordHash: string;
};

const text = (value: unknown) => ({ stringValue: String(value) });
const integer = (value: number) => ({ integerValue: String(value) });
const fieldsFor = (connection: Omit<FirestoreConnection, "id">) => ({
  name: text(connection.name),
  environmentType: text(connection.environmentType),
  databaseType: text(connection.databaseType),
  host: text(connection.host),
  port: integer(connection.port),
  database: text(connection.database),
  username: text(connection.username),
});
const fromDocument = (document: FirestoreDocument): FirestoreConnection => {
  const fields = document.fields || {};
  const value = (field: string) => fields[field]?.stringValue || "";
  return {
    id: document.name.split("/").pop() || "",
    name: value("name"),
    environmentType: value(
      "environmentType",
    ) as FirestoreConnection["environmentType"],
    databaseType: value("databaseType") as FirestoreConnection["databaseType"],
    host: value("host"),
    port: Number(fields.port?.integerValue || 0),
    database: value("database"),
    username: value("username"),
    ownerUserId: value("ownerUserId"),
  };
};

export async function listConnections(ownerUserId: string) {
  const result = await getDocs(collection(firestore, "connections"));
  return result.docs
    .map((item) => ({ id: item.id, ...item.data() }) as FirestoreConnection)
    .filter((connection) => connection.ownerUserId === ownerUserId)
    .sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
}

export async function createConnection(
  connection: Omit<FirestoreConnection, "id">,
) {
  await addDoc(collection(firestore, "connections"), connection);
}

export async function updateConnection(connection: FirestoreConnection) {
  const { id, ...data } = connection;
  await updateDoc(doc(firestore, "connections", id), data);
}

export async function deleteConnection(id: string) {
  await deleteDoc(doc(firestore, "connections", id));
}

/** Atualiza somente a preferência interna de aparência do perfil autenticado. */
export async function updateUserTheme(
  userId: string,
  themePreference: UserThemePreference,
) {
  await updateDoc(doc(firestore, "users", userId), { themePreference });
}

const userFieldsFor = (user: Omit<FirestoreUserProfile, "id">) => ({
  username: text(user.username),
  name: text(user.name),
  role: text(user.role),
  email: text(user.email || ""),
  createdAt: text(user.createdAt),
  active: { booleanValue: user.active },
  themePreference: text(user.themePreference),
  passwordHash: text(user.passwordHash),
});

const userFromDocument = (
  document: FirestoreDocument,
): FirestoreUserProfile => {
  const fields = document.fields || {};
  const value = (field: string) => fields[field]?.stringValue || "";
  return {
    id: document.name.split("/").pop() || "",
    username: value("username"),
    name: value("name"),
    role: value("role") as FirestoreUserProfile["role"],
    email: value("email") || undefined,
    createdAt: value("createdAt"),
    active: fields.active?.booleanValue !== false,
    themePreference: (value("themePreference") ||
      "light") as UserThemePreference,
    ignoredParameters: [],
    passwordHash: value("passwordHash"),
  };
};

export async function listUsers() {
  const result = await getDocs(collection(firestore, "users"));
  return result.docs
    .map((item) => {
      const data = item.data();
      return {
        id: item.id,
        ...data,
        ignoredParameters: Array.isArray(data.ignoredParameters)
          ? data.ignoredParameters.map(String)
          : [],
      } as FirestoreUserProfile;
    })
    .sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
}

export async function createUser(user: Omit<FirestoreUserProfile, "id">) {
  const { email, ...data } = user;
  await addDoc(collection(firestore, "users"), {
    ...data,
    ...(email ? { email } : {}),
  });
}

export async function updateUser(user: FirestoreUserProfile) {
  const { id, email, ...data } = user;
  await updateDoc(doc(firestore, "users", id), {
    ...data,
    ...(email ? { email } : { email: "" }),
  });
}

export async function listParameterGroups() {
  const result = await getDocs(collection(firestore, "parameterGroups"));
  return result.docs
    .map((item) => {
      const data = item.data();
      return {
        id: item.id,
        description: String(data.description || ""),
        parameterCodes: Array.isArray(data.parameterCodes)
          ? data.parameterCodes.map(String)
          : [],
      } as FirestoreParameterGroup;
    })
    .sort((first, second) =>
      first.description.localeCompare(second.description, "pt-BR"),
    );
}

export async function createParameterGroup(
  group: Omit<FirestoreParameterGroup, "id">,
) {
  await addDoc(collection(firestore, "parameterGroups"), group);
}

export async function updateParameterGroup(group: FirestoreParameterGroup) {
  const { id, ...data } = group;
  await updateDoc(doc(firestore, "parameterGroups", id), data);
}

export async function getApiVersionSettings(): Promise<ApiVersionSettings> {
  const result = await getDoc(doc(firestore, "settings", "api"));
  const latestVersion = result.data()?.latestVersion;
  return {
    latestVersion: typeof latestVersion === "string" ? latestVersion : "",
  };
}
