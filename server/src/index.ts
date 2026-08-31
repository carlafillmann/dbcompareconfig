import "dotenv/config";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import sql from "mssql";
import oracledb from "oracledb";
import { Client as PgClient } from "pg";

type DatabaseType = "oracle" | "sqlserver" | "postgresql";
type EnvironmentType =
  | "Produção"
  | "Homologação"
  | "Teste"
  | "Espelho"
  | "Nimitz"
  | "Interna"
  | "Desenvolvimento";
type ConnectionPayload = {
  name: string;
  environmentType: EnvironmentType;
  databaseType: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
};
type ParameterRow = {
  cdParametro: string;
  deParametro: string;
  vlParametro: string | null;
  deExplicacao: string | null;
};
type CompareSide = Partial<ConnectionPayload>;
const parameterQuery =
  "SELECT D.CDPARAMETRO, D.DEPARAMETRO, V.VLPARAMETRO, D.DEEXPLICACAO FROM EPADDEFPARAMETRO D JOIN EPADVALORPARAMETRO V ON (D.CDPARAMETRO = V.CDPARAMETRO) WHERE V.CDINSTALACAO = 1";
const webServicesQuery =
  "SELECT CDWEBSERVICES, DEWEBSERVICES, SGTIPOINTEGRACAO FROM ESPJWS";
const webServiceParametersQuery =
  "SELECT CDWEBSERVICES, DEPARAMETRO, DEDESCRICAO, VLPARAMETRO FROM ESPJWSPARAMETROS WHERE CDWEBSERVICES = ";
const apiVersion = "1.0.3";

const app = express();
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  "http://localhost:8081,http://localhost:19006,https://dbcompareconf.web.app,https://dbcompareconf.firebaseapp.com"
)
  .split(",")
  .map((origin) => origin.trim());
app.use(
  cors({
    origin(origin, callback) {
      // Requisições sem Origin são locais (por exemplo, verificação de saúde) e permanecem permitidas.
      if (!origin || allowedOrigins.includes(origin))
        return callback(null, true);
      return callback(new Error("Origem não permitida para a API local."));
    },
  }),
);
app.use(express.json({ limit: "32kb" }));

function validate(body: unknown, requirePassword = true): ConnectionPayload {
  const data = body as Partial<ConnectionPayload>;
  if (
    !data ||
    ![
      "Produção",
      "Homologação",
      "Teste",
      "Espelho",
      "Nimitz",
      "Interna",
      "Desenvolvimento",
    ].includes(data.environmentType || "") ||
    !["oracle", "sqlserver", "postgresql"].includes(data.databaseType || "") ||
    !data.name?.trim() ||
    !data.host?.trim() ||
    !data.database?.trim() ||
    !data.username?.trim() ||
    (requirePassword && !data.password)
  )
    throw new Error(
      "Nome, tipo, banco, host, porta, base, usuário e senha são obrigatórios.",
    );
  const port = Number(data.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("A porta deve estar entre 1 e 65535.");
  return {
    name: data.name!.trim(),
    environmentType: data.environmentType!,
    databaseType: data.databaseType!,
    host: data.host!.trim(),
    port,
    database: data.database!.trim(),
    username: data.username!.trim(),
    ...(data.password ? { password: data.password } : {}),
  };
}
function safeError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function testConnection(data: Required<ConnectionPayload>) {
  if (data.databaseType === "postgresql") {
    const client = new PgClient({
      host: data.host,
      port: data.port,
      database: data.database,
      user: data.username,
      password: data.password,
      connectionTimeoutMillis: 10000,
      ssl: false,
    });
    try {
      await client.connect();
      await client.query("SELECT 1");
    } finally {
      await client.end().catch(() => undefined);
    }
    return "Conexão com PostgreSQL validada com sucesso.";
  }
  if (data.databaseType === "sqlserver") {
    const pool = await sql.connect({
      server: data.host,
      port: data.port,
      database: data.database,
      user: data.username,
      password: data.password,
      options: { encrypt: true, trustServerCertificate: true },
      connectionTimeout: 10000,
      requestTimeout: 10000,
    });
    try {
      await pool.request().query("SELECT 1");
    } finally {
      await pool.close();
    }
    return "Conexão com SQL Server validada com sucesso.";
  }
  let connection: oracledb.Connection | undefined;
  try {
    connection = await oracledb.getConnection({
      user: data.username,
      password: data.password,
      connectString: `${data.host}:${data.port}/${data.database}`,
    });
    await connection.execute("SELECT 1 FROM DUAL");
    return "Conexão com Oracle validada com sucesso.";
  } finally {
    await connection?.close().catch(() => undefined);
  }
}
function valueFrom(row: Record<string, unknown>, field: string) {
  const key = Object.keys(row).find(
    (candidate) => candidate.toUpperCase() === field,
  );
  return key ? row[key] : null;
}
function normalizeParameter(row: Record<string, unknown>): ParameterRow {
  const toStringOrNull = (value: unknown) =>
    value === null || value === undefined ? null : String(value);
  return {
    cdParametro: String(valueFrom(row, "CDPARAMETRO") ?? ""),
    deParametro: String(valueFrom(row, "DEPARAMETRO") ?? ""),
    vlParametro: toStringOrNull(valueFrom(row, "VLPARAMETRO")),
    deExplicacao: toStringOrNull(valueFrom(row, "DEEXPLICACAO")),
  };
}
async function queryParameters(
  data: Required<ConnectionPayload>,
): Promise<ParameterRow[]> {
  if (data.databaseType === "postgresql") {
    const client = new PgClient({
      host: data.host,
      port: data.port,
      database: data.database,
      user: data.username,
      password: data.password,
      connectionTimeoutMillis: 10000,
      ssl: false,
    });
    try {
      await client.connect();
      return (await client.query(parameterQuery)).rows.map((row) =>
        normalizeParameter(row),
      );
    } finally {
      await client.end().catch(() => undefined);
    }
  }
  if (data.databaseType === "sqlserver") {
    const pool = await new sql.ConnectionPool({
      server: data.host,
      port: data.port,
      database: data.database,
      user: data.username,
      password: data.password,
      options: { encrypt: true, trustServerCertificate: true },
      connectionTimeout: 10000,
      requestTimeout: 30000,
    }).connect();
    try {
      return (await pool.request().query(parameterQuery)).recordset.map((row) =>
        normalizeParameter(row),
      );
    } finally {
      await pool.close();
    }
  }
  let connection: oracledb.Connection | undefined;
  try {
    connection = await oracledb.getConnection({
      user: data.username,
      password: data.password,
      connectString: `${data.host}:${data.port}/${data.database}`,
    });
    const result = await connection.execute<Record<string, unknown>>(
      parameterQuery,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return (result.rows || []).map(normalizeParameter);
  } finally {
    await connection?.close().catch(() => undefined);
  }
}

type WebService = {
  code: string;
  description: string;
  integrationType: string;
};
type WebServiceParameter = {
  parameter: string;
  description: string | null;
  value: string | null;
};
const valueText = (row: Record<string, unknown>, field: string) =>
  String(valueFrom(row, field) ?? "");
const nullableText = (row: Record<string, unknown>, field: string) => {
  const value = valueFrom(row, field);
  return value === null || value === undefined ? null : String(value);
};
function normalizeWebService(row: Record<string, unknown>): WebService {
  return {
    code: valueText(row, "CDWEBSERVICES"),
    description: valueText(row, "DEWEBSERVICES"),
    integrationType: valueText(row, "SGTIPOINTEGRACAO"),
  };
}
function normalizeWebServiceParameter(
  row: Record<string, unknown>,
): WebServiceParameter {
  return {
    parameter: valueText(row, "DEPARAMETRO"),
    description: nullableText(row, "DEDESCRICAO"),
    value: nullableText(row, "VLPARAMETRO"),
  };
}
async function queryWebServiceRows(
  data: Required<ConnectionPayload>,
  serviceCode?: string,
): Promise<Record<string, unknown>[]> {
  if (data.databaseType === "postgresql") {
    const client = new PgClient({
      host: data.host,
      port: data.port,
      database: data.database,
      user: data.username,
      password: data.password,
      connectionTimeoutMillis: 10000,
      ssl: false,
    });
    try {
      await client.connect();
      return (
        await client.query(
          serviceCode ? `${webServiceParametersQuery}$1` : webServicesQuery,
          serviceCode ? [serviceCode] : [],
        )
      ).rows;
    } finally {
      await client.end().catch(() => undefined);
    }
  }
  if (data.databaseType === "sqlserver") {
    const pool = await new sql.ConnectionPool({
      server: data.host,
      port: data.port,
      database: data.database,
      user: data.username,
      password: data.password,
      options: { encrypt: true, trustServerCertificate: true },
      connectionTimeout: 10000,
      requestTimeout: 30000,
    }).connect();
    try {
      const request = pool.request();
      if (serviceCode) request.input("serviceCode", sql.VarChar, serviceCode);
      return (
        await request.query(
          serviceCode
            ? `${webServiceParametersQuery}@serviceCode`
            : webServicesQuery,
        )
      ).recordset;
    } finally {
      await pool.close();
    }
  }
  let connection: oracledb.Connection | undefined;
  try {
    connection = await oracledb.getConnection({
      user: data.username,
      password: data.password,
      connectString: `${data.host}:${data.port}/${data.database}`,
    });
    const result = await connection.execute<Record<string, unknown>>(
      serviceCode
        ? `${webServiceParametersQuery}:serviceCode`
        : webServicesQuery,
      serviceCode ? { serviceCode } : [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    return result.rows || [];
  } finally {
    await connection?.close().catch(() => undefined);
  }
}
async function queryWebServices(data: Required<ConnectionPayload>) {
  return (await queryWebServiceRows(data))
    .map(normalizeWebService)
    .sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true }));
}
async function queryWebServiceParameters(
  data: Required<ConnectionPayload>,
  serviceCode: string,
) {
  return (await queryWebServiceRows(data, serviceCode)).map(
    normalizeWebServiceParameter,
  );
}
function compareWebServiceParameters(
  first: WebServiceParameter[],
  second: WebServiceParameter[],
) {
  const firstByParameter = new Map(first.map((row) => [row.parameter, row]));
  const secondByParameter = new Map(second.map((row) => [row.parameter, row]));
  return [...new Set([...firstByParameter.keys(), ...secondByParameter.keys()])]
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))
    .map((parameter) => {
      const firstRow = firstByParameter.get(parameter);
      const secondRow = secondByParameter.get(parameter);
      return {
        cdParametro: parameter,
        deParametro: firstRow?.description ?? secondRow?.description ?? "",
        deParametroFirst: firstRow?.description ?? null,
        deParametroSecond: secondRow?.description ?? null,
        descriptionDifferent: Boolean(
          firstRow &&
          secondRow &&
          firstRow.description !== secondRow.description,
        ),
        firstExplanation: firstRow?.description ?? null,
        secondExplanation: secondRow?.description ?? null,
        firstValue: firstRow?.value ?? null,
        secondValue: secondRow?.value ?? null,
        valuesDifferent: firstRow?.value !== secondRow?.value,
        foundInFirst: Boolean(firstRow),
        foundInSecond: Boolean(secondRow),
      };
    });
}
function comparisonConnection(side: CompareSide): Required<ConnectionPayload> {
  return validate(side) as Required<ConnectionPayload>;
}
function compareParameters(first: ParameterRow[], second: ParameterRow[]) {
  const firstByCode = new Map(first.map((row) => [row.cdParametro, row]));
  const secondByCode = new Map(second.map((row) => [row.cdParametro, row]));
  return [...new Set([...firstByCode.keys(), ...secondByCode.keys()])]
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))
    .map((cdParametro) => {
      const firstRow = firstByCode.get(cdParametro);
      const secondRow = secondByCode.get(cdParametro);
      return {
        cdParametro,
        deParametro: firstRow?.deParametro ?? secondRow?.deParametro ?? "",
        deParametroFirst: firstRow?.deParametro ?? null,
        deParametroSecond: secondRow?.deParametro ?? null,
        descriptionDifferent: Boolean(
          firstRow &&
          secondRow &&
          firstRow.deParametro !== secondRow.deParametro,
        ),
        firstExplanation: firstRow?.deExplicacao ?? null,
        secondExplanation: secondRow?.deExplicacao ?? null,
        firstValue: firstRow?.vlParametro ?? null,
        secondValue: secondRow?.vlParametro ?? null,
        valuesDifferent: firstRow?.vlParametro !== secondRow?.vlParametro,
        foundInFirst: Boolean(firstRow),
        foundInSecond: Boolean(secondRow),
      };
    });
}

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, version: apiVersion }),
);
app.post("/api/connections/test", async (req, res, next) => {
  try {
    const data = validate(req.body);
    const message = await testConnection(data as Required<ConnectionPayload>);
    res.json({ ok: true, message });
  } catch (error) {
    next(error);
  }
});
app.post("/api/compare", async (req, res, next) => {
  try {
    const body = req.body as {
      first?: CompareSide;
      second?: CompareSide;
      ignoredParameters?: unknown;
    };
    const firstConnection = comparisonConnection(body.first || {});
    const secondConnection = comparisonConnection(body.second || {});
    const ignored = new Set(
      Array.isArray(body.ignoredParameters)
        ? body.ignoredParameters
            .map((value) => String(value).trim().toLocaleUpperCase())
            .filter(Boolean)
        : [],
    );
    const firstRows = (await queryParameters(firstConnection)).filter(
      (row) => !ignored.has(row.cdParametro.trim().toLocaleUpperCase()),
    );
    const secondRows = (await queryParameters(secondConnection)).filter(
      (row) => !ignored.has(row.cdParametro.trim().toLocaleUpperCase()),
    );
    res.json({
      rows: compareParameters(firstRows, secondRows),
      firstCount: firstRows.length,
      secondCount: secondRows.length,
    });
  } catch (error) {
    next(error);
  }
});
app.post("/api/webservices", async (req, res, next) => {
  try {
    const connection = comparisonConnection(
      (req.body as { connection?: CompareSide }).connection || {},
    );
    res.json({ webservices: await queryWebServices(connection) });
  } catch (error) {
    next(error);
  }
});
app.post("/api/webservices/compare", async (req, res, next) => {
  try {
    const body = req.body as {
      first?: CompareSide;
      second?: CompareSide;
      firstServiceCode?: unknown;
      secondServiceCode?: unknown;
    };
    const firstServiceCode = String(body.firstServiceCode || "").trim();
    const secondServiceCode = String(body.secondServiceCode || "").trim();
    if (!firstServiceCode || !secondServiceCode)
      throw new Error("Selecione um Webservice em cada base.");
    const firstRows = await queryWebServiceParameters(
      comparisonConnection(body.first || {}),
      firstServiceCode,
    );
    const secondRows = await queryWebServiceParameters(
      comparisonConnection(body.second || {}),
      secondServiceCode,
    );
    res.json({
      rows: compareWebServiceParameters(firstRows, secondRows),
      firstCount: firstRows.length,
      secondCount: secondRows.length,
    });
  } catch (error) {
    next(error);
  }
});
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(400).json({ message: safeError(error) });
});
const port = Number(process.env.PORT || 3333);
const host = process.env.HOST || "127.0.0.1";
app.listen(port, host, () =>
  console.log(`API disponível em http://${host}:${port}`),
);
