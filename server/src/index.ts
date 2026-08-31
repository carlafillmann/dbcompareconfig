import 'dotenv/config';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import sql from 'mssql';
import oracledb from 'oracledb';
import { Client as PgClient } from 'pg';

type DatabaseType = 'oracle' | 'sqlserver' | 'postgresql';
type EnvironmentType = 'Produção' | 'Homologação' | 'Teste' | 'Espelho' | 'Nimitz' | 'Interna' | 'Desenvolvimento';
type ConnectionPayload = { name: string; environmentType: EnvironmentType; databaseType: DatabaseType; host: string; port: number; database: string; username: string; password?: string };
type ParameterRow = { cdParametro: string; deParametro: string; vlParametro: string | null; deExplicacao: string | null };
type CompareSide = Partial<ConnectionPayload>;
const parameterQuery = 'SELECT D.CDPARAMETRO, D.DEPARAMETRO, V.VLPARAMETRO, D.DEEXPLICACAO FROM EPADDEFPARAMETRO D JOIN EPADVALORPARAMETRO V ON (D.CDPARAMETRO = V.CDPARAMETRO)';

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
  if (!data || !['Produção', 'Homologação', 'Teste', 'Espelho', 'Nimitz', 'Interna', 'Desenvolvimento'].includes(data.environmentType || '') || !['oracle', 'sqlserver', 'postgresql'].includes(data.databaseType || '') || !data.name?.trim() || !data.host?.trim() || !data.database?.trim() || !data.username?.trim() || (requirePassword && !data.password)) throw new Error('Nome, tipo, banco, host, porta, base, usuário e senha são obrigatórios.');
  const port = Number(data.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('A porta deve estar entre 1 e 65535.');
  return { name: data.name!.trim(), environmentType: data.environmentType!, databaseType: data.databaseType!, host: data.host!.trim(), port, database: data.database!.trim(), username: data.username!.trim(), ...(data.password ? { password: data.password } : {}) };
}
function safeError(error: unknown) { if (error instanceof Error) return error.message; return String(error); }

async function testConnection(data: Required<ConnectionPayload>) {
  if (data.databaseType === 'postgresql') { const client = new PgClient({ host: data.host, port: data.port, database: data.database, user: data.username, password: data.password, connectionTimeoutMillis: 10000, ssl: false }); try { await client.connect(); await client.query('SELECT 1'); } finally { await client.end().catch(() => undefined); } return 'Conexão com PostgreSQL validada com sucesso.'; }
  if (data.databaseType === 'sqlserver') { const pool = await sql.connect({ server: data.host, port: data.port, database: data.database, user: data.username, password: data.password, options: { encrypt: true, trustServerCertificate: true }, connectionTimeout: 10000, requestTimeout: 10000 }); try { await pool.request().query('SELECT 1'); } finally { await pool.close(); } return 'Conexão com SQL Server validada com sucesso.'; }
  let connection: oracledb.Connection | undefined;
  try { connection = await oracledb.getConnection({ user: data.username, password: data.password, connectString: `${data.host}:${data.port}/${data.database}` }); await connection.execute('SELECT 1 FROM DUAL'); return 'Conexão com Oracle validada com sucesso.'; }
  finally { await connection?.close().catch(() => undefined); }
}
function valueFrom(row: Record<string, unknown>, field: string) { const key = Object.keys(row).find(candidate => candidate.toUpperCase() === field); return key ? row[key] : null; }
function normalizeParameter(row: Record<string, unknown>): ParameterRow { const toStringOrNull = (value: unknown) => value === null || value === undefined ? null : String(value); return { cdParametro: String(valueFrom(row, 'CDPARAMETRO') ?? ''), deParametro: String(valueFrom(row, 'DEPARAMETRO') ?? ''), vlParametro: toStringOrNull(valueFrom(row, 'VLPARAMETRO')), deExplicacao: toStringOrNull(valueFrom(row, 'DEEXPLICACAO')) }; }
async function queryParameters(data: Required<ConnectionPayload>): Promise<ParameterRow[]> {
  if (data.databaseType === 'postgresql') { const client = new PgClient({ host: data.host, port: data.port, database: data.database, user: data.username, password: data.password, connectionTimeoutMillis: 10000, ssl: false }); try { await client.connect(); return (await client.query(parameterQuery)).rows.map(row => normalizeParameter(row)); } finally { await client.end().catch(() => undefined); } }
  if (data.databaseType === 'sqlserver') { const pool = await new sql.ConnectionPool({ server: data.host, port: data.port, database: data.database, user: data.username, password: data.password, options: { encrypt: true, trustServerCertificate: true }, connectionTimeout: 10000, requestTimeout: 30000 }).connect(); try { return (await pool.request().query(parameterQuery)).recordset.map(row => normalizeParameter(row)); } finally { await pool.close(); } }
  let connection: oracledb.Connection | undefined;
  try { connection = await oracledb.getConnection({ user: data.username, password: data.password, connectString: `${data.host}:${data.port}/${data.database}` }); const result = await connection.execute<Record<string, unknown>>(parameterQuery, [], { outFormat: oracledb.OUT_FORMAT_OBJECT }); return (result.rows || []).map(normalizeParameter); } finally { await connection?.close().catch(() => undefined); }
}
function comparisonConnection(side: CompareSide): Required<ConnectionPayload> { return validate(side) as Required<ConnectionPayload>; }
function compareParameters(first: ParameterRow[], second: ParameterRow[]) {
  const firstByCode = new Map(first.map(row => [row.cdParametro, row])); const secondByCode = new Map(second.map(row => [row.cdParametro, row]));
  return [...new Set([...firstByCode.keys(), ...secondByCode.keys()])].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })).map(cdParametro => { const firstRow = firstByCode.get(cdParametro); const secondRow = secondByCode.get(cdParametro); return { cdParametro, deParametro: firstRow?.deParametro ?? secondRow?.deParametro ?? '', deParametroFirst: firstRow?.deParametro ?? null, deParametroSecond: secondRow?.deParametro ?? null, descriptionDifferent: Boolean(firstRow && secondRow && firstRow.deParametro !== secondRow.deParametro), firstExplanation: firstRow?.deExplicacao ?? null, secondExplanation: secondRow?.deExplicacao ?? null, firstValue: firstRow?.vlParametro ?? null, secondValue: secondRow?.vlParametro ?? null, valuesDifferent: firstRow?.vlParametro !== secondRow?.vlParametro, foundInFirst: Boolean(firstRow), foundInSecond: Boolean(secondRow) }; });
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.post('/api/connections/test', async (req, res, next) => { try { const data = validate(req.body); const message = await testConnection(data as Required<ConnectionPayload>); res.json({ ok: true, message }); } catch (error) { next(error); } });
app.post('/api/compare', async (req, res, next) => { try { const body = req.body as { first?: CompareSide; second?: CompareSide }; const firstConnection = comparisonConnection(body.first || {}); const secondConnection = comparisonConnection(body.second || {}); const firstRows = await queryParameters(firstConnection); const secondRows = await queryParameters(secondConnection); res.json({ rows: compareParameters(firstRows, secondRows), firstCount: firstRows.length, secondCount: secondRows.length }); } catch (error) { next(error); } });
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => { console.error(error); res.status(400).json({ message: safeError(error) }); });
const port = Number(process.env.PORT || 3333);
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => console.log(`API disponível em http://${host}:${port}`));
