const version = process.argv[2] || process.env.npm_package_version;
const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "dbcompareconfig-bec7c";
const apiKey =
  process.env.EXPO_PUBLIC_FIREBASE_API_KEY ||
  "AIzaSyCv_NA0-mxOBSYtF_boOJluyV9DO1BHAGo";

if (!version) throw new Error("Informe a versão da API a ser publicada.");

const response = await fetch(
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/api?key=${apiKey}`,
  {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: { latestVersion: { stringValue: version } },
    }),
  },
);

if (!response.ok) {
  throw new Error(`Não foi possível atualizar a versão da API: ${await response.text()}`);
}

console.log(`Firestore atualizado: settings/api.latestVersion = ${version}`);
