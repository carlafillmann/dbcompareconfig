import 'dotenv/config';
import cors from 'cors';
import crypto from 'node:crypto';
import express, { NextFunction, Request, Response } from 'express';
import admin from 'firebase-admin';
import sql from 'mssql';
import oracledb from 'oracledb';
import { Client as PgClient } from 'pg';

type DatabaseType = 'oracle' | 'sqlserver' | 'postgresql';
type ConnectionPayload = { name: string; databaseType: DatabaseType; host: string; port: number; database: string; username: string; password?: string };
type StoredConnection = Omit<ConnectionPayload, 'password'> & { password?: string; createdAt?: admin.firestore.FieldValue | FirebaseFirestore.Timestamp; updatedAt?: admin.firestore.FieldValue };

const requiredEnv = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`A variável ${name} não foi configurada.`); return value; };
const encryptionKey = () => {
  const key = requiredEnv('CONNECTION_ENCRYPTION_KEY');
  if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error('CONNECTION_ENCRYPTION_KEY deve conter 64 caracteres hexadecimais.');
  return Buffer.from(key, 'hex');
};
const encrypt = (value: string) => { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv); const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`; };
const decrypt = (value: string) => { const [iv, tag, encrypted] = value.split('.').map(part => Buffer.from(part, 'base64')); const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv); decipher.setAuthTag(tag); return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'); };

function initializeFirebase() {
  if (admin.apps.length) return;
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (file) { admin.initializeApp({ credential: admin.credential.cert(require(require('node:path').resolve(file))) }); return; }
  admin.initializeApp({ credential: admin.credential.cert({ projectId: requiredEnv('FIREBASE_PROJECT_ID'), clientEmail: requiredEnv('FIREBASE_CLIENT_EMAIL'), privateKey: requiredEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n') }) });
}
initializeFirebase();
const db = admin.firestore();
const connections = db.collection('connections');
const app = express();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:8081,http://localhost:19006,https://dbcompareconf.web.app,https://dbcompareconf.firebaseapp.com').split(',').map(origin => origin.trim());
app.use(cors({ origin(origin, callback) {
  // Requisições sem Origin são locais (por exemplo, verificação de saúde) e permanecem permitidas.
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Origem não permitida para a API local.'));
} }));
app.use(express.json({ limit: '32kb' }));

function validate(body: unknown, requirePassword = true): ConnectionPayload {
  const data = body as Partial<ConnectionPayload>;
  if (!data || !['oracle', 'sqlserver', 'postgresql'].includes(data.databaseType || '') || !data.name?.trim() || !data.host?.trim() || !data.database?.trim() || !data.username?.trim() || (requirePassword && !data.password)) throw new Error('Nome, tipo, host, porta, base, usuário e senha são obrigatórios.');
  const port = Number(data.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('A porta deve estar entre 1 e 65535.');
  return { name: data.name!.trim(), databaseType: data.databaseType!, host: data.host!.trim(), port, database: data.database!.trim(), username: data.username!.trim(), ...(data.password ? { password: data.password } : {}) };
}
function publicConnection(id: string, data: StoredConnection) { const { password, ...connection } = data; return { id, ...connection, hasPassword: Boolean(password), createdAt: data.createdAt && 'toDate' in data.createdAt ? data.createdAt.toDate().toISOString() : undefined }; }
function safeError(error: unknown) { if (error instanceof Error) return error.message; return String(error); }

async function testConnection(data: Required<ConnectionPayload>) {
  if (data.databaseType === 'postgresql') { const client = new PgClient({ host: data.host, port: data.port, database: data.database, user: data.username, password: data.password, connectionTimeoutMillis: 10000, ssl: false }); try { await client.connect(); await client.query('SELECT 1'); } finally { await client.end().catch(() => undefined); } return 'Conexão com PostgreSQL validada com sucesso.'; }
  if (data.databaseType === 'sqlserver') { const pool = await sql.connect({ server: data.host, port: data.port, database: data.database, user: data.username, password: data.password, options: { encrypt: true, trustServerCertificate: true }, connectionTimeout: 10000, requestTimeout: 10000 }); try { await pool.request().query('SELECT 1'); } finally { await pool.close(); } return 'Conexão com SQL Server validada com sucesso.'; }
  let connection: oracledb.Connection | undefined;
  try { connection = await oracledb.getConnection({ user: data.username, password: data.password, connectString: `${data.host}:${data.port}/${data.database}` }); await connection.execute('SELECT 1 FROM DUAL'); return 'Conexão com Oracle validada com sucesso.'; }
  finally { await connection?.close().catch(() => undefined); }
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/connections', async (_req, res, next) => { try { const snapshot = await connections.orderBy('createdAt', 'desc').get(); res.json({ connections: snapshot.docs.map(doc => publicConnection(doc.id, doc.data() as StoredConnection)) }); } catch (error) { next(error); } });
app.post('/api/connections/test', async (req, res, next) => { try { const data = validate(req.body); const message = await testConnection(data as Required<ConnectionPayload>); res.json({ ok: true, message }); } catch (error) { next(error); } });
app.post('/api/connections', async (req, res, next) => { try { const data = validate(req.body); const stored: StoredConnection = { ...data, password: encrypt(data.password!), createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }; const doc = await connections.add(stored); res.status(201).json({ connection: publicConnection(doc.id, stored) }); } catch (error) { next(error); } });
app.put('/api/connections/:id', async (req, res, next) => { try { const previous = await connections.doc(req.params.id).get(); if (!previous.exists) return res.status(404).json({ message: 'Conexão não encontrada.' }); const data = validate(req.body, false); const update: StoredConnection = { ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() }; if (data.password) update.password = encrypt(data.password); else if ((previous.data() as StoredConnection).password) update.password = (previous.data() as StoredConnection).password; await previous.ref.update(update); res.json({ ok: true }); } catch (error) { next(error); } });
app.delete('/api/connections/:id', async (req, res, next) => { try { await connections.doc(req.params.id).delete(); res.status(204).send(); } catch (error) { next(error); } });
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => { console.error(error); res.status(400).json({ message: safeError(error) }); });
const port = Number(process.env.PORT || 3333);
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => console.log(`API disponível em http://${host}:${port}`));
