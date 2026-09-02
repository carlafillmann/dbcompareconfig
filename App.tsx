import { Picker } from "@react-native-picker/picker";
import { StatusBar } from "expo-status-bar";
import { createElement, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  createComparisonCriterion,
  createConnection,
  createParameterGroup,
  createUser,
  deleteConnection,
  FirestoreComparisonCriterion,
  FirestoreConnection,
  FirestoreParameterGroup,
  FirestoreUserProfile,
  getApiVersionSettings,
  listComparisonCriteria,
  listConnections,
  listParameterGroups,
  listUsers,
  updateComparisonCriterion,
  updateConnection,
  updateParameterGroup,
  updateUser,
  updateUserTheme,
  UserThemePreference,
} from "./firebase";

type DatabaseType = "oracle" | "sqlserver" | "postgresql";
type EnvironmentType =
  | "Produção"
  | "Homologação"
  | "Teste"
  | "Espelho"
  | "Nimitz"
  | "Interna"
  | "Desenvolvimento";
type Connection = FirestoreConnection;
type FormData = Omit<Connection, "id" | "ownerUserId"> & { password: string };
type Notice = {
  type: "success" | "error";
  title: string;
  message: string;
} | null;
type CompareSelection = {
  connectionId: string;
  username: string;
  password: string;
};
type Theme = UserThemePreference;
type UserForm = {
  username: string;
  name: string;
  password: string;
  role: "Comum" | "Administrador";
  email: string;
  active: boolean;
};
type CompareResult = {
  cdParametro: string;
  deParametro: string;
  deParametroFirst: string | null;
  deParametroSecond: string | null;
  descriptionDifferent: boolean;
  firstExplanation: string | null;
  secondExplanation: string | null;
  firstValue: string | null;
  secondValue: string | null;
  valuesDifferent: boolean;
  foundInFirst: boolean;
  foundInSecond: boolean;
};
type WebServiceOption = {
  code: string;
  description: string;
  integrationType: string;
};

const apiUrl =
  process.env.EXPO_PUBLIC_DATABASE_API_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "http://127.0.0.1:3333";
const connectorDownloadUrl =
  "https://github.com/carlafillmann/dbcompareconfig/releases/download/v1.0.5/DBCompare.Connector.Setup.1.0.5.exe";
const environments: EnvironmentType[] = [
  "Produção",
  "Homologação",
  "Teste",
  "Espelho",
  "Nimitz",
  "Interna",
  "Desenvolvimento",
];
const environmentsWithDefaultPassword: EnvironmentType[] = [
  "Espelho",
  "Nimitz",
  "Interna",
  "Desenvolvimento",
];
const databaseTypes: DatabaseType[] = ["postgresql", "oracle", "sqlserver"];
const defaultPort: Record<DatabaseType, number> = {
  oracle: 1521,
  sqlserver: 1433,
  postgresql: 5432,
};
const emptyForm: FormData = {
  name: "",
  environmentType: "Produção",
  databaseType: "postgresql",
  host: "",
  port: 5432,
  database: "",
  username: "",
  password: "",
};
const emptyUserForm: UserForm = {
  username: "",
  name: "",
  password: "trocar123",
  role: "Comum",
  email: "",
  active: true,
};
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Erro desconhecido.";
const databaseLabel = (type: DatabaseType) =>
  ({ oracle: "Oracle", sqlserver: "SQL Server", postgresql: "PostgreSQL" })[
    type
  ];
const initials = (type: DatabaseType) =>
  ({ oracle: "OR", sqlserver: "MS", postgresql: "PG" })[type];
const databaseColor = (type: DatabaseType) =>
  ({ oracle: "#FDE8E7", sqlserver: "#E4EEFF", postgresql: "#E6F5F0" })[type];
const hashPassword = async (password: string) => {
  const bytes = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

function Field({
  label,
  children,
  compact = false,
}: {
  label: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <View style={[styles.field, compact && styles.compactField]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}
function NoticeBox({ notice }: { notice: Exclude<Notice, null> }) {
  return (
    <View
      style={[
        styles.notice,
        notice.type === "success" ? styles.noticeSuccess : styles.noticeError,
      ]}
    >
      <Text style={styles.noticeTitle}>{notice.title}</Text>
      <Text style={styles.noticeText}>{notice.message}</Text>
    </View>
  );
}
function Tab({
  text,
  icon,
  active,
  onPress,
}: {
  text: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tab, styles.sideTab, active && styles.sideTabActive]}
    >
      <View style={[styles.tabIcon, active && styles.tabIconActive]}>
        <Text style={[styles.tabIconText, active && styles.tabIconTextActive]}>
          {icon}
        </Text>
      </View>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {text}
      </Text>
    </Pressable>
  );
}
function ConstructionPanel({ title }: { title: string }) {
  return (
    <View style={styles.constructionPanel}>
      <Image
        source={require("./assets/under-construction.png")}
        style={styles.constructionImage}
        resizeMode="contain"
      />
      <Text style={styles.constructionTitle}>{title}</Text>
      <Text style={styles.constructionText}>Em construção</Text>
    </View>
  );
}
function WebservicesComparison({
  left,
  right,
  firstName,
  secondName,
  loadWebServices,
  compareWebServices,
  onDescriptionPress,
  refreshKey,
}: {
  left: CompareSelection;
  right: CompareSelection;
  firstName: string;
  secondName: string;
  loadWebServices: (selection: CompareSelection) => Promise<WebServiceOption[]>;
  compareWebServices: (
    firstCode: string,
    secondCode: string,
  ) => Promise<CompareResult[]>;
  onDescriptionPress: (row: CompareResult) => void;
  refreshKey: number;
}) {
  const [firstServices, setFirstServices] = useState<WebServiceOption[]>([]);
  const [secondServices, setSecondServices] = useState<WebServiceOption[]>([]);
  const [firstCode, setFirstCode] = useState("");
  const [secondCode, setSecondCode] = useState("");
  const [rows, setRows] = useState<CompareResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [onlyDifferent, setOnlyDifferent] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({
    code: "",
    description: "",
    explanation: "",
    first: "",
    second: "",
    status: "",
  });
  useEffect(() => {
    setFirstCode("");
    setSecondCode("");
    setRows(null);
    setError("");
    if (
      !left.connectionId ||
      !right.connectionId ||
      !left.password ||
      !right.password
    ) {
      setFirstServices([]);
      setSecondServices([]);
      return;
    }
    setLoading(true);
    Promise.all([loadWebServices(left), loadWebServices(right)])
      .then(([first, second]) => {
        setFirstServices(first);
        setSecondServices(second);
      })
      .catch((error) => setError(errorText(error)))
      .finally(() => setLoading(false));
  }, [
    left.connectionId,
    right.connectionId,
    left.username,
    left.password,
    right.username,
    right.password,
    refreshKey,
  ]);
  useEffect(() => {
    if (!firstCode || !secondCode) return;
    setLoading(true);
    setError("");
    compareWebServices(firstCode, secondCode)
      .then(setRows)
      .catch((error) => {
        setRows(null);
        setError(errorText(error));
      })
      .finally(() => setLoading(false));
  }, [firstCode, secondCode]);
  const itemLabel = (item: WebServiceOption) =>
    `${item.code} - ${item.description} - ${item.integrationType}`;
  return (
    <View>
      <View style={styles.webserviceSelectors}>
        <View style={styles.flexOne}>
          <Field label={firstName}>
            <View style={styles.pickerBox}>
              <Picker
                style={styles.fullPicker}
                selectedValue={firstCode}
                onValueChange={setFirstCode}
                enabled={!loading && firstServices.length > 0}
              >
                <Picker.Item label="Selecione um Webservice" value="" />
                {firstServices.map((item) => (
                  <Picker.Item
                    key={item.code}
                    label={itemLabel(item)}
                    value={item.code}
                  />
                ))}
              </Picker>
            </View>
          </Field>
        </View>
        <View style={styles.flexOne}>
          <Field label={secondName}>
            <View style={styles.pickerBox}>
              <Picker
                style={styles.fullPicker}
                selectedValue={secondCode}
                onValueChange={setSecondCode}
                enabled={!loading && secondServices.length > 0}
              >
                <Picker.Item label="Selecione um Webservice" value="" />
                {secondServices.map((item) => (
                  <Picker.Item
                    key={item.code}
                    label={itemLabel(item)}
                    value={item.code}
                  />
                ))}
              </Picker>
            </View>
          </Field>
        </View>
      </View>
      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator color="#6558F5" />
          <Text style={styles.muted}>Consultando Webservices…</Text>
        </View>
      )}
      {error ? <Text style={styles.loginError}>{error}</Text> : null}
      {!loading &&
        !error &&
        (!left.connectionId ||
          !right.connectionId ||
          !left.password ||
          !right.password) && (
          <Text style={styles.muted}>
            Selecione as duas bases e informe suas senhas para consultar os
            Webservices.
          </Text>
        )}
      {rows && (
        <CompareResults
          rows={rows}
          firstName={firstName}
          secondName={secondName}
          onlyDifferent={onlyDifferent}
          onOnlyDifferentChange={setOnlyDifferent}
          filters={filters}
          onFilterChange={(column, value) =>
            setFilters((current) => ({ ...current, [column]: value }))
          }
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((value) => !value)}
          onDescriptionPress={onDescriptionPress}
          onExplanationPress={onDescriptionPress}
          webservice
        />
      )}
    </View>
  );
}
function FeaturesComparison({
  left,
  right,
  firstName,
  secondName,
  compareFeatures,
  onDescriptionPress,
  refreshKey,
}: {
  left: CompareSelection;
  right: CompareSelection;
  firstName: string;
  secondName: string;
  compareFeatures: () => Promise<CompareResult[]>;
  onDescriptionPress: (row: CompareResult) => void;
  refreshKey: number;
}) {
  const [rows, setRows] = useState<CompareResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [onlyDifferent, setOnlyDifferent] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({
    code: "",
    description: "",
    explanation: "",
    first: "",
    second: "",
    status: "",
  });
  useEffect(() => {
    setRows(null);
    setError("");
    if (
      !left.connectionId ||
      !right.connectionId ||
      !left.password ||
      !right.password
    )
      return;
    setLoading(true);
    compareFeatures()
      .then(setRows)
      .catch((error) => setError(errorText(error)))
      .finally(() => setLoading(false));
  }, [
    left.connectionId,
    right.connectionId,
    left.username,
    left.password,
    right.username,
    right.password,
    refreshKey,
  ]);
  return (
    <View>
      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator color="#6558F5" />
          <Text style={styles.muted}>Consultando Features…</Text>
        </View>
      )}
      {error ? <Text style={styles.loginError}>{error}</Text> : null}
      {!loading &&
        !error &&
        (!left.connectionId ||
          !right.connectionId ||
          !left.password ||
          !right.password) && (
          <Text style={styles.muted}>
            Selecione as duas bases e informe suas senhas para comparar as
            Features.
          </Text>
        )}
      {rows && (
        <CompareResults
          rows={rows}
          firstName={firstName}
          secondName={secondName}
          onlyDifferent={onlyDifferent}
          onOnlyDifferentChange={setOnlyDifferent}
          filters={filters}
          onFilterChange={(column, value) =>
            setFilters((current) => ({ ...current, [column]: value }))
          }
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((value) => !value)}
          onDescriptionPress={onDescriptionPress}
          onExplanationPress={onDescriptionPress}
          features
        />
      )}
    </View>
  );
}
function CompareOutput(
  props: React.ComponentProps<typeof CompareResults> & {
    left: CompareSelection;
    right: CompareSelection;
    loadWebServices: (
      selection: CompareSelection,
    ) => Promise<WebServiceOption[]>;
    compareWebServices: (
      firstCode: string,
      secondCode: string,
    ) => Promise<CompareResult[]>;
    compareFeatures: () => Promise<CompareResult[]>;
    comparisonVersion: number;
  },
) {
  const [tab, setTab] = useState<
    "general" | "system" | "webservices" | "features" | "judicialBodies"
  >("general");
  return (
    <View>
      <View style={styles.compareSubtabs}>
        <Pressable
          style={[
            styles.compareSubtab,
            tab === "general" && styles.compareSubtabActive,
          ]}
          onPress={() => setTab("general")}
        >
          <Text
            style={[
              styles.compareSubtabText,
              tab === "general" && styles.compareSubtabTextActive,
            ]}
          >
            Comparações Gerais
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.compareSubtab,
            tab === "system" && styles.compareSubtabActive,
          ]}
          onPress={() => setTab("system")}
        >
          <Text
            style={[
              styles.compareSubtabText,
              tab === "system" && styles.compareSubtabTextActive,
            ]}
          >
            Parâmetros do sistema
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.compareSubtab,
            tab === "webservices" && styles.compareSubtabActive,
          ]}
          onPress={() => setTab("webservices")}
        >
          <Text
            style={[
              styles.compareSubtabText,
              tab === "webservices" && styles.compareSubtabTextActive,
            ]}
          >
            Parâmetros de Webservices
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.compareSubtab,
            tab === "features" && styles.compareSubtabActive,
          ]}
          onPress={() => setTab("features")}
        >
          <Text
            style={[
              styles.compareSubtabText,
              tab === "features" && styles.compareSubtabTextActive,
            ]}
          >
            Features
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.compareSubtab,
            tab === "judicialBodies" && styles.compareSubtabActive,
          ]}
          onPress={() => setTab("judicialBodies")}
        >
          <Text
            style={[
              styles.compareSubtabText,
              tab === "judicialBodies" && styles.compareSubtabTextActive,
            ]}
          >
            Órgãos Judiciais
          </Text>
        </Pressable>
      </View>
      <View style={tab === "general" ? undefined : styles.hiddenTab}>
        <ConstructionPanel title="Comparações Gerais" />
      </View>
      <View style={tab === "system" ? undefined : styles.hiddenTab}>
        <CompareResults {...props} />
      </View>
      <View style={tab === "webservices" ? undefined : styles.hiddenTab}>
        <WebservicesComparison
          left={props.left}
          right={props.right}
          firstName={props.firstName}
          secondName={props.secondName}
          loadWebServices={props.loadWebServices}
          compareWebServices={props.compareWebServices}
          onDescriptionPress={props.onExplanationPress}
          refreshKey={props.comparisonVersion}
        />
      </View>
      <View style={tab === "features" ? undefined : styles.hiddenTab}>
        <FeaturesComparison
          left={props.left}
          right={props.right}
          firstName={props.firstName}
          secondName={props.secondName}
          compareFeatures={props.compareFeatures}
          onDescriptionPress={props.onExplanationPress}
          refreshKey={props.comparisonVersion}
        />
      </View>
      <View style={tab === "judicialBodies" ? undefined : styles.hiddenTab}>
        <ConstructionPanel title="Órgãos Judiciais" />
      </View>
    </View>
  );
}
function CompareCard({
  title,
  subtitle,
  selection,
  connections,
  onSelect,
  onChange,
}: {
  title: string;
  subtitle: string;
  selection: CompareSelection;
  connections: Connection[];
  onSelect: (id: string) => void;
  onChange: (selection: CompareSelection) => void;
}) {
  return (
    <View style={[styles.compareCard, styles.compactCompareCard]}>
      <Text style={styles.compareCardTitle}>{title}</Text>
      <Text
        style={[styles.compareCardSubtitle, styles.compactCompareCardSubtitle]}
      >
        {subtitle}
      </Text>
      <Field label="Conexão cadastrada" compact>
        <View style={[styles.pickerBox, styles.connectionPickerBox]}>
          <Picker
            style={styles.connectionPicker}
            selectedValue={selection.connectionId}
            onValueChange={onSelect}
          >
            <Picker.Item label="Selecione uma conexão" value="" />
            {connections.map((connection) => (
              <Picker.Item
                key={connection.id}
                label={`${connection.name} · ${databaseLabel(connection.databaseType)}`}
                value={connection.id}
              />
            ))}
          </Picker>
        </View>
      </Field>
      <Field label="Usuário" compact>
        <TextInput
          style={styles.input}
          value={selection.username}
          onChangeText={(username) => onChange({ ...selection, username })}
          autoCapitalize="none"
          placeholder="Selecionado automaticamente"
          placeholderTextColor="#98A2B3"
        />
      </Field>
      <Field label="Senha" compact>
        <TextInput
          style={styles.input}
          value={selection.password}
          onChangeText={(password) => onChange({ ...selection, password })}
          secureTextEntry
          autoCapitalize="none"
          placeholder="Senha da base"
          placeholderTextColor="#98A2B3"
        />
      </Field>
    </View>
  );
}
function CompareResults({
  rows,
  firstName,
  secondName,
  onlyDifferent,
  onOnlyDifferentChange,
  filters,
  onFilterChange,
  showFilters,
  onToggleFilters,
  onDescriptionPress,
  onExplanationPress,
  webservice = false,
  features = false,
  parameterGroups = [],
  selectedParameterGroupId = "",
  onParameterGroupChange,
}: {
  rows: CompareResult[];
  firstName: string;
  secondName: string;
  onlyDifferent: boolean;
  onOnlyDifferentChange: (value: boolean) => void;
  filters: Record<string, string>;
  onFilterChange: (column: string, value: string) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  onDescriptionPress: (row: CompareResult) => void;
  onExplanationPress: (row: CompareResult) => void;
  webservice?: boolean;
  features?: boolean;
  parameterGroups?: FirestoreParameterGroup[];
  selectedParameterGroupId?: string;
  onParameterGroupChange?: (id: string) => void;
}) {
  const isDifferent = (row: CompareResult) =>
    row.valuesDifferent || !row.foundInFirst || !row.foundInSecond;
  const status = (row: CompareResult) =>
    isDifferent(row) ? "Diferente" : "Igual";
  const displayed = rows.filter(
    (row) =>
      (!onlyDifferent || isDifferent(row)) &&
      (!selectedParameterGroupId ||
        parameterGroups
          .find((group) => group.id === selectedParameterGroupId)
          ?.parameterCodes.includes(row.cdParametro)) &&
      [
        row.cdParametro,
        row.deParametro,
        row.firstExplanation ?? "",
        row.firstValue ?? "",
        row.secondValue ?? "",
        status(row),
      ].every((value, index) =>
        value
          .toLocaleLowerCase()
          .includes(
            (
              filters[
                [
                  "code",
                  "description",
                  "explanation",
                  "first",
                  "second",
                  "status",
                ][index]
              ] || ""
            ).toLocaleLowerCase(),
          ),
      ),
  );
  const exportCsv = () => {
    if (Platform.OS !== "web") return;
    const escape = (value: string | null) =>
      `"${(value ?? "").replace(/"/g, '""')}"`;
    const content = [
      [
        "CDPARAMETRO",
        "DEPARAMETRO",
        "DEEXPLICACAO",
        firstName,
        secondName,
        "STATUS",
      ],
      ...displayed.map((row) => [
        row.cdParametro,
        row.deParametro,
        row.firstExplanation,
        row.firstValue,
        row.secondValue,
        status(row),
      ]),
    ]
      .map((line) => line.map(escape).join(";"))
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8;" }),
    );
    link.download = "comparacao-de-parametros.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <View style={styles.resultsCard}>
      <View style={styles.resultsHeading}>
        <View style={styles.resultsSummary}>
          <Text style={styles.sectionTitle}>Resultado da comparação</Text>
          {!webservice && onParameterGroupChange && (
            <View style={styles.parameterGroupFilter}>
              <Text style={styles.parameterGroupLabel}>
                Filtrar grupo de parâmetros
              </Text>
              <View style={styles.parameterGroupPicker}>
                <Picker
                  style={styles.fullPicker}
                  selectedValue={selectedParameterGroupId}
                  onValueChange={onParameterGroupChange}
                >
                  <Picker.Item label="Todos os parâmetros" value="" />
                  {parameterGroups.map((group) => (
                    <Picker.Item
                      key={group.id}
                      label={group.description}
                      value={group.id}
                    />
                  ))}
                </Picker>
              </View>
            </View>
          )}
        </View>
        <View style={styles.resultControls}>
          <Pressable
            onPress={() => onOnlyDifferentChange(!onlyDifferent)}
            style={styles.checkboxLine}
          >
            <View
              style={[styles.checkbox, onlyDifferent && styles.checkboxChecked]}
            >
              {onlyDifferent && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxText}>
              Exibir apenas parâmetros com valores distintos
            </Text>
          </Pressable>
          <View style={styles.resultsCountLine}>
            <Image
              source={require("./assets/database-search.png")}
              style={styles.resultsCountIcon}
              resizeMode="contain"
            />
            <Text style={styles.sectionSubtitle}>
              {rows.filter(isDifferent).length} parâmetros com diferença
            </Text>
            <Pressable
              onPress={exportCsv}
              style={styles.excelButton}
              accessibilityLabel="Exportar resultado para Excel"
            >
              <Text style={styles.excelText}>XLS</Text>
            </Pressable>
          </View>
        </View>
      </View>
      <ScrollView horizontal>
        <View style={styles.resultsTable}>
          <View style={[styles.resultRow, styles.resultHead]}>
            <Text
              style={[
                styles.tableHeadText,
                styles.codeResult,
                webservice && styles.webserviceCodeResult,
                features && styles.featureCodeResult,
              ]}
            >
              {features ? "FEATURE" : webservice ? "PARÂMETRO" : "CÓDIGO"}
            </Text>
            {!features && (
              <Text
                style={[
                  styles.tableHeadText,
                  styles.descriptionResult,
                  webservice && styles.webserviceDescriptionResult,
                ]}
              >
                {webservice ? "DESCRIÇÃO" : "DESCRIÇÃO"}
              </Text>
            )}
            {!features && (
              <Text style={[styles.tableHeadText, styles.explanationResult]}>
                {webservice ? "" : "EXPLICAÇÃO"}
              </Text>
            )}
            <Text
              style={[
                styles.tableHeadText,
                styles.valueResult,
                webservice && styles.webserviceValueResult,
              ]}
            >
              {firstName.toUpperCase()}
            </Text>
            <Text
              style={[
                styles.tableHeadText,
                styles.valueResult,
                webservice && styles.webserviceValueResult,
              ]}
            >
              {secondName.toUpperCase()}
            </Text>
            <View style={[styles.statusResult, styles.statusHeader]}>
              <Text style={styles.tableHeadText}>STATUS</Text>
              <Pressable
                onPress={onToggleFilters}
                style={styles.filterButton}
                accessibilityLabel="Exibir filtros"
              >
                <Text style={styles.filterIcon}>⌕</Text>
              </Pressable>
            </View>
          </View>
          {showFilters && (
            <View style={[styles.resultRow, styles.filterRow]}>
              <TextInput
                style={[
                  styles.filterInput,
                  styles.codeResult,
                  webservice && styles.webserviceCodeResult,
                  features && styles.featureCodeResult,
                ]}
                value={filters.code}
                onChangeText={(value) => onFilterChange("code", value)}
                placeholder="Filtrar"
                placeholderTextColor="#98A2B3"
              />
              {!features && (
                <TextInput
                  style={[
                    styles.filterInput,
                    styles.descriptionResult,
                    webservice && styles.webserviceDescriptionResult,
                  ]}
                  value={filters.description}
                  onChangeText={(value) => onFilterChange("description", value)}
                  placeholder="Filtrar"
                  placeholderTextColor="#98A2B3"
                />
              )}
              {!features && (
                <TextInput
                  style={[styles.filterInput, styles.explanationResult]}
                  value={filters.explanation}
                  onChangeText={(value) => onFilterChange("explanation", value)}
                  placeholder="Filtrar"
                  placeholderTextColor="#98A2B3"
                />
              )}
              <TextInput
                style={[
                  styles.filterInput,
                  styles.valueResult,
                  webservice && styles.webserviceValueResult,
                ]}
                value={filters.first}
                onChangeText={(value) => onFilterChange("first", value)}
                placeholder="Filtrar"
                placeholderTextColor="#98A2B3"
              />
              <TextInput
                style={[
                  styles.filterInput,
                  styles.valueResult,
                  webservice && styles.webserviceValueResult,
                ]}
                value={filters.second}
                onChangeText={(value) => onFilterChange("second", value)}
                placeholder="Filtrar"
                placeholderTextColor="#98A2B3"
              />
              {features ? (
                <View style={styles.statusResult} />
              ) : (
                <TextInput
                  style={[styles.filterInput, styles.statusResult]}
                  value={filters.status}
                  onChangeText={(value) => onFilterChange("status", value)}
                  placeholder="Filtrar"
                  placeholderTextColor="#98A2B3"
                />
              )}
            </View>
          )}
          {displayed.map((row) => (
            <View key={row.cdParametro} style={styles.resultRow}>
              <Text
                style={[
                  styles.cellText,
                  styles.codeResult,
                  webservice && styles.webserviceCodeResult,
                  features && styles.featureCodeResult,
                ]}
              >
                {row.cdParametro}
              </Text>
              {!features && (
                <View
                  style={[
                    styles.descriptionResult,
                    webservice && styles.webserviceDescriptionResult,
                  ]}
                >
                  {webservice ? (
                    <Pressable
                      style={styles.ellipsisButton}
                      onPress={() => onExplanationPress(row)}
                      accessibilityLabel="Ver descrição"
                    >
                      <Text style={styles.ellipsisText}>•••</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.descriptionLine}>
                      <Text style={styles.cellText}>{row.deParametro}</Text>
                      {row.descriptionDifferent && (
                        <Pressable
                          accessibilityLabel="Ver diferença na descrição"
                          onPress={() => onDescriptionPress(row)}
                          style={styles.warning}
                        >
                          <Text style={styles.warningText}>!</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              )}
              {!features && (
                <View style={styles.explanationResult}>
                  {!webservice && (
                    <Pressable
                      style={styles.ellipsisButton}
                      onPress={() => onExplanationPress(row)}
                      accessibilityLabel="Ver explicação"
                    >
                      <Text style={styles.ellipsisText}>•••</Text>
                    </Pressable>
                  )}
                </View>
              )}
              <Text
                style={[
                  styles.cellText,
                  styles.valueResult,
                  webservice && styles.webserviceValueResult,
                ]}
              >
                {row.firstValue ?? "—"}
              </Text>
              <Text
                style={[
                  styles.cellText,
                  styles.valueResult,
                  webservice && styles.webserviceValueResult,
                ]}
              >
                {row.secondValue ?? "—"}
              </Text>
              <View style={styles.statusResult}>
                <View
                  style={[
                    styles.resultTag,
                    isDifferent(row)
                      ? styles.resultTagDifferent
                      : styles.resultTagEqual,
                  ]}
                >
                  <Text
                    style={[
                      styles.resultTagText,
                      isDifferent(row)
                        ? styles.resultTagTextDifferent
                        : styles.resultTagTextEqual,
                    ]}
                  >
                    {status(row)}
                  </Text>
                </View>
              </View>
            </View>
          ))}
          {displayed.length === 0 && (
            <View style={styles.noResults}>
              <Text style={styles.muted}>
                Nenhum parâmetro encontrado com os filtros atuais.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function LoginBackground() {
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [floatingDatabases] = useState(() =>
    Array.from({ length: 16 }, (_, id) => ({
      id,
      x: 3 + Math.random() * 91,
      y: 4 + Math.random() * 88,
      size: 34 + Math.round(Math.random() * 24),
      duration: 24 + Math.random() * 10,
      delay: -Math.random() * 34,
      x1: Math.round((Math.random() - 0.5) * 260),
      y1: Math.round((Math.random() - 0.5) * 180),
      x2: Math.round((Math.random() - 0.5) * 260),
      y2: Math.round((Math.random() - 0.5) * 180),
      x3: Math.round((Math.random() - 0.5) * 260),
      y3: Math.round((Math.random() - 0.5) * 180),
    })),
  );
  const [bursts, setBursts] = useState<{
    id: number;
    x: number;
    y: number;
    pieces: {
      kind: "die" | "bench";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      x3: number;
      y3: number;
      spin: number;
    }[];
  }[]>([]);
  const [trails, setTrails] = useState<{ id: number; x: number; y: number }[]>(
    [],
  );
  const lastTrailAt = useRef(0);
  const move = (event: any) => {
    const width = window.innerWidth || 1;
    const height = window.innerHeight || 1;
    setPointer({
      x: (event.clientX / width - 0.5) * 2,
      y: (event.clientY / height - 0.5) * 2,
    });
    if (event.buttons && Date.now() - lastTrailAt.current > 26) {
      const id = Date.now();
      lastTrailAt.current = id;
      setTrails((current) => [
        ...current,
        {
          id,
          x: (event.clientX / width) * 100,
          y: (event.clientY / height) * 100,
        },
      ]);
      setTimeout(
        () =>
          setTrails((current) => current.filter((trail) => trail.id !== id)),
        550,
      );
    }
  };
  const launchData = (event: any) => {
    const id = Date.now();
    const pieces = Array.from({ length: 8 }, (_, index) => {
      const point = () => Math.round((Math.random() - 0.5) * 420);
      return {
        kind: (index % 2 ? "bench" : "die") as "die" | "bench",
        x1: point(),
        y1: point(),
        x2: point(),
        y2: point(),
        x3: point(),
        y3: point(),
        spin: Math.round((Math.random() - 0.5) * 180),
      };
    });
    setBursts((current) => [
      ...current,
      {
        id,
        x: (event.clientX / (window.innerWidth || 1)) * 100,
        y: (event.clientY / (window.innerHeight || 1)) * 100,
        pieces,
      },
    ]);
    setTimeout(() => {
      setBursts((current) => current.filter((burst) => burst.id !== id));
    }, 10100);
  };
  const spriteAsset = require("./assets/login-animation-sprite.png");
  const spriteUri =
    typeof spriteAsset === "string"
      ? spriteAsset
      : spriteAsset.uri || spriteAsset.default || spriteAsset.src;
  const sprite = (
    kind: "database" | "die" | "bench",
    className: string,
    key?: string,
    style?: Record<string, string>,
  ) =>
    createElement(
      "span",
      { className, key, style },
      createElement("img", {
        className: `login-sprite-image login-sprite-${kind}`,
        src: spriteUri,
        alt: "",
      }),
    );
  return createElement(
    "div",
    {
      className: "login-animated-background",
      onMouseMove: move,
      onClick: launchData,
      "aria-hidden": true,
    },
    createElement(
      "style",
      null,
      `
        @keyframes loginWander { 0%,100% { transform:translate(var(--mouse-x),var(--mouse-y)) rotate(-3deg); } 25% { transform:translate(calc(var(--mouse-x) + var(--x1)),calc(var(--mouse-y) + var(--y1))) rotate(4deg); } 50% { transform:translate(calc(var(--mouse-x) + var(--x2)),calc(var(--mouse-y) + var(--y2))) rotate(-2deg); } 75% { transform:translate(calc(var(--mouse-x) + var(--x3)),calc(var(--mouse-y) + var(--y3))) rotate(3deg); } }
        @keyframes loginOrbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes loginPop { 0% { opacity:0; transform:translate(-50%,-50%) scale(.35) rotate(0deg); } 8% { opacity:1; } 35% { opacity:1; transform:translate(calc(-50% + var(--x1)),calc(-50% + var(--y1))) scale(.9) rotate(calc(var(--spin) * .35)); } 70% { opacity:.95; transform:translate(calc(-50% + var(--x2)),calc(-50% + var(--y2))) scale(1) rotate(calc(var(--spin) * .7)); } 100% { opacity:0; transform:translate(calc(-50% + var(--x3)),calc(-50% + var(--y3))) scale(.82) rotate(var(--spin)); } }
        @keyframes loginTrail { 0% { opacity:.9; transform:translate(-50%,-50%) scaleX(.35); } 100% { opacity:0; transform:translate(-50%,-50%) scaleX(1.8); } }
        .login-animated-background { position:absolute; inset:0; overflow:hidden; background:radial-gradient(circle at 20% 20%, rgba(91,142,255,.17), transparent 31%), radial-gradient(circle at 85% 74%, rgba(110,201,103,.14), transparent 28%), linear-gradient(135deg,#f8fbff 0%,#f2f6ff 55%,#f8fcfa 100%); }
        .login-animated-background::before { content:""; position:absolute; inset:0; opacity:.48; background-image:linear-gradient(rgba(85,115,175,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(85,115,175,.07) 1px,transparent 1px); background-size:34px 34px; mask-image:linear-gradient(to bottom,transparent,black 20%,black 80%,transparent); }
        .login-sprite-frame { display:block; overflow:hidden; position:absolute; filter:drop-shadow(0 8px 9px rgba(50,93,161,.13)); } .login-sprite-image { display:block; height:100%; width:auto; max-width:none; } .login-sprite-database { transform:translateX(0); } .login-sprite-die { transform:translateX(-33.3333%); } .login-sprite-bench { transform:translateX(-66.6667%); }
        .login-floating-db { width:54px; height:54px; animation:loginDrift var(--duration) ease-in-out infinite; pointer-events:none; }
        .login-float-one { left:8%; top:14%; --duration:4.8s; --drift-start-x:-28px; --drift-start-y:14px; --drift-end-x:138px; --drift-end-y:-19px; } .login-float-two { left:19%; bottom:17%; width:46px; height:46px; --duration:5.4s; --drift-start-x:-80px; --drift-start-y:-16px; --drift-end-x:94px; --drift-end-y:22px; animation-delay:-2.1s; } .login-float-three { right:11%; top:17%; width:50px; height:50px; --duration:5.1s; --drift-start-x:74px; --drift-start-y:12px; --drift-end-x:-112px; --drift-end-y:-25px; animation-delay:-3.7s; } .login-float-four { right:7%; bottom:14%; width:62px; height:62px; --duration:5.7s; --drift-start-x:58px; --drift-start-y:-18px; --drift-end-x:-102px; --drift-end-y:20px; animation-delay:-1.5s; } .login-float-five { left:33%; top:11%; width:38px; height:38px; --duration:4.6s; --drift-start-x:-62px; --drift-start-y:18px; --drift-end-x:101px; --drift-end-y:-14px; animation-delay:-4s; } .login-float-six { right:31%; bottom:12%; width:40px; height:40px; --duration:5s; --drift-start-x:60px; --drift-start-y:-12px; --drift-end-x:-96px; --drift-end-y:26px; animation-delay:-.9s; }
        .login-float-seven { left:3%; top:42%; width:36px; height:36px; --duration:4.9s; --drift-start-x:-28px; --drift-start-y:-18px; --drift-end-x:126px; --drift-end-y:16px; animation-delay:-1.2s; } .login-float-eight { left:27%; top:31%; width:44px; height:44px; --duration:5.3s; --drift-start-x:-78px; --drift-start-y:14px; --drift-end-x:88px; --drift-end-y:-18px; animation-delay:-3.2s; } .login-float-nine { left:43%; bottom:8%; width:34px; height:34px; --duration:4.7s; --drift-start-x:-58px; --drift-start-y:-14px; --drift-end-x:105px; --drift-end-y:20px; animation-delay:-.6s; } .login-float-ten { left:49%; top:8%; width:48px; height:48px; --duration:5.5s; --drift-start-x:-84px; --drift-start-y:15px; --drift-end-x:92px; --drift-end-y:-20px; animation-delay:-4.5s; } .login-float-eleven { right:24%; top:38%; width:37px; height:37px; --duration:4.8s; --drift-start-x:64px; --drift-start-y:-16px; --drift-end-x:-98px; --drift-end-y:17px; animation-delay:-2.8s; } .login-float-twelve { right:2%; top:48%; width:45px; height:45px; --duration:5.2s; --drift-start-x:54px; --drift-start-y:18px; --drift-end-x:-116px; --drift-end-y:-15px; animation-delay:-.3s; } .login-float-thirteen { left:12%; bottom:6%; width:42px; height:42px; --duration:5.6s; --drift-start-x:-42px; --drift-start-y:-19px; --drift-end-x:122px; --drift-end-y:19px; animation-delay:-3.9s; } .login-float-fourteen { left:39%; top:62%; width:39px; height:39px; --duration:4.5s; --drift-start-x:-74px; --drift-start-y:17px; --drift-end-x:91px; --drift-end-y:-14px; animation-delay:-1.7s; } .login-float-fifteen { right:16%; bottom:31%; width:35px; height:35px; --duration:5.1s; --drift-start-x:73px; --drift-start-y:-12px; --drift-end-x:-93px; --drift-end-y:23px; animation-delay:-4.2s; } .login-float-sixteen { right:42%; top:46%; width:43px; height:43px; --duration:4.9s; --drift-start-x:60px; --drift-start-y:16px; --drift-end-x:-106px; --drift-end-y:-18px; animation-delay:-2.4s; }
        .login-floating-db { pointer-events:none; animation:loginWander var(--wander-duration) linear var(--delay) infinite; }
        .login-orbit { position:absolute; width:250px; height:250px; left:50%; top:50%; margin-left:-125px; margin-top:-125px; border:1px solid rgba(70,116,206,.12); border-radius:50%; animation:loginOrbit 28s linear infinite; }
        .login-orbit::before,.login-orbit::after { content:""; position:absolute; width:11px; height:11px; border-radius:50%; background:#6b5cf6; box-shadow:0 0 0 6px rgba(107,92,246,.1); } .login-orbit::before { top:12px; left:33px; } .login-orbit::after { right:16px; bottom:52px; background:#69bb68; box-shadow:0 0 0 6px rgba(105,187,104,.1); }
        .login-explosion { width:42px; height:42px; z-index:2; animation:loginPop 10s ease-in-out forwards; pointer-events:none; } .login-golden-trail { position:absolute; z-index:3; width:20px; height:2px; border-radius:999px; background:linear-gradient(90deg,rgba(205,159,54,0),#d5a937,rgba(255,232,151,.9)); box-shadow:0 0 7px rgba(213,169,55,.65); animation:loginTrail .52s ease-out forwards; pointer-events:none; }
        @media (max-width:720px) { .login-floating-db { opacity:.58; } .login-orbit { opacity:.55; } .login-float-five,.login-float-six,.login-float-ten,.login-float-fourteen,.login-float-sixteen { display:none; } }
      `,
    ),
    ...floatingDatabases.map((database) =>
      sprite(
        "database",
        "login-sprite-frame login-floating-db",
        String(database.id),
        {
          left: `${database.x}%`,
          top: `${database.y}%`,
          width: `${database.size}px`,
          height: `${database.size}px`,
          "--wander-duration": `${database.duration}s`,
          "--delay": `${database.delay}s`,
          "--x1": `${database.x1}px`,
          "--y1": `${database.y1}px`,
          "--x2": `${database.x2}px`,
          "--y2": `${database.y2}px`,
          "--x3": `${database.x3}px`,
          "--y3": `${database.y3}px`,
          "--mouse-x": `${pointer.x * 7}px`,
          "--mouse-y": `${pointer.y * 5}px`,
        },
      ),
    ),
    createElement("span", { className: "login-orbit" }),
    ...bursts.flatMap((burst) =>
      burst.pieces.map((piece, index) =>
        sprite(
          piece.kind,
          "login-sprite-frame login-explosion",
          `${burst.id}-${index}`,
          {
            left: `${burst.x}%`,
            top: `${burst.y}%`,
            "--x1": `${piece.x1}px`,
            "--y1": `${piece.y1}px`,
            "--x2": `${piece.x2}px`,
            "--y2": `${piece.y2}px`,
            "--x3": `${piece.x3}px`,
            "--y3": `${piece.y3}px`,
            "--spin": `${piece.spin}deg`,
          },
        ),
      ),
    ),
    ...trails.map((trail) =>
      createElement("span", {
        className: "login-golden-trail",
        key: trail.id,
        style: { left: `${trail.x}%`, top: `${trail.y}%` },
      }),
    ),
  );
}

function LoginScreen({
  onLogin,
}: {
  onLogin: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    try {
      setLoading(true);
      setError("");
      await onLogin(username, password);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setLoading(false);
    }
  };
  if (Platform.OS === "web")
    return (
      <View style={styles.loginPage}>
        <LoginBackground />
        <View style={styles.loginCard}>
          <Image
            source={require("./assets/dbcompare-logo.png")}
            style={styles.loginLogo}
            resizeMode="contain"
          />
          <Text style={styles.loginTitle}>DBCompare</Text>
          {error ? <Text style={styles.loginError}>{error}</Text> : null}
          {createElement(
            "form",
            {
              autoComplete: "on",
              onSubmit: (event: any) => {
                event.preventDefault();
                void submit();
              },
              style: { display: "flex", flexDirection: "column", gap: 12 },
            },
            createElement(
              "label",
              { style: { color: "#344054", fontSize: 13, fontWeight: 700 } },
              "Usuário",
              createElement("input", {
                name: "username",
                type: "text",
                autoComplete: "username",
                value: username,
                onChange: (event: any) => setUsername(event.target.value),
                style: {
                  display: "block",
                  boxSizing: "border-box",
                  width: "100%",
                  height: 40,
                  marginTop: 7,
                  border: "1px solid #D0D5DD",
                  borderRadius: 8,
                  padding: "0 12px",
                  fontSize: 14,
                },
              }),
            ),
            createElement(
              "label",
              { style: { color: "#344054", fontSize: 13, fontWeight: 700 } },
              "Senha",
              createElement("input", {
                name: "password",
                type: "password",
                autoComplete: "current-password",
                value: password,
                onChange: (event: any) => setPassword(event.target.value),
                style: {
                  display: "block",
                  boxSizing: "border-box",
                  width: "100%",
                  height: 40,
                  marginTop: 7,
                  border: "1px solid #D0D5DD",
                  borderRadius: 8,
                  padding: "0 12px",
                  fontSize: 14,
                },
              }),
            ),
            createElement(
              "button",
              {
                type: "submit",
                disabled: loading,
                style: {
                  height: 46,
                  border: 0,
                  borderRadius: 10,
                  background: "#6558F5",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  marginTop: 4,
                },
              },
              loading ? "Entrando…" : "Entrar",
            ),
          )}
        </View>
      </View>
    );
  return (
    <View style={styles.loginPage}>
      <View style={styles.loginCard}>
        <Image
          source={require("./assets/dbcompare-logo.png")}
          style={styles.loginLogo}
          resizeMode="contain"
        />
        <Text style={styles.loginTitle}>DBCompare</Text>
        {error ? <Text style={styles.loginError}>{error}</Text> : null}
        <Field label="Usuário">
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="characters"
            autoComplete="username"
            placeholder="Seu usuário"
            placeholderTextColor="#98A2B3"
          />
        </Field>
        <Field label="Senha">
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            placeholder="Sua senha"
            placeholderTextColor="#98A2B3"
            onSubmitEditing={submit}
          />
        </Field>
        <Pressable
          style={[styles.primaryButton, loading && styles.disabled]}
          onPress={submit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Entrar</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function UsersModal({
  visible,
  users,
  initialUser = null,
  canManage,
  onClose,
  onSave,
}: {
  visible: boolean;
  users: FirestoreUserProfile[];
  initialUser?: FirestoreUserProfile | null;
  canManage: boolean;
  onClose: () => void;
  onSave: (
    form: UserForm,
    editing: FirestoreUserProfile | null,
  ) => Promise<void>;
}) {
  const [form, setForm] = useState<UserForm>(emptyUserForm);
  const [editing, setEditing] = useState<FirestoreUserProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const openNew = () => {
    setEditing(null);
    setForm(emptyUserForm);
    setError("");
  };
  const openEdit = (user: FirestoreUserProfile) => {
    setEditing(user);
    setForm({
      username: user.username,
      name: user.name,
      password: "",
      role: user.role,
      email: user.email || "",
      active: user.active,
    });
    setError("");
  };
  useEffect(() => {
    if (visible && initialUser) openEdit(initialUser);
  }, [visible, initialUser?.id]);
  const save = async () => {
    try {
      if (!form.username || !form.name || (!editing && !form.password))
        throw new Error("Informe usuário, nome e senha.");
      setSaving(true);
      await onSave(form, editing);
      openNew();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.modalScroll}>
          <View style={[styles.modal, styles.usersModal]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Usuários</Text>
                <Text style={styles.modalSubtitle}>
                  Cadastre e mantenha os acessos do sistema.
                </Text>
              </View>
              <Pressable onPress={onClose}>
                <Text style={styles.close}>×</Text>
              </Pressable>
            </View>
            <View style={styles.usersLayout}>
              <View style={styles.usersList}>
                {canManage && (
                  <Pressable style={styles.primaryButton} onPress={openNew}>
                    <Text style={styles.primaryText}>+ Novo usuário</Text>
                  </Pressable>
                )}
                <ScrollView>
                  {users.map((user) => (
                    <Pressable
                      key={user.id}
                      style={[
                        styles.userListItem,
                        editing?.id === user.id && styles.userListItemActive,
                      ]}
                      onPress={() => openEdit(user)}
                    >
                      <View>
                        <Text style={styles.connectionName}>{user.name}</Text>
                        <Text style={styles.connectionSub}>
                          {user.username} · {user.role}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.userState,
                          !user.active && styles.userStateInactive,
                        ]}
                      >
                        {user.active ? "Ativo" : "Inativo"}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.userForm}>
                <Text style={styles.userFormTitle}>
                  {editing ? "Editar usuário" : "Novo usuário"}
                </Text>
                {error ? <Text style={styles.loginError}>{error}</Text> : null}
                <Field label="Usuário">
                  <TextInput
                    style={styles.input}
                    value={form.username}
                    editable={!editing}
                    onChangeText={(value) =>
                      setForm((current) => ({ ...current, username: value }))
                    }
                    autoCapitalize="characters"
                  />
                </Field>
                <Field label="Nome">
                  <TextInput
                    style={styles.input}
                    value={form.name}
                    onChangeText={(value) =>
                      setForm((current) => ({ ...current, name: value }))
                    }
                  />
                </Field>
                <Field label={editing ? "Nova senha (opcional)" : "Senha"}>
                  <TextInput
                    style={styles.input}
                    value={form.password}
                    onChangeText={(value) =>
                      setForm((current) => ({ ...current, password: value }))
                    }
                    secureTextEntry
                  />
                </Field>
                <Field label="Tipo de usuário">
                  <View style={styles.pickerBox}>
                    <Picker
                      selectedValue={form.role}
                      onValueChange={(role: UserForm["role"]) =>
                        setForm((current) => ({ ...current, role }))
                      }
                    >
                      <Picker.Item label="Comum" value="Comum" />
                      <Picker.Item
                        label="Administrador"
                        value="Administrador"
                      />
                    </Picker>
                  </View>
                </Field>
                <Field label="E-mail (opcional)">
                  <TextInput
                    style={styles.input}
                    value={form.email}
                    onChangeText={(value) =>
                      setForm((current) => ({ ...current, email: value }))
                    }
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </Field>
                <Pressable
                  style={styles.activeLine}
                  onPress={() =>
                    setForm((current) => ({
                      ...current,
                      active: !current.active,
                    }))
                  }
                >
                  <View
                    style={[
                      styles.checkbox,
                      form.active && styles.checkboxChecked,
                    ]}
                  >
                    {form.active && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxText}>Usuário ativo</Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryButton, saving && styles.disabled]}
                  onPress={save}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryText}>Salvar usuário</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function UsersPanel({
  users,
  onSave,
}: {
  users: FirestoreUserProfile[];
  onSave: (
    form: UserForm,
    editing: FirestoreUserProfile | null,
  ) => Promise<void>;
}) {
  const [editing, setEditing] = useState<FirestoreUserProfile | null>(null);
  const [form, setForm] = useState<UserForm>(emptyUserForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const newUser = () => {
    setEditing(null);
    setForm(emptyUserForm);
    setError("");
  };
  const editUser = (user: FirestoreUserProfile) => {
    setEditing(user);
    setForm({
      username: user.username,
      name: user.name,
      password: "",
      role: user.role,
      email: user.email || "",
      active: user.active,
    });
    setError("");
  };
  const save = async () => {
    try {
      if (
        !form.name.trim() ||
        !form.username.trim() ||
        (!editing && !form.password)
      )
        throw new Error("Informe nome, usuário e senha.");
      setSaving(true);
      await onSave(form, editing);
      newUser();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={styles.usersPage}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Usuários</Text>
          <Text style={styles.sectionSubtitle}>
            Gerencie os acessos ao DBCompare.
          </Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={newUser}>
          <Text style={styles.primaryText}>+ Novo usuário</Text>
        </Pressable>
      </View>
      <View style={styles.usersLayout}>
        <View style={[styles.card, styles.usersListPanel]}>
          <ScrollView>
            {users.map((user) => (
              <Pressable
                key={user.id}
                style={[
                  styles.userListItem,
                  editing?.id === user.id && styles.userListItemActive,
                ]}
                onPress={() => editUser(user)}
              >
                <View>
                  <Text style={styles.connectionName}>{user.name}</Text>
                  <Text style={styles.connectionSub}>
                    {user.username} · {user.role}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.userState,
                    !user.active && styles.userStateInactive,
                  ]}
                >
                  {user.active ? "Ativo" : "Inativo"}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <View style={[styles.card, styles.userFormPanel]}>
          <Text style={styles.userFormTitle}>
            {editing ? "Editar usuário" : "Novo usuário"}
          </Text>
          {error ? <Text style={styles.loginError}>{error}</Text> : null}
          <Field label="Nome">
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={(name) =>
                setForm((current) => ({ ...current, name }))
              }
            />
          </Field>
          <Field label="Usuário">
            <TextInput
              style={styles.input}
              value={form.username}
              editable={!editing}
              onChangeText={(username) =>
                setForm((current) => ({ ...current, username }))
              }
              autoCapitalize="characters"
            />
          </Field>
          <Field label="Senha">
            <TextInput
              style={styles.input}
              value={form.password}
              onChangeText={(password) =>
                setForm((current) => ({ ...current, password }))
              }
              secureTextEntry
            />
          </Field>
          <Field label="E-mail (opcional)">
            <TextInput
              style={styles.input}
              value={form.email}
              onChangeText={(email) =>
                setForm((current) => ({ ...current, email }))
              }
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </Field>
          <Field label="Tipo de usuário">
            <View style={styles.pickerBox}>
              <Picker
                style={styles.fullPicker}
                selectedValue={form.role}
                onValueChange={(role: UserForm["role"]) =>
                  setForm((current) => ({ ...current, role }))
                }
              >
                <Picker.Item label="Comum" value="Comum" />
                <Picker.Item label="Administrador" value="Administrador" />
              </Picker>
            </View>
          </Field>
          <Pressable
            style={styles.activeLine}
            onPress={() =>
              setForm((current) => ({ ...current, active: !current.active }))
            }
          >
            <View
              style={[styles.checkbox, form.active && styles.checkboxChecked]}
            >
              {form.active && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxText}>Usuário ativo</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, saving && styles.disabled]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Salvar usuário</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function UserProfileModal({
  visible,
  user,
  onClose,
  onSave,
}: {
  visible: boolean;
  user: FirestoreUserProfile;
  onClose: () => void;
  onSave: (form: UserForm) => Promise<void>;
}) {
  const [form, setForm] = useState<UserForm>({
    username: user.username,
    name: user.name,
    password: "",
    role: user.role,
    email: user.email || "",
    active: user.active,
  });
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (visible) {
      setForm({
        username: user.username,
        name: user.name,
        password: "",
        role: user.role,
        email: user.email || "",
        active: user.active,
      });
      setNotice("");
    }
  }, [visible, user]);
  const saveProfile = async () => {
    try {
      if (!form.name.trim()) throw new Error("Informe o nome do usuário.");
      setSaving(true);
      await onSave(form);
      setNotice("Dados atualizados com sucesso.");
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setSaving(false);
    }
  };
  const changePassword = async () => {
    try {
      if (!currentPassword || !newPassword || !repeatPassword)
        throw new Error("Preencha todos os campos de senha.");
      if ((await hashPassword(currentPassword)) !== user.passwordHash)
        throw new Error("A senha atual está incorreta.");
      if (newPassword !== repeatPassword)
        throw new Error("A nova senha e a confirmação não são iguais.");
      setSaving(true);
      await onSave({ ...form, password: newPassword });
      setShowPasswordDialog(false);
      setCurrentPassword("");
      setNewPassword("");
      setRepeatPassword("");
      setNotice("Senha alterada com sucesso.");
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.modalScroll}>
          <View style={[styles.modal, styles.profileModal]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Meu cadastro</Text>
                <Text style={styles.modalSubtitle}>
                  Mantenha seus dados cadastrais atualizados.
                </Text>
              </View>
              <Pressable onPress={onClose}>
                <Text style={styles.close}>×</Text>
              </Pressable>
            </View>
            {notice ? (
              <Text
                style={
                  notice.includes("sucesso")
                    ? styles.profileSuccess
                    : styles.loginError
                }
              >
                {notice}
              </Text>
            ) : null}
            <Field label="Nome">
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(name) =>
                  setForm((current) => ({ ...current, name }))
                }
              />
            </Field>
            <Field label="Usuário">
              <TextInput
                style={styles.input}
                value={form.username}
                editable={false}
              />
            </Field>
            <Field label="Senha">
              <View style={styles.passwordLine}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value="••••••••"
                  editable={false}
                />
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => {
                    setNotice("");
                    setShowPasswordDialog(true);
                  }}
                >
                  <Text style={styles.secondaryText}>Alterar senha</Text>
                </Pressable>
              </View>
            </Field>
            <Field label="E-mail (opcional)">
              <TextInput
                style={styles.input}
                value={form.email}
                onChangeText={(email) =>
                  setForm((current) => ({ ...current, email }))
                }
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </Field>
            <Pressable
              style={[styles.primaryButton, saving && styles.disabled]}
              onPress={saveProfile}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Salvar dados</Text>
              )}
            </Pressable>
            <Modal
              visible={showPasswordDialog}
              transparent
              animationType="fade"
              onRequestClose={() => setShowPasswordDialog(false)}
            >
              <View style={styles.overlay}>
                <View style={[styles.modal, styles.passwordModal]}>
                  <View style={styles.modalHeader}>
                    <View>
                      <Text style={styles.modalTitle}>Alterar senha</Text>
                      <Text style={styles.modalSubtitle}>
                        Confirme sua senha atual para continuar.
                      </Text>
                    </View>
                    <Pressable onPress={() => setShowPasswordDialog(false)}>
                      <Text style={styles.close}>×</Text>
                    </Pressable>
                  </View>
                  <Field label="Senha atual">
                    <TextInput
                      style={styles.input}
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                      secureTextEntry
                    />
                  </Field>
                  <Field label="Nova senha">
                    <TextInput
                      style={styles.input}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry
                    />
                  </Field>
                  <Field label="Repita a nova senha">
                    <TextInput
                      style={styles.input}
                      value={repeatPassword}
                      onChangeText={setRepeatPassword}
                      secureTextEntry
                    />
                  </Field>
                  <Pressable
                    style={[styles.primaryButton, saving && styles.disabled]}
                    onPress={changePassword}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryText}>Salvar nova senha</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </Modal>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function ParameterGroupsPanel({
  groups,
  onSave,
}: {
  groups: FirestoreParameterGroup[];
  onSave: (
    group: Omit<FirestoreParameterGroup, "id">,
    editing: FirestoreParameterGroup | null,
  ) => Promise<void>;
}) {
  const [editing, setEditing] = useState<FirestoreParameterGroup | null>(null);
  const [description, setDescription] = useState("");
  const [codes, setCodes] = useState("");
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const reset = () => {
    setEditing(null);
    setDescription("");
    setCodes("");
    setError("");
  };
  const edit = (group: FirestoreParameterGroup) => {
    setEditing(group);
    setDescription(group.description);
    setCodes(group.parameterCodes.join(", "));
    setError("");
  };
  const save = async () => {
    try {
      const parameterCodes = [
        ...new Set(
          codes
            .split(",")
            .map((code) => code.trim().toLocaleUpperCase())
            .filter(Boolean),
        ),
      ];
      if (!description.trim() || !parameterCodes.length)
        throw new Error(
          "Informe a descrição e ao menos um código de parâmetro.",
        );
      setSaving(true);
      await onSave(
        { description: description.trim(), parameterCodes },
        editing,
      );
      reset();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setSaving(false);
    }
  };
  const term = filter.trim().toLocaleUpperCase();
  const displayed = groups.filter(
    (group) =>
      !term ||
      group.description.toLocaleUpperCase().includes(term) ||
      group.parameterCodes.some((code) =>
        code.toLocaleUpperCase().includes(term),
      ),
  );
  return (
    <View style={styles.usersPage}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Grupos de Parâmetros</Text>
          <Text style={styles.sectionSubtitle}>
            Organize códigos de parâmetros para filtrar as comparações em
            {" \"Parâmetros de Sistema\"."}
          </Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={reset}>
          <Text style={styles.primaryText}>+ Novo grupo</Text>
        </Pressable>
      </View>
      <View style={styles.usersLayout}>
        <View style={[styles.card, styles.usersListPanel]}>
          <View style={styles.groupFilter}>
            <TextInput
              style={styles.input}
              value={filter}
              onChangeText={setFilter}
              placeholder="Filtrar descrição ou código"
              placeholderTextColor="#98A2B3"
            />
          </View>
          <ScrollView>
            {displayed.map((group) => (
              <Pressable
                key={group.id}
                style={[
                  styles.userListItem,
                  editing?.id === group.id && styles.userListItemActive,
                ]}
                onPress={() => edit(group)}
              >
                <View style={styles.groupListContent}>
                  <Text style={styles.connectionName}>{group.description}</Text>
                  <Text
                    style={[styles.connectionSub, styles.groupCodesPreview]}
                  >
                    {group.parameterCodes.join(", ")}
                  </Text>
                </View>
                <Text style={[styles.userState, styles.groupParameterCount]}>
                  {group.parameterCodes.length}
                </Text>
              </Pressable>
            ))}
            {!displayed.length && (
              <Text style={styles.muted}>Nenhum grupo encontrado.</Text>
            )}
          </ScrollView>
        </View>
        <View style={[styles.card, styles.userFormPanel]}>
          <Text style={styles.userFormTitle}>
            {editing ? "Editar grupo" : "Novo grupo"}
          </Text>
          {error ? <Text style={styles.loginError}>{error}</Text> : null}
          <Field label="Descrição">
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder="Ex.: Parâmetros de financeiro"
              placeholderTextColor="#98A2B3"
            />
          </Field>
          <Field label="Códigos de parâmetros">
            <TextInput
              style={[styles.input, styles.groupCodesInput]}
              value={codes}
              onChangeText={setCodes}
              multiline
              placeholder="Ex.: 1001, 1002, 1003"
              placeholderTextColor="#98A2B3"
            />
          </Field>
          <Text style={styles.settingsHelp}>
            Informe os códigos separados por vírgula.
          </Text>
          <Pressable
            style={[styles.primaryButton, saving && styles.disabled]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryText}>Salvar grupo</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ComparisonCriteriaPanel({
  criteria,
  onSave,
}: {
  criteria: FirestoreComparisonCriterion[];
  onSave: (
    criterion: Omit<FirestoreComparisonCriterion, "id">,
    editing: FirestoreComparisonCriterion | null,
  ) => Promise<void>;
}) {
  const [editing, setEditing] = useState<FirestoreComparisonCriterion | null>(
    null,
  );
  const [description, setDescription] = useState("");
  const [information, setInformation] = useState("");
  const [query, setQuery] = useState("");
  const [operator, setOperator] = useState("");
  const [value, setValue] = useState("");
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const reset = () => {
    setEditing(null);
    setDescription("");
    setInformation("");
    setQuery("");
    setOperator("");
    setValue("");
    setError("");
  };
  const edit = (criterion: FirestoreComparisonCriterion) => {
    setEditing(criterion);
    setDescription(criterion.description);
    setInformation(criterion.information);
    setQuery(criterion.query);
    setOperator(criterion.operator);
    setValue(criterion.value);
    setError("");
  };
  const save = async () => {
    try {
      if (
        !description.trim() ||
        !information.trim() ||
        !query.trim() ||
        !operator.trim() ||
        !value.trim()
      )
        throw new Error("Preencha todos os campos do critério de comparação.");
      if (!/^(=|<>|>|<)$/.test(operator.trim()))
        throw new Error("A condição deve ser =, <>, > ou <.");
      setSaving(true);
      await onSave(
        {
          description: description.trim(),
          information: information.trim(),
          query: query.trim(),
          operator: operator.trim(),
          value: value.trim(),
        },
        editing,
      );
      reset();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setSaving(false);
    }
  };
  const term = filter.trim().toLocaleUpperCase();
  const displayed = criteria.filter(
    (criterion) =>
      !term ||
      criterion.description.toLocaleUpperCase().includes(term) ||
      criterion.information.toLocaleUpperCase().includes(term),
  );
  return (
    <View style={styles.usersPage}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Critérios de Comparação</Text>
          <Text style={styles.sectionSubtitle}>
            Cadastre os critérios que serão utilizados em Comparações Gerais.
          </Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={reset}>
          <Text style={styles.primaryText}>+ Novo critério</Text>
        </Pressable>
      </View>
      <View style={styles.usersLayout}>
        <View style={[styles.card, styles.usersListPanel]}>
          <View style={styles.groupFilter}>
            <TextInput
              style={styles.input}
              value={filter}
              onChangeText={setFilter}
              placeholder="Filtrar descrição ou informação"
              placeholderTextColor="#98A2B3"
            />
          </View>
          <ScrollView>
            {displayed.map((criterion) => (
              <Pressable
                key={criterion.id}
                style={[
                  styles.userListItem,
                  editing?.id === criterion.id && styles.userListItemActive,
                ]}
                onPress={() => edit(criterion)}
              >
                <View style={styles.groupListContent}>
                  <Text style={styles.connectionName}>{criterion.description}</Text>
                  <Text style={[styles.connectionSub, styles.groupCodesPreview]}>
                    {criterion.information}
                  </Text>
                </View>
              </Pressable>
            ))}
            {!displayed.length && (
              <Text style={styles.muted}>Nenhum critério encontrado.</Text>
            )}
          </ScrollView>
        </View>
        <View style={[styles.card, styles.userFormPanel]}>
          <Text style={styles.userFormTitle}>
            {editing ? "Editar critério" : "Novo critério"}
          </Text>
          {error ? <Text style={styles.loginError}>{error}</Text> : null}
          <Field label="Descrição">
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder="Ex.: Integrações ativas"
              placeholderTextColor="#98A2B3"
            />
          </Field>
          <Field label="Informações">
            <TextInput
              style={[styles.input, styles.comparisonCriterionTextArea]}
              value={information}
              onChangeText={setInformation}
              multiline
              maxLength={2000}
              placeholder="Informações sobre o critério"
              placeholderTextColor="#98A2B3"
            />
          </Field>
          <View style={styles.comparisonConditionPanel}>
            <Text style={styles.comparisonConditionTitle}>
              Condição para considerar o critério verdadeiro
            </Text>
            <Field label="Critério (Digite abaixo o SELECT que atenda os três tipos de Bancos de Dados)">
              <TextInput
                style={[styles.input, styles.comparisonCriterionQuery]}
                value={query}
                onChangeText={setQuery}
                multiline
                maxLength={500}
                placeholder="SELECT ..."
                placeholderTextColor="#98A2B3"
              />
            </Field>
            <Field label="Condição (=, &lt;&gt;, &gt; ou &lt; )">
              <TextInput
                style={styles.input}
                value={operator}
                onChangeText={setOperator}
                maxLength={5}
                placeholder="="
                placeholderTextColor="#98A2B3"
              />
            </Field>
            <Field label="Valor">
              <TextInput
                style={styles.input}
                value={value}
                onChangeText={setValue}
                maxLength={200}
                placeholder="Valor ou expressão esperada"
                placeholderTextColor="#98A2B3"
              />
            </Field>
          </View>
          <Pressable
            style={[styles.primaryButton, saving && styles.disabled]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryText}>Salvar critério</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function SettingsPanel({
  ignoredParameters,
  onSave,
}: {
  ignoredParameters: string[];
  onSave: (parameters: string[]) => Promise<void>;
}) {
  const [value, setValue] = useState(ignoredParameters.join(", "));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Notice>(null);
  useEffect(() => setValue(ignoredParameters.join(", ")), [ignoredParameters]);
  const save = async () => {
    try {
      setSaving(true);
      setMessage(null);
      const parameters = [
        ...new Set(
          value
            .split(",")
            .map((item) => item.trim().toLocaleUpperCase())
            .filter(Boolean),
        ),
      ];
      await onSave(parameters);
      setValue(parameters.join(", "));
      setMessage({
        type: "success",
        title: "Configurações salvas",
        message:
          "Os parâmetros informados serão ignorados nas próximas comparações.",
      });
    } catch (error) {
      setMessage({
        type: "error",
        title: "Não foi possível salvar",
        message: errorText(error),
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={styles.settingsPage}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Configurações</Text>
        </View>
      </View>
      <View style={[styles.card, styles.settingsCard]}>
        <Text style={styles.userFormTitle}>Parâmetros Ignorados</Text>
        <Text style={styles.sectionSubtitle}>
          Parâmetros de sistema ignorados na comparação
        </Text>
        {message && <NoticeBox notice={message} />}
        <Field label="Parâmetros">
          <TextInput
            style={[styles.input, styles.settingsInput]}
            value={value}
            onChangeText={setValue}
            placeholder="Ex.: PARAMETRO_1, PARAMETRO_2"
            placeholderTextColor="#98A2B3"
            autoCapitalize="characters"
          />
        </Field>
        <Text style={styles.settingsHelp}>
          Informe os códigos separados por vírgula. Eles não serão considerados
          no resultado da comparação.
        </Text>
        <Pressable
          style={[
            styles.primaryButton,
            styles.settingsButton,
            saving && styles.disabled,
          ]}
          onPress={save}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryText}>Salvar configurações</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<
    "compare" | "connections" | "settings" | "administrator"
  >("compare");
  const [adminTab, setAdminTab] = useState<
    "users" | "groups" | "generalComparisons"
  >("users");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [leftCompare, setLeftCompare] = useState<CompareSelection>({
    connectionId: "",
    username: "",
    password: "",
  });
  const [rightCompare, setRightCompare] = useState<CompareSelection>({
    connectionId: "",
    username: "",
    password: "",
  });
  const [compareRows, setCompareRows] = useState<CompareResult[] | null>(null);
  const [compareSelectionCollapsed, setCompareSelectionCollapsed] =
    useState(false);
  const [comparisonVersion, setComparisonVersion] = useState(0);
  const [comparing, setComparing] = useState(false);
  const [descriptionDetail, setDescriptionDetail] =
    useState<CompareResult | null>(null);
  const [explanationDetail, setExplanationDetail] =
    useState<CompareResult | null>(null);
  const [onlyDifferent, setOnlyDifferent] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [resultFilters, setResultFilters] = useState<Record<string, string>>({
    code: "",
    description: "",
    explanation: "",
    first: "",
    second: "",
    status: "",
  });
  const [form, setForm] = useState<FormData>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [firestoreOnline, setFirestoreOnline] = useState<boolean | null>(null);
  const [connectorOnline, setConnectorOnline] = useState<boolean | null>(null);
  const [connectorOutdated, setConnectorOutdated] = useState(false);
  const [latestApiVersion, setLatestApiVersion] = useState("");
  const firestorePulse = useRef(new Animated.Value(1)).current;
  const connectorPulse = useRef(new Animated.Value(1)).current;
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [showForm, setShowForm] = useState(false);
  const [showTestForm, setShowTestForm] = useState(false);
  const [testPassword, setTestPassword] = useState("");
  const [testMessage, setTestMessage] = useState<Notice>(null);
  const [users, setUsers] = useState<FirestoreUserProfile[]>([]);
  const [parameterGroups, setParameterGroups] = useState<
    FirestoreParameterGroup[]
  >([]);
  const [comparisonCriteria, setComparisonCriteria] = useState<
    FirestoreComparisonCriterion[]
  >([]);
  const [selectedParameterGroupId, setSelectedParameterGroupId] = useState("");
  const [showUsers, setShowUsers] = useState(false);
  const [currentUser, setCurrentUser] = useState<FirestoreUserProfile | null>(
    () => {
      if (Platform.OS !== "web") return null;
      try {
        return JSON.parse(
          window.localStorage.getItem("dbcompare-session") || "null",
        );
      } catch {
        return null;
      }
    },
  );
  // O id será fornecido pelo login quando o Firebase Authentication estiver
  // habilitado. Enquanto isso, a preferência permanece no navegador para que
  // a alternância já funcione nesta versão.
  const currentUserId = currentUser?.id || null;
  const [theme, setTheme] = useState<Theme>(() => {
    if (Platform.OS !== "web") return "light";
    return window.localStorage.getItem("dbcompare-theme") === "dark"
      ? "dark"
      : "light";
  });
  const request = async (path: string, options?: RequestInit) => {
    const response = await fetch(`${apiUrl}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const body = await response
      .json()
      .catch(() => ({ message: "Resposta inválida da API." }));
    if (!response.ok)
      throw new Error(body.message || "Não foi possível concluir a operação.");
    return body;
  };
  const loadConnections = async () => {
    if (!currentUser) {
      setConnections([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setConnections(await listConnections(currentUser.id));
      setFirestoreOnline(true);
    } catch (error) {
      setFirestoreOnline(false);
      setNotice({
        type: "error",
        title: "Não foi possível acessar o Firestore",
        message: errorText(error),
      });
    } finally {
      setLoading(false);
    }
  };
  const loadUsers = async () => {
    setUsers(await listUsers());
  };
  const loadParameterGroups = async () => {
    setParameterGroups(await listParameterGroups());
  };
  const loadComparisonCriteria = async () => {
    setComparisonCriteria(await listComparisonCriteria());
  };
  const login = async (username: string, password: string) => {
    const normalized = username.trim().toLocaleUpperCase();
    if (!normalized || !password) throw new Error("Informe usuário e senha.");
    const user = (await listUsers()).find(
      (item) => item.username.toLocaleUpperCase() === normalized,
    );
    if (!user || user.passwordHash !== (await hashPassword(password)))
      throw new Error("Usuário ou senha inválidos.");
    if (!user.active) throw new Error("Este usuário está inativo.");
    setCurrentUser(user);
    setTheme(user.themePreference || "light");
    setActiveTab("compare");
    if (Platform.OS === "web") {
      window.localStorage.setItem("dbcompare-session", JSON.stringify(user));
      const PasswordCredential = (window as any).PasswordCredential;
      if (PasswordCredential && navigator.credentials?.store)
        void navigator.credentials
          .store(
            new PasswordCredential({
              id: normalized,
              password,
              name: user.name,
            }),
          )
          .catch(() => undefined);
    }
  };
  const saveUser = async (
    userForm: UserForm,
    editing: FirestoreUserProfile | null,
  ) => {
    const username = userForm.username.trim().toLocaleUpperCase();
    if (
      !editing &&
      users.some((user) => user.username.toLocaleUpperCase() === username)
    )
      throw new Error("Já existe um usuário com esse identificador.");
    const passwordHash = userForm.password
      ? await hashPassword(userForm.password)
      : editing?.passwordHash || "";
    const payload = {
      username,
      name: userForm.name.trim(),
      role: userForm.role,
      email: userForm.email.trim() || undefined,
      createdAt: editing?.createdAt || new Date().toISOString(),
      active: userForm.active,
      themePreference: editing?.themePreference || ("light" as Theme),
      ignoredParameters: editing?.ignoredParameters || [],
      passwordHash,
    };
    if (editing) await updateUser({ id: editing.id, ...payload });
    else await createUser(payload);
    await loadUsers();
    if (editing && editing.id === currentUser?.id) {
      const updated = { id: editing.id, ...payload };
      setCurrentUser(updated);
      if (Platform.OS === "web")
        window.localStorage.setItem(
          "dbcompare-session",
          JSON.stringify(updated),
        );
    }
  };
  const saveParameterGroup = async (
    group: Omit<FirestoreParameterGroup, "id">,
    editing: FirestoreParameterGroup | null,
  ) => {
    if (editing) await updateParameterGroup({ id: editing.id, ...group });
    else await createParameterGroup(group);
    await loadParameterGroups();
  };
  const saveComparisonCriterion = async (
    criterion: Omit<FirestoreComparisonCriterion, "id">,
    editing: FirestoreComparisonCriterion | null,
  ) => {
    if (editing)
      await updateComparisonCriterion({ id: editing.id, ...criterion });
    else await createComparisonCriterion(criterion);
    await loadComparisonCriteria();
  };
  useEffect(() => {
    void loadConnections();
    void loadParameterGroups().catch(() => undefined);
    void loadComparisonCriteria().catch(() => undefined);
  }, [currentUser?.id]);
  useEffect(() => {
    void getApiVersionSettings()
      .then((settings) => setLatestApiVersion(settings.latestVersion))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (currentUser?.role === "Administrador") void loadUsers();
  }, [currentUser?.role]);
  useEffect(() => {
    if (!currentUser) return;
    void listUsers()
      .then((usersFromDatabase) => {
        const latest = usersFromDatabase.find(
          (user) => user.id === currentUser.id,
        );
        if (!latest?.active) {
          setCurrentUser(null);
          if (Platform.OS === "web")
            window.localStorage.removeItem("dbcompare-session");
        } else {
          setCurrentUser(latest);
          if (Platform.OS === "web")
            window.localStorage.setItem(
              "dbcompare-session",
              JSON.stringify(latest),
            );
        }
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const styleId = "dbcompare-theme-styles";
    let element = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!element) {
      element = document.createElement("style");
      element.id = styleId;
      document.head.appendChild(element);
    }
    element.textContent =
      'form label { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; font-weight: 800 !important; } #dbcompare-app .sidebarBrand img { border: 2px solid #101828; border-radius: 16px; } #dbcompare-app.dark-theme { filter: invert(.91) hue-rotate(180deg); } #dbcompare-app.dark-theme .sidebarBrand img { opacity: 0; }';
    document
      .getElementById("dbcompare-app")
      ?.classList.toggle("dark-theme", theme === "dark");
    window.localStorage.setItem("dbcompare-theme", theme);
  }, [theme]);
  useEffect(() => {
    const checkConnector = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/health`);
        setConnectorOnline(response.ok);
        const body = await response.json().catch(() => ({}));
        setConnectorOutdated(
          response.ok &&
            Boolean(latestApiVersion) &&
            body.version !== latestApiVersion,
        );
      } catch {
        setConnectorOnline(false);
        setConnectorOutdated(false);
      }
    };
    void checkConnector();
    const interval = setInterval(checkConnector, 15000);
    return () => clearInterval(interval);
  }, [latestApiVersion]);
  useEffect(() => {
    if (firestoreOnline !== false) {
      firestorePulse.stopAnimation();
      firestorePulse.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(firestorePulse, {
          toValue: 0.35,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(firestorePulse, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [firestoreOnline, firestorePulse]);
  useEffect(() => {
    if (connectorOnline !== false && !connectorOutdated) {
      connectorPulse.stopAnimation();
      connectorPulse.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(connectorPulse, {
          toValue: 0.35,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(connectorPulse, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [connectorOnline, connectorOutdated, connectorPulse]);
  const update = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const validate = (passwordRequired = true) => {
    if (
      !form.name ||
      !form.host ||
      !form.database ||
      !form.username ||
      (passwordRequired && !form.password)
    )
      throw new Error(
        passwordRequired
          ? "Preencha todos os campos, incluindo a senha."
          : "Preencha nome, tipo, host, porta, base e usuário.",
      );
    if (
      !Number.isInteger(Number(form.port)) ||
      Number(form.port) < 1 ||
      Number(form.port) > 65535
    )
      throw new Error("Informe uma porta válida (1 a 65535).");
  };
  const startNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setNotice(null);
    setShowForm(true);
  };
  const edit = (item: Connection) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      environmentType: item.environmentType || "Produção",
      databaseType: item.databaseType,
      host: item.host,
      port: item.port,
      database: item.database,
      username: item.username,
      password: "",
    });
    setNotice(null);
    setShowForm(true);
  };
  const selectForCompare = (
    id: string,
    setSelection: (selection: CompareSelection) => void,
    current: CompareSelection,
  ) => {
    const connection = connections.find((item) => item.id === id);
    setSelection({
      ...current,
      connectionId: id,
      username: connection?.username || "",
      password:
        connection &&
        environmentsWithDefaultPassword.includes(connection.environmentType)
          ? "agesune1"
          : "",
    });
  };
  const downloadConnector = () => {
    if (Platform.OS === "web")
      window.open(connectorDownloadUrl, "_blank", "noopener,noreferrer");
  };
  const toggleTheme = () => {
    const nextTheme: Theme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    if (currentUserId)
      void updateUserTheme(currentUserId, nextTheme).catch(() => undefined);
  };
  const signOut = () => {
    if (
      Platform.OS === "web" &&
      !window.confirm("Deseja realmente encerrar a sessão?")
    )
      return;
    if (Platform.OS === "web")
      window.localStorage.removeItem("dbcompare-session");
    setCurrentUser(null);
  };
  if (!currentUser) return <LoginScreen onLogin={login} />;
  const isUsersTab = () =>
    activeTab === "administrator" && adminTab === "users";
  if (showUsers && isUsersTab())
    return (
      <UserProfileModal
        visible
        user={currentUser}
        onClose={() => {
          setShowUsers(false);
          setActiveTab("compare");
        }}
        onSave={(form) => saveUser(form, currentUser)}
      />
    );
  const webServiceConnection = (selection: CompareSelection) => {
    const connection = connections.find(
      (item) => item.id === selection.connectionId,
    );
    if (!connection || !selection.password)
      throw new Error(
        "Selecione a base e informe a senha para consultar os Webservices.",
      );
    return {
      ...connection,
      username: selection.username,
      password: selection.password,
    };
  };
  const loadWebServices = async (
    selection: CompareSelection,
  ): Promise<WebServiceOption[]> => {
    const result = await request("/api/webservices", {
      method: "POST",
      body: JSON.stringify({ connection: webServiceConnection(selection) }),
    });
    return result.webservices || [];
  };
  const compareWebServices = async (
    firstCode: string,
    secondCode: string,
  ): Promise<CompareResult[]> => {
    const result = await request("/api/webservices/compare", {
      method: "POST",
      body: JSON.stringify({
        first: webServiceConnection(leftCompare),
        second: webServiceConnection(rightCompare),
        firstServiceCode: firstCode,
        secondServiceCode: secondCode,
      }),
    });
    return result.rows || [];
  };
  const compareFeatures = async (): Promise<CompareResult[]> => {
    const result = await request("/api/features/compare", {
      method: "POST",
      body: JSON.stringify({
        first: webServiceConnection(leftCompare),
        second: webServiceConnection(rightCompare),
      }),
    });
    return result.rows || [];
  };
  const compareBases = async () => {
    let first: Connection | undefined;
    let second: Connection | undefined;
    try {
      first = connections.find(
        (connection) => connection.id === leftCompare.connectionId,
      );
      second = connections.find(
        (connection) => connection.id === rightCompare.connectionId,
      );
      if (!first || !second || !leftCompare.password || !rightCompare.password)
        throw new Error(
          "Selecione as duas bases e informe usuário e senha para cada uma.",
        );
      setComparing(true);
      setNotice(null);
      const result = await request("/api/compare", {
        method: "POST",
        body: JSON.stringify({
          first: {
            ...first,
            username: leftCompare.username,
            password: leftCompare.password,
          },
          second: {
            ...second,
            username: rightCompare.username,
            password: rightCompare.password,
          },
          ignoredParameters: currentUser.ignoredParameters || [],
        }),
      });
      // Mantém o filtro também no cliente. Dessa forma, a regra funciona
      // imediatamente mesmo enquanto alguma máquina ainda usa um Connector
      // anterior à versão que recebeu o filtro na API.
      const ignored = new Set(
        (currentUser.ignoredParameters || []).map((parameter) =>
          parameter.trim().toLocaleUpperCase(),
        ),
      );
      setCompareRows(
        result.rows.filter(
          (row: CompareResult) =>
            !ignored.has(row.cdParametro.trim().toLocaleUpperCase()),
        ),
      );
      setCompareSelectionCollapsed(true);
      setComparisonVersion((version) => version + 1);
    } catch (error) {
      setCompareRows(null);
      const originalError = errorText(error);
      const connectorUnavailable =
        /failed to fetch|network request failed|networkerror/i.test(
          originalError,
        );
      setNotice({
        type: "error",
        title: "Não foi possível comparar",
        message: connectorUnavailable
          ? `Não foi possível acessar o DBCompare Connector. Verifique se ele está em execução neste computador.\nConexões envolvidas: ${first?.name || "Base de Dados 1"} e ${second?.name || "Base de Dados 2"}.\nErro original: ${originalError}`
          : originalError,
      });
    } finally {
      setComparing(false);
    }
  };
  const saveSettings = async (parameters: string[]) => {
    const updated = { ...currentUser, ignoredParameters: parameters };
    await updateUser(updated);
    setCurrentUser(updated);
    if (Platform.OS === "web")
      window.localStorage.setItem("dbcompare-session", JSON.stringify(updated));
  };
  const selectedName = (id: string, fallback: string) =>
    connections.find((connection) => connection.id === id)?.name || fallback;
  const openTest = () => {
    try {
      validate(false);
      setTestPassword("");
      setTestMessage(null);
      setShowTestForm(true);
    } catch (error) {
      setNotice({
        type: "error",
        title: "Dados incompletos",
        message: errorText(error),
      });
    }
  };
  const test = async () => {
    try {
      if (!testPassword)
        throw new Error("Informe a senha para testar a conexão.");
      setSaving(true);
      setTestMessage(null);
      const result = await request("/api/connections/test", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          password: testPassword,
          port: Number(form.port),
        }),
      });
      setTestMessage({
        type: "success",
        title: "Conexão estabelecida",
        message: result.message,
      });
    } catch (error) {
      setTestMessage({
        type: "error",
        title: "Falha no teste",
        message: errorText(error),
      });
    } finally {
      setSaving(false);
    }
  };
  const save = async () => {
    try {
      validate(false);
      setSaving(true);
      setNotice(null);
      const connection = {
        name: form.name,
        environmentType: form.environmentType,
        databaseType: form.databaseType,
        host: form.host,
        port: Number(form.port),
        database: form.database,
        username: form.username,
        ownerUserId: currentUser?.id || "",
      };
      if (editingId) await updateConnection({ id: editingId, ...connection });
      else await createConnection(connection);
      await loadConnections();
      setShowForm(false);
      setNotice({
        type: "success",
        title: "Tudo certo",
        message: editingId
          ? "Conexão atualizada no Firestore."
          : "Conexão cadastrada no Firestore.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        title: "Não foi possível salvar no Firestore",
        message: errorText(error),
      });
    } finally {
      setSaving(false);
    }
  };
  const remove = async (item: Connection) => {
    if (
      Platform.OS === "web" &&
      !window.confirm(`Excluir a conexão “${item.name}”?`)
    )
      return;
    try {
      await deleteConnection(item.id);
      await loadConnections();
      setNotice({
        type: "success",
        title: "Conexão excluída",
        message: `${item.name} foi removida do Firestore.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        title: "Não foi possível excluir do Firestore",
        message: errorText(error),
      });
    }
  };

  return (
    <View style={styles.page}>
      {theme === "dark" && (
        <View pointerEvents="none" style={styles.darkLogoOverlay}>
          <Image
            source={require("./assets/dbcompare-logo.png")}
            style={styles.darkLogo}
            resizeMode="contain"
          />
        </View>
      )}
      <View nativeID="dbcompare-app" style={styles.page}>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
        <View pointerEvents="none" style={styles.orbOne} />
        <View pointerEvents="none" style={styles.orbTwo} />
        <View pointerEvents="none" style={styles.watermarkBlue} />
        <View pointerEvents="none" style={styles.watermarkGreen} />
        <View pointerEvents="none" style={styles.watermarkRing} />
        <View style={styles.appShell}>
          <ScrollView
            style={styles.sidebar}
            contentContainerStyle={styles.sidebarContent}
            showsVerticalScrollIndicator
          >
            <View style={styles.sidebarBrand}>
              <Image
                source={require("./assets/dbcompare-logo.png")}
                style={styles.sidebarLogo}
                resizeMode="contain"
              />
              <Text style={styles.sidebarTitle}>DBCompare</Text>
            </View>
            <View style={styles.sideTabs}>
              <Tab
                text="Comparar Bases"
                icon="⇄"
                active={activeTab === "compare"}
                onPress={() => setActiveTab("compare")}
              />
              <Tab
                text="Conexões"
                icon="◫"
                active={activeTab === "connections"}
                onPress={() => setActiveTab("connections")}
              />
              <Tab
                text="Configurações"
                icon="⚙"
                active={activeTab === "settings"}
                onPress={() => setActiveTab("settings")}
              />
              {currentUser.role === "Administrador" && (
                <Tab
                  text="Administrador"
                  icon="♙"
                  active={activeTab === "administrator"}
                  onPress={() => {
                    setShowUsers(false);
                    setActiveTab("administrator");
                  }}
                />
              )}
            </View>
            <View style={styles.sidebarFooter}>
              <View style={styles.userBar}>
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>
                    {(currentUser.name || currentUser.username)
                      .trim()
                      .charAt(0)
                      .toLocaleUpperCase()}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setShowUsers(true);
                    setAdminTab("users");
                    setActiveTab("administrator");
                  }}
                >
                  <Text style={styles.userName}>{currentUser.username}</Text>
                </Pressable>
                <Pressable
                  onPress={toggleTheme}
                  style={styles.themeToggle}
                  accessibilityLabel={
                    theme === "light"
                      ? "Ativar tema escuro"
                      : "Ativar tema claro"
                  }
                >
                  <Text style={styles.themeToggleText}>
                    {theme === "light" ? "🌙" : "☀️"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={signOut}
                  style={styles.signOutButton}
                  accessibilityLabel="Sair"
                >
                  <Text style={styles.signOutText}>⏻</Text>
                </Pressable>
              </View>
              <View style={styles.sidebarStatuses}>
                <Animated.View
                  style={[
                    styles.sideStatus,
                    firestoreOnline === false && { opacity: firestorePulse },
                  ]}
                >
                  <View
                    style={[
                      styles.dot,
                      firestoreOnline === false && styles.dotOffline,
                      firestoreOnline === null && styles.dotWaiting,
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      firestoreOnline === false && styles.statusTextOffline,
                      firestoreOnline === null && styles.statusTextWaiting,
                    ]}
                  >
                    {firestoreOnline === false
                      ? "Firestore indisponível"
                      : firestoreOnline
                        ? "Firestore conectado"
                        : "Conectando ao Firestore"}
                  </Text>
                </Animated.View>
                <Animated.View
                  style={[
                    styles.sideStatus,
                    (connectorOnline === false || connectorOutdated) && {
                      opacity: connectorPulse,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.dot,
                      (connectorOnline === false || connectorOutdated) &&
                        styles.dotOffline,
                      connectorOnline === null && styles.dotWaiting,
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      (connectorOnline === false || connectorOutdated) &&
                        styles.statusTextOffline,
                      connectorOnline === null && styles.statusTextWaiting,
                    ]}
                  >
                    {connectorOnline === false
                      ? "DBCompare Connector indisponível"
                      : connectorOutdated
                        ? `DBCompare Connector desatualizado${latestApiVersion ? ` (v${latestApiVersion})` : ""}`
                        : connectorOnline
                          ? "DBCompare Connector conectado"
                          : "Verificando DBCompare Connector"}
                  </Text>
                </Animated.View>
                <Pressable
                  onPress={downloadConnector}
                  style={styles.connectorDownload}
                  accessibilityLabel="Baixar DBCompare Connector"
                >
                  <Image
                    source={require("./assets/api-download.png")}
                    style={styles.connectorDownloadIcon}
                    resizeMode="cover"
                  />
                  <Text style={styles.connectorDownloadText}>
                    Baixar DBCompare Connector
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
          <ScrollView contentContainerStyle={styles.mainContent}>
            {activeTab === "administrator" && (
              <View style={styles.adminPage}>
                <View style={styles.compareSubtabs}>
                  <Pressable
                    style={[
                      styles.compareSubtab,
                      adminTab === "users" && styles.compareSubtabActive,
                    ]}
                    onPress={() => setAdminTab("users")}
                  >
                    <Text
                      style={[
                        styles.compareSubtabText,
                        adminTab === "users" && styles.compareSubtabTextActive,
                      ]}
                    >
                      Usuários
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.compareSubtab,
                      adminTab === "groups" && styles.compareSubtabActive,
                    ]}
                    onPress={() => setAdminTab("groups")}
                  >
                    <Text
                      style={[
                        styles.compareSubtabText,
                        adminTab === "groups" && styles.compareSubtabTextActive,
                      ]}
                    >
                      Grupos de Parâmetros
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.compareSubtab,
                      adminTab === "generalComparisons" &&
                        styles.compareSubtabActive,
                    ]}
                    onPress={() => setAdminTab("generalComparisons")}
                  >
                    <Text
                      style={[
                        styles.compareSubtabText,
                        adminTab === "generalComparisons" &&
                          styles.compareSubtabTextActive,
                      ]}
                    >
                      Comparações Gerais
                    </Text>
                  </Pressable>
                </View>
                {adminTab === "users" ? (
                  <UsersPanel users={users} onSave={saveUser} />
                ) : adminTab === "groups" ? (
                  <ParameterGroupsPanel
                    groups={parameterGroups}
                    onSave={saveParameterGroup}
                  />
                ) : (
                  <ComparisonCriteriaPanel
                    criteria={comparisonCriteria}
                    onSave={saveComparisonCriterion}
                  />
                )}
              </View>
            )}
            {activeTab === "settings" && (
              <SettingsPanel
                ignoredParameters={currentUser.ignoredParameters || []}
                onSave={saveSettings}
              />
            )}
            {activeTab === "compare" ? (
              <View>
                <View
                  style={[
                    styles.compareIntro,
                    compareRows && styles.compareIntroAfterComparison,
                  ]}
                >
                  <View>
                    <Text style={styles.sectionTitle}>Comparar Bases</Text>
                    <Text style={styles.sectionSubtitle}>
                      Selecione duas conexões para consultar e comparar seus
                      parâmetros e configurações.
                    </Text>
                  </View>
                  {compareRows && (
                    <Pressable
                      style={styles.compareSelectionToggle}
                      onPress={() =>
                        setCompareSelectionCollapsed((collapsed) => !collapsed)
                      }
                    >
                      <View style={styles.compareSelectionToggleIcon}>
                        <Text style={styles.compareSelectionToggleIconText}>
                          {compareSelectionCollapsed ? "⌄" : "⌃"}
                        </Text>
                      </View>
                      <Text style={styles.compareSelectionToggleText}>
                        {compareSelectionCollapsed
                          ? "Exibir seleção das bases"
                          : "Ocultar seleção das bases"}
                      </Text>
                    </Pressable>
                  )}
                </View>
                {notice && <NoticeBox notice={notice} />}
                {loading ? (
                  <View style={styles.loading}>
                    <ActivityIndicator color="#6558F5" />
                    <Text style={styles.muted}>Buscando conexões…</Text>
                  </View>
                ) : connections.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptySymbol}>⌁</Text>
                    <Text style={styles.emptyTitle}>
                      Cadastre conexões primeiro
                    </Text>
                    <Text style={styles.muted}>
                      A seleção para comparação usa as conexões registradas na
                      aba Conexões.
                    </Text>
                    <Pressable onPress={() => setActiveTab("connections")}>
                      <Text style={styles.link}>Ir para conexões</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    {!compareSelectionCollapsed && (
                      <>
                        <View style={styles.compareLayout}>
                          <CompareCard
                            title="Base de Dados 1"
                            subtitle="Primeira base da comparação"
                            selection={leftCompare}
                            connections={connections}
                            onSelect={(id) =>
                              selectForCompare(id, setLeftCompare, leftCompare)
                            }
                            onChange={setLeftCompare}
                          />
                          <View style={styles.compareArrow}>
                            <Text style={styles.compareArrowText}>⇄</Text>
                          </View>
                          <CompareCard
                            title="Base de Dados 2"
                            subtitle="Segunda base da comparação"
                            selection={rightCompare}
                            connections={connections}
                            onSelect={(id) =>
                              selectForCompare(
                                id,
                                setRightCompare,
                                rightCompare,
                              )
                            }
                            onChange={setRightCompare}
                          />
                        </View>
                        <View style={styles.compareAction}>
                          <Pressable
                            style={[
                              styles.primaryButton,
                              comparing && styles.disabled,
                            ]}
                            onPress={compareBases}
                            disabled={comparing}
                          >
                            {comparing ? (
                              <ActivityIndicator color="#FFFFFF" />
                            ) : (
                              <Text style={styles.primaryText}>
                                Comparar Bases
                              </Text>
                            )}
                          </Pressable>
                        </View>
                      </>
                    )}
                    {compareRows && (
                      <CompareOutput
                        rows={compareRows}
                        firstName={selectedName(
                          leftCompare.connectionId,
                          "Origem",
                        )}
                        secondName={selectedName(
                          rightCompare.connectionId,
                          "Destino",
                        )}
                        onlyDifferent={onlyDifferent}
                        onOnlyDifferentChange={setOnlyDifferent}
                        filters={resultFilters}
                        onFilterChange={(column, value) =>
                          setResultFilters((current) => ({
                            ...current,
                            [column]: value,
                          }))
                        }
                        showFilters={showFilters}
                        onToggleFilters={() =>
                          setShowFilters((value) => !value)
                        }
                        onDescriptionPress={setDescriptionDetail}
                        onExplanationPress={setExplanationDetail}
                        left={leftCompare}
                        right={rightCompare}
                        loadWebServices={loadWebServices}
                        compareWebServices={compareWebServices}
                        compareFeatures={compareFeatures}
                        comparisonVersion={comparisonVersion}
                        parameterGroups={parameterGroups}
                        selectedParameterGroupId={selectedParameterGroupId}
                        onParameterGroupChange={setSelectedParameterGroupId}
                      />
                    )}
                  </>
                )}
              </View>
            ) : activeTab === "connections" ? (
              <>
                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>
                      Conexões cadastradas
                    </Text>
                    <Text style={styles.sectionSubtitle}>
                      Gerencie as bases disponíveis para comparação.
                    </Text>
                  </View>
                  <Pressable style={styles.primaryButton} onPress={startNew}>
                    <Text style={styles.primaryText}>+ Nova conexão</Text>
                  </Pressable>
                </View>
                {notice && <NoticeBox notice={notice} />}
                <View style={styles.card}>
                  {loading ? (
                    <View style={styles.loading}>
                      <ActivityIndicator color="#6558F5" />
                      <Text style={styles.muted}>Buscando conexões…</Text>
                    </View>
                  ) : connections.length === 0 ? (
                    <View style={styles.empty}>
                      <Text style={styles.emptySymbol}>⌁</Text>
                      <Text style={styles.emptyTitle}>
                        Nenhuma conexão cadastrada
                      </Text>
                      <Text style={styles.muted}>
                        Cadastre a primeira base para começar.
                      </Text>
                      <Pressable onPress={startNew}>
                        <Text style={styles.link}>Cadastrar conexão</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <ScrollView horizontal>
                      <View style={styles.table}>
                        <View style={[styles.tableRow, styles.tableHead]}>
                          <Text style={[styles.tableHeadText, styles.nameCell]}>
                            CONEXÃO
                          </Text>
                          <Text style={[styles.tableHeadText, styles.typeCell]}>
                            TIPO
                          </Text>
                          <Text style={[styles.tableHeadText, styles.bankCell]}>
                            BANCO
                          </Text>
                          <Text
                            style={[styles.tableHeadText, styles.databaseCell]}
                          >
                            BASE
                          </Text>
                          <Text style={[styles.tableHeadText, styles.userCell]}>
                            USUÁRIO
                          </Text>
                          <Text
                            style={[styles.tableHeadText, styles.actionCell]}
                          ></Text>
                        </View>
                        {connections.map((item) => (
                          <View key={item.id} style={styles.tableRow}>
                            <View style={styles.nameCell}>
                              <View
                                style={[
                                  styles.databaseIcon,
                                  {
                                    backgroundColor: databaseColor(
                                      item.databaseType,
                                    ),
                                  },
                                ]}
                              >
                                <Text style={styles.databaseIconText}>
                                  {initials(item.databaseType)}
                                </Text>
                              </View>
                              <View>
                                <Text style={styles.connectionName}>
                                  {item.name}
                                </Text>
                                <Text style={styles.connectionSub}>
                                  {item.host}:{item.port}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.typeCell}>
                              <View style={styles.tag}>
                                <Text style={styles.tagText}>
                                  {item.environmentType || "Produção"}
                                </Text>
                              </View>
                            </View>
                            <Text style={[styles.cellText, styles.bankCell]}>
                              {databaseLabel(item.databaseType)}
                            </Text>
                            <Text
                              style={[styles.cellText, styles.databaseCell]}
                            >
                              {item.database}
                            </Text>
                            <Text style={[styles.cellText, styles.userCell]}>
                              {item.username}
                            </Text>
                            <View style={[styles.actions, styles.actionCell]}>
                              <Pressable onPress={() => edit(item)}>
                                <Text style={styles.edit}>Editar</Text>
                              </Pressable>
                              <Pressable onPress={() => remove(item)}>
                                <Text style={styles.delete}>Excluir</Text>
                              </Pressable>
                            </View>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  )}
                </View>
              </>
            ) : null}
          </ScrollView>
          <Modal
            visible={showForm}
            transparent
            animationType="fade"
            onRequestClose={() => setShowForm(false)}
          >
            <View style={styles.overlay}>
              <ScrollView contentContainerStyle={styles.modalScroll}>
                <View style={styles.modal}>
                  <View style={styles.modalHeader}>
                    <View>
                      <Text style={styles.modalTitle}>
                        {editingId ? "Editar conexão" : "Nova conexão"}
                      </Text>
                      <Text style={styles.modalSubtitle}>
                        As senhas são criptografadas antes de serem guardadas.
                      </Text>
                    </View>
                    <Pressable onPress={() => setShowForm(false)}>
                      <Text style={styles.close}>×</Text>
                    </Pressable>
                  </View>
                  {notice && <NoticeBox notice={notice} />}
                  <Field label="Nome da conexão">
                    <TextInput
                      style={styles.input}
                      value={form.name}
                      onChangeText={(value) => update("name", value)}
                      placeholder="Ex.: Produção ERP"
                      placeholderTextColor="#98A2B3"
                    />
                  </Field>
                  <Field label="Tipo">
                    <View style={styles.pickerBox}>
                      <Picker
                        style={styles.fullPicker}
                        selectedValue={form.environmentType}
                        onValueChange={(value: EnvironmentType) =>
                          update("environmentType", value)
                        }
                      >
                        {environments.map((value) => (
                          <Picker.Item
                            key={value}
                            label={value}
                            value={value}
                          />
                        ))}
                      </Picker>
                    </View>
                  </Field>
                  <Field label="Tipo de banco">
                    <View style={styles.pickerBox}>
                      <Picker
                        style={styles.fullPicker}
                        selectedValue={form.databaseType}
                        onValueChange={(value: DatabaseType) => {
                          update("databaseType", value);
                          update("port", defaultPort[value]);
                        }}
                      >
                        {databaseTypes.map((value) => (
                          <Picker.Item
                            key={value}
                            label={databaseLabel(value)}
                            value={value}
                          />
                        ))}
                      </Picker>
                    </View>
                  </Field>
                  <View style={styles.twoColumns}>
                    <View style={styles.flexTwo}>
                      <Field label="Host">
                        <TextInput
                          style={styles.input}
                          value={form.host}
                          onChangeText={(value) => update("host", value)}
                          autoCapitalize="none"
                          placeholder="db.exemplo.com"
                          placeholderTextColor="#98A2B3"
                        />
                      </Field>
                    </View>
                    <View style={styles.flexOne}>
                      <Field label="Porta">
                        <TextInput
                          style={styles.input}
                          value={String(form.port)}
                          onChangeText={(value) =>
                            update("port", Number(value.replace(/\D/g, "")))
                          }
                          keyboardType="numeric"
                          placeholder="5432"
                          placeholderTextColor="#98A2B3"
                        />
                      </Field>
                    </View>
                  </View>
                  <Field
                    label={
                      form.databaseType === "oracle"
                        ? "Service name"
                        : "Base de dados"
                    }
                  >
                    <TextInput
                      style={styles.input}
                      value={form.database}
                      onChangeText={(value) => update("database", value)}
                      autoCapitalize="none"
                      placeholder={
                        form.databaseType === "oracle"
                          ? "ORCLPDB1"
                          : "nome_da_base"
                      }
                      placeholderTextColor="#98A2B3"
                    />
                  </Field>
                  <Field label="Usuário">
                    <TextInput
                      style={styles.input}
                      value={form.username}
                      onChangeText={(value) => update("username", value)}
                      autoCapitalize="none"
                      placeholder="usuario"
                      placeholderTextColor="#98A2B3"
                    />
                  </Field>
                  <View style={styles.formActions}>
                    <Pressable
                      style={styles.secondaryButton}
                      onPress={openTest}
                      disabled={saving}
                    >
                      {saving ? (
                        <ActivityIndicator color="#4B5563" />
                      ) : (
                        <Text style={styles.secondaryText}>Testar conexão</Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={[styles.primaryButton, saving && styles.disabled]}
                      onPress={save}
                      disabled={saving}
                    >
                      {saving ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryText}>Salvar conexão</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            </View>
          </Modal>
          <Modal
            visible={showTestForm}
            transparent
            animationType="fade"
            onRequestClose={() => setShowTestForm(false)}
          >
            <View style={styles.overlay}>
              <View style={[styles.modal, styles.testConnectionModal]}>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>Testar conexão</Text>
                    <Text style={styles.modalSubtitle}>
                      Informe a senha somente para este teste. Ela não será
                      gravada.
                    </Text>
                  </View>
                  <Pressable onPress={() => setShowTestForm(false)}>
                    <Text style={styles.close}>×</Text>
                  </Pressable>
                </View>
                {testMessage && <NoticeBox notice={testMessage} />}
                <Field label="Nome da conexão">
                  <TextInput
                    style={styles.input}
                    value={form.name}
                    editable={false}
                  />
                </Field>
                <Field label="Usuário cadastrado">
                  <TextInput
                    style={styles.input}
                    value={form.username}
                    editable={false}
                    autoCapitalize="none"
                  />
                </Field>
                <Field label="Senha">
                  <TextInput
                    style={styles.input}
                    value={testPassword}
                    onChangeText={setTestPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoFocus
                    placeholder="Senha do banco"
                    placeholderTextColor="#98A2B3"
                  />
                </Field>
                <View style={styles.formActions}>
                  <Pressable
                    style={[styles.primaryButton, saving && styles.disabled]}
                    onPress={test}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.primaryText}>Executar teste</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
          <Modal
            visible={Boolean(descriptionDetail)}
            transparent
            animationType="fade"
            onRequestClose={() => setDescriptionDetail(null)}
          >
            <View style={styles.overlay}>
              <View style={styles.detailModal}>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>
                      Diferença na descrição
                    </Text>
                    <Text style={styles.modalSubtitle}>
                      Parâmetro {descriptionDetail?.cdParametro}
                    </Text>
                  </View>
                  <Pressable onPress={() => setDescriptionDetail(null)}>
                    <Text style={styles.close}>×</Text>
                  </Pressable>
                </View>
                <Text style={styles.detailLabel}>
                  {selectedName(leftCompare.connectionId, "Origem")}
                </Text>
                <Text style={styles.detailText}>
                  {descriptionDetail?.deParametroFirst || "—"}
                </Text>
                <Text style={styles.detailLabel}>
                  {selectedName(rightCompare.connectionId, "Destino")}
                </Text>
                <Text style={styles.detailText}>
                  {descriptionDetail?.deParametroSecond || "—"}
                </Text>
              </View>
            </View>
          </Modal>
          <Modal
            visible={Boolean(explanationDetail)}
            transparent
            animationType="fade"
            onRequestClose={() => setExplanationDetail(null)}
          >
            <View style={styles.overlay}>
              <ScrollView contentContainerStyle={styles.modalScroll}>
                <View style={styles.detailModal}>
                  <View style={styles.modalHeader}>
                    <View>
                      <Text style={styles.modalTitle}>
                        Explicação do parâmetro
                      </Text>
                      <Text style={styles.modalSubtitle}>
                        Parâmetro {explanationDetail?.cdParametro}
                      </Text>
                    </View>
                    <Pressable onPress={() => setExplanationDetail(null)}>
                      <Text style={styles.close}>×</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.detailLabel}>
                    {selectedName(leftCompare.connectionId, "Origem")}
                  </Text>
                  <Text style={styles.detailText}>
                    {explanationDetail?.firstExplanation || "—"}
                  </Text>
                  <Text style={styles.detailLabel}>
                    {selectedName(rightCompare.connectionId, "Destino")}
                  </Text>
                  <Text style={styles.detailText}>
                    {explanationDetail?.secondExplanation || "—"}
                  </Text>
                </View>
              </ScrollView>
            </View>
          </Modal>
        </View>
      </View>
    </View>
  );
}

const darkLogoStyles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 16,
    left: 16,
    zIndex: 10,
    width: 164,
    height: 130,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#071D3A",
  },
  image: { width: 160, height: 126 },
});

const styles = StyleSheet.create(
  Object.assign(
    {
      darkLogoOverlay: darkLogoStyles.overlay,
      darkLogo: darkLogoStyles.image,
      signOutButton: {
        width: 28,
        height: 28,
        alignItems: "center",
        justifyContent: "center",
      },
      signOutText: {
        color: "#B42318",
        fontSize: 20,
        fontWeight: "800",
        lineHeight: 23,
      },
      profileModal: { maxWidth: 560 },
      passwordLine: { flexDirection: "row", alignItems: "center", gap: 10 },
      passwordInput: { flex: 1 },
      passwordModal: {
        maxWidth: 480,
        alignSelf: "center",
        marginTop: "auto",
        marginBottom: "auto",
      },
      testConnectionModal: {
        maxWidth: 520,
        alignSelf: "center",
        marginTop: "auto",
        marginBottom: "auto",
      },
      profileSuccess: {
        color: "#027A48",
        backgroundColor: "#ECFDF3",
        borderRadius: 8,
        padding: 10,
        fontSize: 13,
        marginBottom: 14,
      },
      usersPage: { width: "100%" },
      adminPage: { width: "100%" },
      groupFilter: {
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#EAECF0",
      },
      groupCodesInput: {
        minHeight: 115,
        height: 115,
        textAlignVertical: "top",
        paddingTop: 10,
      },
      comparisonCriterionTextArea: {
        minHeight: 105,
        height: 105,
        textAlignVertical: "top",
        paddingTop: 10,
      },
      comparisonCriterionQuery: {
        minHeight: 120,
        height: 120,
        textAlignVertical: "top",
        paddingTop: 10,
      },
      comparisonConditionPanel: {
        marginTop: 4,
        marginBottom: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: "#DFDCFF",
        borderRadius: 12,
        backgroundColor: "#FAFAFF",
      },
      comparisonConditionTitle: {
        color: "#5546CB",
        fontWeight: "800",
        fontSize: 14,
        marginBottom: 14,
      },
      usersListPanel: { width: 330, maxHeight: 570 },
      userFormPanel: { flex: 1, padding: 22 },
      fullPicker: {
        width: "100%",
        height: "100%",
        color: "#172033",
        backgroundColor: "transparent",
        borderWidth: 0,
        outlineStyle: "none",
      },
      loginPage: {
        flex: 1,
        minHeight: "100%",
        backgroundColor: "#F4F7FC",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        position: "relative",
        overflow: "hidden",
      },
      loginCard: {
        position: "relative",
        zIndex: 2,
        width: "100%",
        maxWidth: 430,
        backgroundColor: "#FFFFFF",
        borderRadius: 22,
        padding: 30,
        borderWidth: 1,
        borderColor: "#E4EAF3",
        shadowColor: "#0B1F3A",
        shadowOpacity: 0.12,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 12 },
      },
      loginLogo: {
        width: 160,
        height: 126,
        alignSelf: "center",
        marginBottom: 12,
      },
      loginTitle: {
        color: "#172033",
        fontSize: 23,
        fontWeight: "800",
        textAlign: "center",
      },
      loginSubtitle: {
        color: "#667085",
        fontSize: 14,
        textAlign: "center",
        lineHeight: 20,
        marginTop: 8,
        marginBottom: 24,
      },
      loginError: {
        color: "#B42318",
        backgroundColor: "#FEF3F2",
        borderRadius: 8,
        padding: 10,
        fontSize: 13,
        marginBottom: 14,
      },
      usersModal: { maxWidth: 940 },
      usersLayout: { flexDirection: "row", gap: 24 },
      usersList: { width: 320, gap: 12 },
      userListItem: {
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#EAECF0",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 8,
      },
      userListItemActive: { backgroundColor: "#F4F3FF", borderRadius: 8 },
      userState: { color: "#027A48", fontSize: 11, fontWeight: "800" },
      groupListContent: { flex: 1, minWidth: 0 },
      groupCodesPreview: { flexShrink: 1, lineHeight: 18 },
      groupParameterCount: { flexShrink: 0, marginTop: 1 },
      userStateInactive: { color: "#B42318" },
      userForm: { flex: 1 },
      userFormTitle: {
        color: "#172033",
        fontSize: 17,
        fontWeight: "800",
        marginBottom: 16,
      },
      activeLine: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 16,
      },
      explanationResult: { width: 120, justifyContent: "center" },
      ellipsisButton: {
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 6,
        backgroundColor: "#F2F4F7",
      },
      ellipsisText: {
        color: "#475467",
        fontSize: 14,
        fontWeight: "900",
        letterSpacing: 1,
      },
      resultControls: { flexDirection: "row", alignItems: "center", gap: 14 },
      excelButton: {
        width: 38,
        height: 34,
        borderRadius: 7,
        backgroundColor: "#107C41",
        alignItems: "center",
        justifyContent: "center",
      },
      excelText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
      checkboxLine: { flexDirection: "row", alignItems: "center", gap: 8 },
      checkbox: {
        width: 18,
        height: 18,
        borderRadius: 4,
        borderColor: "#98A2B3",
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFFFFF",
      },
      checkboxChecked: { backgroundColor: "#6558F5", borderColor: "#6558F5" },
      checkmark: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
      checkboxText: { color: "#475467", fontSize: 13, fontWeight: "600" },
      statusHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      },
      filterButton: {
        width: 28,
        height: 28,
        borderRadius: 6,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#EAECF0",
      },
      filterIcon: { color: "#475467", fontSize: 17, fontWeight: "900" },
      filterRow: { backgroundColor: "#F9FAFB", minHeight: 54 },
      filterInput: {
        borderColor: "#D0D5DD",
        borderWidth: 1,
        borderRadius: 6,
        height: 33,
        paddingHorizontal: 8,
        color: "#344054",
        fontSize: 12,
        backgroundColor: "#FFFFFF",
      },
      noResults: {
        minHeight: 64,
        justifyContent: "center",
        alignItems: "center",
        borderTopColor: "#EAECF0",
        borderTopWidth: 1,
      },
      compareAction: { alignItems: "center", marginVertical: 22 },
      resultsCard: {
        backgroundColor: "#FFFFFF",
        borderColor: "#EAECF0",
        borderWidth: 1,
        borderRadius: 16,
        overflow: "hidden",
        shadowColor: "#101828",
        shadowOpacity: 0.06,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 8 },
        elevation: 2,
      },
      resultsHeading: {
        padding: 22,
        borderBottomColor: "#EAECF0",
        borderBottomWidth: 1,
      },
      resultsTable: { minWidth: 1000, width: "100%" },
      resultRow: {
        minHeight: 58,
        flexDirection: "row",
        alignItems: "center",
        borderTopColor: "#EAECF0",
        borderTopWidth: 1,
        paddingHorizontal: 20,
      },
      resultHead: {
        minHeight: 42,
        borderTopWidth: 0,
        backgroundColor: "#F9FAFB",
      },
      codeResult: { width: 130 },
      descriptionResult: { width: 290, justifyContent: "center" },
      webserviceCodeResult: { width: 380 },
      webserviceDescriptionResult: { width: 80 },
      featureCodeResult: { width: 470 },
      valueResult: { width: 220 },
      webserviceValueResult: { width: 150 },
      statusResult: { width: 160, justifyContent: "center" },
      descriptionLine: { flexDirection: "row", alignItems: "center", gap: 8 },
      warning: {
        width: 19,
        height: 19,
        borderRadius: 10,
        backgroundColor: "#FEC84B",
        alignItems: "center",
        justifyContent: "center",
      },
      warningText: { color: "#694000", fontSize: 13, fontWeight: "900" },
      resultTag: {
        alignSelf: "flex-start",
        paddingVertical: 5,
        paddingHorizontal: 9,
        borderRadius: 999,
      },
      resultTagEqual: { backgroundColor: "#ECFDF3" },
      resultTagDifferent: { backgroundColor: "#FEF3F2" },
      resultTagText: { fontSize: 11, fontWeight: "700" },
      resultTagTextEqual: { color: "#027A48" },
      resultTagTextDifferent: { color: "#B42318" },
      detailModal: {
        width: "90%",
        maxWidth: 520,
        alignSelf: "center",
        marginTop: "auto",
        marginBottom: "auto",
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        padding: 26,
        shadowColor: "#101828",
        shadowOpacity: 0.25,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 15 },
      },
      detailLabel: {
        color: "#667085",
        fontSize: 12,
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginTop: 10,
        marginBottom: 5,
      },
      detailText: {
        color: "#172033",
        fontSize: 15,
        lineHeight: 22,
        padding: 12,
        backgroundColor: "#F9FAFB",
        borderRadius: 8,
      },
      compareIntro: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 18,
        gap: 16,
      },
      compareIntroAfterComparison: {
        minHeight: 116,
        padding: 20,
        paddingBottom: 42,
        backgroundColor: "#F8F8FF",
        borderWidth: 1,
        borderColor: "#DFDCFF",
        borderRadius: 14,
        alignItems: "flex-start",
      },
      compareSelectionToggle: {
        position: "absolute",
        alignSelf: "center",
        bottom: -18,
        borderWidth: 1,
        borderColor: "#DFDCFF",
        backgroundColor: "#FFFFFF",
        borderRadius: 999,
        paddingHorizontal: 15,
        paddingVertical: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        shadowColor: "#6558F5",
        shadowOpacity: 0.1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
      },
      compareSelectionToggleIcon: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#EEEDFE",
      },
      compareSelectionToggleIconText: {
        color: "#5546CB",
        fontSize: 17,
        lineHeight: 18,
        fontWeight: "800",
      },
      compareSelectionToggleText: {
        color: "#5546CB",
        fontSize: 13,
        fontWeight: "700",
      },
      constructionBadge: {
        backgroundColor: "#F4F3FF",
        borderRadius: 999,
        paddingHorizontal: 11,
        paddingVertical: 7,
      },
      constructionBadgeText: {
        color: "#5546CB",
        fontSize: 12,
        fontWeight: "700",
      },
      compareLayout: { flexDirection: "row", alignItems: "center", gap: 16 },
      compareCard: {
        flex: 1,
        backgroundColor: "#FFFFFF",
        borderColor: "#EAECF0",
        borderWidth: 1,
        borderRadius: 16,
        padding: 22,
        shadowColor: "#101828",
        shadowOpacity: 0.05,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
      },
      compactCompareCard: { padding: 18 },
      compareCardTitle: { color: "#172033", fontSize: 17, fontWeight: "800" },
      compareCardSubtitle: {
        color: "#667085",
        fontSize: 13,
        marginTop: 5,
        marginBottom: 20,
      },
      compactCompareCardSubtitle: { marginBottom: 14 },
      compactField: { marginBottom: 9 },
      connectionPickerBox: { backgroundColor: "#FFFFFF" },
      connectionPicker: {
        width: "100%",
        height: "100%",
        borderWidth: 0,
        backgroundColor: "transparent",
        color: "#172033",
        fontSize: 14,
      },
      compareArrow: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: "#EEEDFE",
        alignItems: "center",
        justifyContent: "center",
      },
      compareArrowText: { color: "#6558F5", fontSize: 22, fontWeight: "800" },
      emptyCard: {
        alignItems: "center",
        paddingVertical: 56,
        backgroundColor: "#FFFFFF",
        borderColor: "#EAECF0",
        borderWidth: 1,
        borderRadius: 16,
        gap: 8,
      },
      dotOffline: { backgroundColor: "#D92D20" },
      statusTextOffline: { color: "#B42318" },
      dotWaiting: { backgroundColor: "#F79009" },
      statusTextWaiting: { color: "#B54708" },
      page: { flex: 1, minHeight: "100%", backgroundColor: "#F7F8FC" },
      content: {
        width: "100%",
        maxWidth: 1160,
        alignSelf: "center",
        padding: 32,
        paddingBottom: 64,
      },
      orbOne: {
        position: "absolute",
        width: 450,
        height: 450,
        borderRadius: 999,
        backgroundColor: "#ECEAFF",
        top: -230,
        right: -170,
      },
      orbTwo: {
        position: "absolute",
        width: 340,
        height: 340,
        borderRadius: 999,
        backgroundColor: "#E3F6F0",
        bottom: -120,
        left: -180,
      },
      brand: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 30,
      },
      eyebrow: {
        fontSize: 12,
        fontWeight: "800",
        letterSpacing: 1.8,
        color: "#6558F5",
        marginBottom: 7,
      },
      title: {
        fontSize: 32,
        fontWeight: "800",
        color: "#172033",
        letterSpacing: -1,
      },
      status: {
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        paddingVertical: 8,
        paddingHorizontal: 11,
        borderRadius: 999,
        backgroundColor: "#ECFDF3",
      },
      dot: { width: 7, height: 7, borderRadius: 7, backgroundColor: "#12B76A" },
      statusText: { color: "#027A48", fontSize: 12, fontWeight: "700" },
      tabs: {
        flexDirection: "row",
        alignSelf: "flex-start",
        backgroundColor: "#EAECF0",
        borderRadius: 10,
        padding: 4,
        marginBottom: 28,
      },
      tab: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 7 },
      tabActive: {
        backgroundColor: "#FFFFFF",
        shadowColor: "#101828",
        shadowOpacity: 0.08,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
      },
      tabText: { color: "#667085", fontWeight: "700", fontSize: 14 },
      tabTextActive: { color: "#4238B8" },
      construction: {
        backgroundColor: "#FFFFFF",
        borderColor: "#EAECF0",
        borderWidth: 1,
        borderRadius: 18,
        padding: 56,
        alignItems: "center",
        shadowColor: "#101828",
        shadowOpacity: 0.05,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 8 },
      },
      constructionIcon: {
        width: 64,
        height: 64,
        borderRadius: 20,
        backgroundColor: "#EEEDFE",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 18,
      },
      constructionSymbol: { color: "#6558F5", fontSize: 31, fontWeight: "700" },
      constructionTitle: { color: "#172033", fontWeight: "800", fontSize: 22 },
      constructionText: {
        color: "#6558F5",
        fontWeight: "800",
        fontSize: 15,
        marginTop: 9,
      },
      constructionDescription: {
        color: "#667085",
        fontSize: 14,
        textAlign: "center",
        maxWidth: 430,
        lineHeight: 21,
        marginTop: 9,
      },
      sectionHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 18,
        gap: 20,
      },
      sectionTitle: { fontSize: 21, color: "#172033", fontWeight: "800" },
      sectionSubtitle: { color: "#667085", fontSize: 14, marginTop: 5 },
      primaryButton: {
        backgroundColor: "#6558F5",
        borderRadius: 10,
        paddingHorizontal: 18,
        paddingVertical: 13,
        alignItems: "center",
        justifyContent: "center",
        minHeight: 48,
      },
      primaryText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
      card: {
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#EAECF0",
        borderRadius: 16,
        overflow: "hidden",
        shadowColor: "#101828",
        shadowOpacity: 0.06,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 8 },
        elevation: 2,
      },
      table: { minWidth: 970, width: "100%" },
      tableRow: {
        minHeight: 72,
        flexDirection: "row",
        alignItems: "center",
        borderTopWidth: 1,
        borderTopColor: "#EAECF0",
        paddingHorizontal: 20,
      },
      tableHead: {
        backgroundColor: "#F9FAFB",
        borderTopWidth: 0,
        minHeight: 42,
      },
      tableHeadText: {
        color: "#667085",
        fontSize: 11,
        fontWeight: "800",
        letterSpacing: 0.4,
      },
      nameCell: {
        width: 230,
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
      },
      typeCell: { width: 150, justifyContent: "center" },
      bankCell: { width: 130 },
      databaseCell: { width: 230 },
      userCell: { width: 140 },
      actionCell: { width: 140 },
      databaseIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
      },
      databaseIconText: { color: "#344054", fontWeight: "800", fontSize: 11 },
      connectionName: { color: "#172033", fontWeight: "700", fontSize: 14 },
      connectionSub: { color: "#98A2B3", fontSize: 12, marginTop: 2 },
      cellText: { color: "#475467", fontSize: 13 },
      tag: {
        alignSelf: "flex-start",
        backgroundColor: "#F4F3FF",
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 999,
      },
      tagText: { fontSize: 11, color: "#5546CB", fontWeight: "700" },
      actions: { flexDirection: "row", gap: 13 },
      edit: { color: "#6558F5", fontSize: 13, fontWeight: "700" },
      delete: { color: "#D92D20", fontSize: 13, fontWeight: "700" },
      empty: { alignItems: "center", paddingVertical: 56, gap: 8 },
      emptySymbol: { fontSize: 32, color: "#6558F5" },
      emptyTitle: { color: "#344054", fontWeight: "700", fontSize: 16 },
      muted: { color: "#667085", fontSize: 14 },
      link: { color: "#6558F5", fontWeight: "700", marginTop: 8 },
      loading: { paddingVertical: 50, alignItems: "center", gap: 12 },
      notice: {
        borderRadius: 10,
        padding: 14,
        marginBottom: 18,
        borderWidth: 1,
      },
      noticeSuccess: { backgroundColor: "#ECFDF3", borderColor: "#ABEFC6" },
      noticeError: { backgroundColor: "#FEF3F2", borderColor: "#FECDCA" },
      noticeTitle: { fontWeight: "700", color: "#344054", marginBottom: 3 },
      noticeText: { color: "#475467", fontSize: 13, lineHeight: 19 },
      overlay: { flex: 1, backgroundColor: "rgba(16,24,40,.46)" },
      modalScroll: { flexGrow: 1, justifyContent: "center", padding: 20 },
      modal: {
        backgroundColor: "#fff",
        width: "100%",
        maxWidth: 650,
        alignSelf: "center",
        padding: 26,
        borderRadius: 18,
        shadowColor: "#101828",
        shadowOpacity: 0.2,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 15 },
      },
      modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 22,
      },
      modalTitle: { color: "#172033", fontSize: 22, fontWeight: "800" },
      modalSubtitle: { color: "#667085", fontSize: 13, marginTop: 5 },
      close: { fontSize: 30, lineHeight: 28, color: "#667085" },
      field: { marginBottom: 15 },
      label: {
        color: "#344054",
        fontSize: 13,
        fontWeight: "700",
        marginBottom: 7,
      },
      input: {
        borderColor: "#D0D5DD",
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        height: 46,
        color: "#172033",
        fontSize: 15,
        backgroundColor: "#FFF",
      },
      pickerBox: {
        borderColor: "#D0D5DD",
        borderWidth: 1,
        borderRadius: 8,
        height: 46,
        overflow: "hidden",
        justifyContent: "center",
      },
      twoColumns: { flexDirection: "row", gap: 12 },
      flexTwo: { flex: 2 },
      flexOne: { flex: 1 },
      formActions: {
        flexDirection: "row",
        justifyContent: "flex-end",
        gap: 12,
        marginTop: 12,
      },
      secondaryButton: {
        borderWidth: 1,
        borderColor: "#D0D5DD",
        borderRadius: 10,
        paddingHorizontal: 18,
        minHeight: 48,
        justifyContent: "center",
        alignItems: "center",
      },
      secondaryText: { color: "#344054", fontSize: 14, fontWeight: "700" },
      disabled: { opacity: 0.6 },
    },
    {
      page: { flex: 1, backgroundColor: "#F7F8FC" },
      appShell: { flex: 1, flexDirection: "row", minHeight: "100%" },
      watermarkBlue: {
        position: "absolute",
        width: 560,
        height: 560,
        borderRadius: 280,
        borderWidth: 54,
        borderColor: "rgba(56, 137, 238, 0.055)",
        top: 180,
        right: -360,
      },
      watermarkGreen: {
        position: "absolute",
        width: 440,
        height: 440,
        borderRadius: 220,
        backgroundColor: "rgba(100, 196, 119, 0.045)",
        bottom: 60,
        right: 120,
      },
      watermarkRing: {
        position: "absolute",
        width: 330,
        height: 330,
        borderRadius: 165,
        borderWidth: 26,
        borderColor: "rgba(76, 177, 228, 0.045)",
        top: 430,
        left: 170,
      },
      sidebar: {
        width: 220,
        minWidth: 220,
        maxWidth: 220,
        backgroundColor: "#FFFFFF",
        borderRightWidth: 1,
        borderRightColor: "#EAECF0",
      },
      sidebarContent: {
        flexGrow: 1,
        padding: 16,
        justifyContent: "space-between",
      },
      sidebarBrand: { gap: 7 },
      sidebarLogo: { width: 160, height: 126, alignSelf: "flex-start" },
      sidebarTitle: { color: "#172033", fontSize: 20, fontWeight: "800" },
      sideTabs: { gap: 8, marginTop: 26, flex: 1 },
      sideTab: {
        width: "100%",
        paddingVertical: 12,
        paddingHorizontal: 13,
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
        backgroundColor: "transparent",
      },
      sideTabActive: {
        backgroundColor: "#EEEDFE",
        shadowOpacity: 0,
        elevation: 0,
      },
      tabIcon: {
        width: 24,
        height: 24,
        borderRadius: 8,
        backgroundColor: "#F2F4F7",
        alignItems: "center",
        justifyContent: "center",
      },
      tabIconActive: { backgroundColor: "#DFDCFF" },
      tabIconText: {
        color: "#667085",
        fontSize: 15,
        fontWeight: "800",
        lineHeight: 18,
      },
      tabIconTextActive: { color: "#5546CB" },
      sidebarFooter: { gap: 16 },
      userBar: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        padding: 8,
        borderRadius: 10,
        backgroundColor: "#F9FAFB",
      },
      userAvatar: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#E4EEFF",
      },
      userAvatarText: { color: "#315FA6", fontSize: 12, fontWeight: "800" },
      userName: { flex: 1, color: "#344054", fontSize: 13, fontWeight: "700" },
      themeToggle: {
        width: 30,
        height: 30,
        borderRadius: 8,
        backgroundColor: "#EEEDFE",
        alignItems: "center",
        justifyContent: "center",
      },
      themeToggleText: {
        color: "#5546CB",
        fontSize: 18,
        lineHeight: 21,
        fontWeight: "800",
      },
      sidebarStatuses: {
        gap: 12,
        paddingTop: 14,
        borderTopWidth: 1,
        borderTopColor: "#EAECF0",
      },
      sideStatus: { flexDirection: "row", alignItems: "center", gap: 7 },
      statusText: { flex: 1 },
      connectorDownload: {
        width: "100%",
        minHeight: 58,
        borderRadius: 11,
        paddingHorizontal: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: "#F4F3FF",
        borderWidth: 1,
        borderColor: "#DFDCFF",
      },
      connectorDownloadIcon: {
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: "#071D3A",
        alignItems: "center",
        justifyContent: "center",
      },
      connectorDownloadText: {
        color: "#5546CB",
        fontSize: 13,
        fontWeight: "400",
        flex: 1,
      },
      mainContent: {
        width: "100%",
        maxWidth: 1260,
        alignSelf: "center",
        padding: 34,
        paddingBottom: 64,
      },
      settingsPage: { width: "100%" },
      settingsCard: { width: "100%", maxWidth: 720, padding: 24 },
      settingsInput: { minHeight: 46 },
      settingsHelp: {
        color: "#667085",
        fontSize: 13,
        lineHeight: 19,
        marginTop: -4,
        marginBottom: 18,
      },
      settingsButton: { alignSelf: "flex-start" },
      input: {
        height: 40,
        borderColor: "#D0D5DD",
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        color: "#172033",
        fontSize: 14,
        backgroundColor: "#FFF",
      },
      pickerBox: {
        width: "100%",
        height: 40,
        borderColor: "#D0D5DD",
        borderWidth: 1,
        borderRadius: 8,
        overflow: "hidden",
        justifyContent: "center",
        backgroundColor: "#FFF",
      },
      resultControls: {
        alignItems: "flex-end",
        gap: 7,
      },
      resultsSummary: { gap: 16 },
      resultsCountLine: {
        flexDirection: "row",
        alignSelf: "stretch",
        alignItems: "center",
        gap: 8,
        transform: [{ translateX: -5 }],
      },
      resultsCountIcon: { width: 31, height: 31 },
      hiddenTab: { display: "none" },
      parameterGroupFilter: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      },
      parameterGroupLabel: {
        color: "#475467",
        fontSize: 12,
        fontWeight: "600",
      },
      parameterGroupPicker: {
        width: 250,
        height: 30,
        borderColor: "#D0D5DD",
        borderWidth: 1,
        borderRadius: 7,
        overflow: "hidden",
        backgroundColor: "#FFFFFF",
      },
      resultsHeading: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 20,
        padding: 22,
        borderBottomColor: "#EAECF0",
        borderBottomWidth: 1,
      },
      compareSubtabs: {
        flexDirection: "row",
        gap: 6,
        borderBottomWidth: 1,
        borderBottomColor: "#EAECF0",
        marginBottom: 18,
      },
      compareSubtab: {
        paddingVertical: 11,
        paddingHorizontal: 14,
        borderBottomWidth: 2,
        borderBottomColor: "transparent",
      },
      compareSubtabActive: { borderBottomColor: "#6558F5" },
      compareSubtabText: { color: "#667085", fontSize: 13, fontWeight: "700" },
      compareSubtabTextActive: { color: "#5546CB" },
      webserviceSelectors: { flexDirection: "row", gap: 16, marginBottom: 18 },
      constructionPanel: {
        minHeight: 370,
        backgroundColor: "#FFFFFF",
        borderColor: "#EAECF0",
        borderWidth: 1,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      },
      constructionImage: { width: 180, height: 180, marginBottom: 10 },
      constructionTitle: { color: "#172033", fontWeight: "800", fontSize: 19 },
      constructionText: {
        color: "#6558F5",
        fontWeight: "800",
        fontSize: 14,
        marginTop: 7,
      },
    },
  ) as any,
);
