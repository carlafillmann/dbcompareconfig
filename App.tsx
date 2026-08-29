import { Picker } from '@react-native-picker/picker';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type DatabaseType = 'oracle' | 'sqlserver' | 'postgresql';
type Connection = {
  id: string;
  name: string;
  databaseType: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  hasPassword: boolean;
  createdAt?: string;
};
type FormData = Omit<Connection, 'id' | 'hasPassword' | 'createdAt'> & { password: string };
type Notice = { type: 'success' | 'error'; title: string; message: string } | null;

const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3333';
const emptyForm: FormData = { name: '', databaseType: 'postgresql', host: '', port: 5432, database: '', username: '', password: '' };
const defaultPort: Record<DatabaseType, number> = { oracle: 1521, sqlserver: 1433, postgresql: 5432 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>{children}</View>;
}

export default function App() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [showForm, setShowForm] = useState(false);

  const request = async (path: string, options?: RequestInit) => {
    const response = await fetch(`${apiUrl}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
    const body = await response.json().catch(() => ({ message: 'Resposta inválida da API.' }));
    if (!response.ok) throw new Error(body.message || 'Não foi possível concluir a operação.');
    return body;
  };

  const loadConnections = async () => {
    try { setLoading(true); setConnections((await request('/api/connections')).connections); }
    catch (error) { setNotice({ type: 'error', title: 'Não foi possível carregar', message: error instanceof Error ? error.message : 'Erro desconhecido.' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadConnections(); }, []);

  const update = <K extends keyof FormData>(key: K, value: FormData[K]) => setForm(current => ({ ...current, [key]: value }));
  const startNew = () => { setEditingId(null); setForm(emptyForm); setNotice(null); setShowForm(true); };
  const startEdit = (connection: Connection) => {
    setEditingId(connection.id);
    setForm({ name: connection.name, databaseType: connection.databaseType, host: connection.host, port: connection.port, database: connection.database, username: connection.username, password: '' });
    setNotice(null); setShowForm(true);
  };
  const validate = (requirePassword = true) => {
    if (!form.name || !form.host || !form.database || !form.username || (requirePassword && !form.password)) throw new Error(requirePassword ? 'Preencha todos os campos, incluindo a senha.' : 'Preencha nome, tipo, host, porta, base e usuário.');
    if (!Number.isInteger(Number(form.port)) || Number(form.port) < 1 || Number(form.port) > 65535) throw new Error('Informe uma porta válida (1 a 65535).');
  };
  const test = async () => {
    try {
      validate(); setSaving(true); setNotice(null);
      const result = await request('/api/connections/test', { method: 'POST', body: JSON.stringify({ ...form, port: Number(form.port) }) });
      setNotice({ type: 'success', title: 'Conexão estabelecida', message: result.message });
    } catch (error) { setNotice({ type: 'error', title: 'Falha no teste', message: error instanceof Error ? error.message : 'Erro desconhecido.' }); }
    finally { setSaving(false); }
  };
  const save = async () => {
    try {
      validate(!editingId); setSaving(true); setNotice(null);
      const path = editingId ? `/api/connections/${editingId}` : '/api/connections';
      await request(path, { method: editingId ? 'PUT' : 'POST', body: JSON.stringify({ ...form, port: Number(form.port) }) });
      await loadConnections(); setShowForm(false); setNotice({ type: 'success', title: 'Tudo certo', message: editingId ? 'Conexão atualizada.' : 'Conexão cadastrada.' });
    } catch (error) { setNotice({ type: 'error', title: 'Não foi possível salvar', message: error instanceof Error ? error.message : 'Erro desconhecido.' }); }
    finally { setSaving(false); }
  };
  const remove = async (connection: Connection) => {
    const confirmed = Platform.OS !== 'web' || window.confirm(`Excluir a conexão “${connection.name}”?`);
    if (!confirmed) return;
    try { await request(`/api/connections/${connection.id}`, { method: 'DELETE' }); await loadConnections(); setNotice({ type: 'success', title: 'Conexão excluída', message: `${connection.name} foi removida.` }); }
    catch (error) { setNotice({ type: 'error', title: 'Não foi possível excluir', message: error instanceof Error ? error.message : 'Erro desconhecido.' }); }
  };

  return <View style={styles.page}><StatusBar style="dark" />
    <View style={styles.orbOne} /><View style={styles.orbTwo} />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}><View><Text style={styles.eyebrow}>DB COMPARE</Text><Text style={styles.title}>Conexões de dados</Text><Text style={styles.subtitle}>Centralize e valide os bancos que serão comparados.</Text></View>
        <Pressable style={styles.primaryButton} onPress={startNew}><Text style={styles.primaryButtonText}>+ Nova conexão</Text></Pressable></View>
      {notice && <View style={[styles.notice, notice.type === 'success' ? styles.noticeSuccess : styles.noticeError]}><Text style={styles.noticeTitle}>{notice.title}</Text><Text style={styles.noticeText}>{notice.message}</Text></View>}
      <View style={styles.card}><View style={styles.cardHeading}><View><Text style={styles.cardTitle}>Bases cadastradas</Text><Text style={styles.cardSubtitle}>{connections.length} {connections.length === 1 ? 'conexão configurada' : 'conexões configuradas'}</Text></View></View>
        {loading ? <View style={styles.loading}><ActivityIndicator color="#6558F5" /><Text style={styles.muted}>Buscando conexões…</Text></View> : connections.length === 0 ? <View style={styles.empty}><Text style={styles.emptyIcon}>⌁</Text><Text style={styles.emptyTitle}>Ainda não há conexões</Text><Text style={styles.muted}>Cadastre a primeira base para começar.</Text><Pressable onPress={startNew}><Text style={styles.link}>Cadastrar conexão</Text></Pressable></View> : connections.map(connection => <View key={connection.id} style={styles.connectionRow}><View style={[styles.databaseIcon, { backgroundColor: colorFor(connection.databaseType) }]}><Text style={styles.databaseIconText}>{initialsFor(connection.databaseType)}</Text></View><View style={styles.connectionInfo}><Text style={styles.connectionName}>{connection.name}</Text><Text style={styles.connectionDetails}>{labelFor(connection.databaseType)} · {connection.host}:{connection.port} · {connection.database}</Text><Text style={styles.connectionUser}>{connection.username}</Text></View><View style={styles.actions}><Pressable onPress={() => startEdit(connection)}><Text style={styles.edit}>Editar</Text></Pressable><Pressable onPress={() => remove(connection)}><Text style={styles.delete}>Excluir</Text></Pressable></View></View>)}</View>
    </ScrollView>
    <Modal visible={showForm} transparent animationType="fade" onRequestClose={() => setShowForm(false)}><View style={styles.overlay}><ScrollView contentContainerStyle={styles.modalScroll}><View style={styles.modal}><View style={styles.modalHeader}><View><Text style={styles.modalTitle}>{editingId ? 'Editar conexão' : 'Nova conexão'}</Text><Text style={styles.modalSubtitle}>Os dados são criptografados antes de serem guardados.</Text></View><Pressable onPress={() => setShowForm(false)}><Text style={styles.close}>×</Text></Pressable></View>
      {notice && <View style={[styles.notice, notice.type === 'success' ? styles.noticeSuccess : styles.noticeError]}><Text style={styles.noticeTitle}>{notice.title}</Text><Text style={styles.noticeText}>{notice.message}</Text></View>}
      <Field label="Nome da conexão"><TextInput style={styles.input} value={form.name} onChangeText={v => update('name', v)} placeholder="Ex.: Produção ERP" placeholderTextColor="#98A2B3" /></Field>
      <Field label="Tipo de banco"><View style={styles.pickerBox}><Picker selectedValue={form.databaseType} onValueChange={(v: DatabaseType) => { update('databaseType', v); update('port', defaultPort[v]); }}><Picker.Item label="PostgreSQL" value="postgresql" /><Picker.Item label="Oracle" value="oracle" /><Picker.Item label="SQL Server" value="sqlserver" /></Picker></View></Field>
      <View style={styles.twoColumns}><View style={styles.flexTwo}><Field label="Host"><TextInput style={styles.input} value={form.host} onChangeText={v => update('host', v)} autoCapitalize="none" placeholder="db.exemplo.com" placeholderTextColor="#98A2B3" /></Field></View><View style={styles.flexOne}><Field label="Porta"><TextInput style={styles.input} value={String(form.port)} onChangeText={v => update('port', Number(v.replace(/\D/g, '')))} keyboardType="numeric" placeholder="5432" placeholderTextColor="#98A2B3" /></Field></View></View>
      <Field label={form.databaseType === 'oracle' ? 'Service name' : 'Base de dados'}><TextInput style={styles.input} value={form.database} onChangeText={v => update('database', v)} autoCapitalize="none" placeholder={form.databaseType === 'oracle' ? 'ORCLPDB1' : 'nome_da_base'} placeholderTextColor="#98A2B3" /></Field>
      <Field label="Usuário"><TextInput style={styles.input} value={form.username} onChangeText={v => update('username', v)} autoCapitalize="none" placeholder="usuario" placeholderTextColor="#98A2B3" /></Field>
      <Field label="Senha"><TextInput style={styles.input} value={form.password} onChangeText={v => update('password', v)} secureTextEntry autoCapitalize="none" placeholder={editingId ? 'Informe a senha para alterar ou testar' : 'Senha do banco'} placeholderTextColor="#98A2B3" /></Field>
      <View style={styles.formActions}><Pressable style={styles.secondaryButton} onPress={test} disabled={saving}>{saving ? <ActivityIndicator color="#4B5563" /> : <Text style={styles.secondaryText}>Testar conexão</Text>}</Pressable><Pressable style={[styles.primaryButton, saving && styles.disabled]} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Salvar conexão</Text>}</Pressable></View>
    </View></ScrollView></View></Modal>
  </View>;
}

const labelFor = (type: DatabaseType) => ({ oracle: 'Oracle', sqlserver: 'SQL Server', postgresql: 'PostgreSQL' })[type];
const initialsFor = (type: DatabaseType) => ({ oracle: 'OR', sqlserver: 'MS', postgresql: 'PG' })[type];
const colorFor = (type: DatabaseType) => ({ oracle: '#FDE8E7', sqlserver: '#E4EEFF', postgresql: '#E6F5F0' })[type];
const styles = StyleSheet.create({
  page: { flex: 1, minHeight: '100%', backgroundColor: '#F7F8FC' }, content: { width: '100%', maxWidth: 1120, alignSelf: 'center', padding: 32, paddingBottom: 64 }, orbOne: { position: 'absolute', width: 450, height: 450, borderRadius: 999, backgroundColor: '#ECEAFF', top: -230, right: -170 }, orbTwo: { position: 'absolute', width: 340, height: 340, borderRadius: 999, backgroundColor: '#E3F6F0', bottom: -120, left: -180 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 36, gap: 20 }, eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.8, color: '#6558F5', marginBottom: 8 }, title: { fontSize: 34, fontWeight: '800', color: '#172033', letterSpacing: -1 }, subtitle: { fontSize: 16, color: '#667085', marginTop: 8 }, primaryButton: { backgroundColor: '#6558F5', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', minHeight: 48 }, primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' }, card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EAECF0', borderRadius: 16, padding: 24, shadowColor: '#101828', shadowOpacity: .06, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 2 }, cardHeading: { marginBottom: 16 }, cardTitle: { color: '#172033', fontSize: 18, fontWeight: '700' }, cardSubtitle: { color: '#667085', marginTop: 4 }, connectionRow: { borderTopWidth: 1, borderTopColor: '#EAECF0', paddingVertical: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }, databaseIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, databaseIconText: { color: '#344054', fontWeight: '800', fontSize: 12 }, connectionInfo: { flex: 1, gap: 3 }, connectionName: { color: '#172033', fontWeight: '700', fontSize: 15 }, connectionDetails: { color: '#667085', fontSize: 13 }, connectionUser: { color: '#98A2B3', fontSize: 12 }, actions: { flexDirection: 'row', gap: 16 }, edit: { color: '#6558F5', fontSize: 13, fontWeight: '700' }, delete: { color: '#D92D20', fontSize: 13, fontWeight: '700' }, empty: { alignItems: 'center', paddingVertical: 56, borderTopWidth: 1, borderTopColor: '#EAECF0', gap: 8 }, emptyIcon: { fontSize: 32, color: '#6558F5' }, emptyTitle: { color: '#344054', fontWeight: '700', fontSize: 16 }, muted: { color: '#667085', fontSize: 14 }, link: { color: '#6558F5', fontWeight: '700', marginTop: 8 }, loading: { paddingVertical: 50, alignItems: 'center', gap: 12 }, notice: { borderRadius: 10, padding: 14, marginBottom: 18, borderWidth: 1 }, noticeSuccess: { backgroundColor: '#ECFDF3', borderColor: '#ABEFC6' }, noticeError: { backgroundColor: '#FEF3F2', borderColor: '#FECDCA' }, noticeTitle: { fontWeight: '700', color: '#344054', marginBottom: 3 }, noticeText: { color: '#475467', fontSize: 13, lineHeight: 19 }, overlay: { flex: 1, backgroundColor: 'rgba(16,24,40,.46)' }, modalScroll: { flexGrow: 1, justifyContent: 'center', padding: 20 }, modal: { backgroundColor: '#fff', width: '100%', maxWidth: 650, alignSelf: 'center', padding: 26, borderRadius: 18, shadowColor: '#101828', shadowOpacity: .2, shadowRadius: 30, shadowOffset: { width: 0, height: 15 } }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }, modalTitle: { color: '#172033', fontSize: 22, fontWeight: '800' }, modalSubtitle: { color: '#667085', fontSize: 13, marginTop: 5 }, close: { fontSize: 30, lineHeight: 28, color: '#667085' }, field: { marginBottom: 15 }, label: { color: '#344054', fontSize: 13, fontWeight: '700', marginBottom: 7 }, input: { borderColor: '#D0D5DD', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, height: 46, color: '#172033', fontSize: 15, backgroundColor: '#FFF' }, pickerBox: { borderColor: '#D0D5DD', borderWidth: 1, borderRadius: 8, height: 46, overflow: 'hidden', justifyContent: 'center' }, twoColumns: { flexDirection: 'row', gap: 12 }, flexTwo: { flex: 2 }, flexOne: { flex: 1 }, formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12 }, secondaryButton: { borderWidth: 1, borderColor: '#D0D5DD', borderRadius: 10, paddingHorizontal: 18, minHeight: 48, justifyContent: 'center', alignItems: 'center' }, secondaryText: { color: '#344054', fontSize: 14, fontWeight: '700' }, disabled: { opacity: .6 }
});
