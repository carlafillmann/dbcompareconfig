# DB Compare Config

Interface web em React Native para cadastrar e testar conexões Oracle, SQL Server e PostgreSQL. Os dados persistem no Firestore pela API local; senhas são criptografadas antes de serem salvas.

## Configuração

1. Copie `.env.example` para `.env` e informe uma chave de criptografia de 64 caracteres hexadecimais.
2. No Firebase Console, gere uma **conta de serviço** (Configurações do projeto > Contas de serviço > Gerar nova chave privada) e salve o JSON como `service-account.json` na raiz do projeto, ou preencha as variáveis Firebase no `.env`.
3. Instale os pacotes: `npm install`.
4. Execute `npm start`. A API ficará em `http://127.0.0.1:3333`; use a URL exibida pelo Expo para abrir a interface web.

## Uso com Firebase Hosting

A interface pode ser publicada no Firebase Hosting, mas a API continua **local** para alcançar bancos da rede corporativa. Antes de gerar a versão para Hosting, mantenha `EXPO_PUBLIC_API_URL=http://127.0.0.1:3333` no `.env` e execute `npm run build:web`. Com a API local iniciada por `npm run api`, publique a interface com `npx firebase deploy --only hosting`.

A API escuta somente em `127.0.0.1` e aceita chamadas apenas dos domínios deste Firebase Hosting e do ambiente de desenvolvimento local. Cada computador que utilizar os testes de banco precisará instalar as dependências, configurar sua própria conta de serviço e iniciar a API local.

## Oracle

O driver `oracledb` pode exigir o Oracle Instant Client na máquina/servidor da API. Consulte a documentação do driver caso o teste retorne erro de cliente Oracle ausente.

## Segurança

O navegador nunca testa bancos diretamente: ele envia os dados via HTTPS para a API, que executa a conexão e guarda a senha cifrada no Firestore. Em produção, proteja a API com autenticação e mantenha `CONNECTION_ENCRYPTION_KEY` apenas em um cofre de segredos.
