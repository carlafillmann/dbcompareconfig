# DB Compare Config

Interface web em React Native para cadastrar e testar conexões Oracle, SQL Server e PostgreSQL. O catálogo de conexões persiste diretamente no Firestore; senhas de bases externas não são armazenadas.

## Configuração

1. Copie `.env.example` para `.env` e informe uma chave de criptografia de 64 caracteres hexadecimais.
2. Configure `EXPO_PUBLIC_FIREBASE_API_KEY` no `.env` (a chave pública da configuração Web do projeto Firebase).
3. Instale os pacotes: `npm install`.
4. Execute `npm start`. A API ficará em `http://127.0.0.1:3333`; use a URL exibida pelo Expo para abrir a interface web.

## Uso com Firebase Hosting

A interface pode ser publicada no Firebase Hosting e acessa o Firestore diretamente. A API continua **local** apenas para alcançar bancos da rede corporativa. Antes de gerar a versão para Hosting, configure `EXPO_PUBLIC_DATABASE_API_URL` e execute `npm run build:web`. Publique a interface e as regras com `npx firebase deploy --only hosting,firestore:rules`.

A API escuta somente em `127.0.0.1` e aceita chamadas apenas dos domínios deste Firebase Hosting e do ambiente de desenvolvimento local. Cada computador que utilizar os testes de banco precisará instalar as dependências, configurar sua própria conta de serviço e iniciar a API local.

## Oracle

O driver `oracledb` pode exigir o Oracle Instant Client na máquina/servidor da API. Consulte a documentação do driver caso o teste retorne erro de cliente Oracle ausente.

## Segurança

O navegador nunca testa bancos diretamente: ele envia os dados via HTTPS para a API, que executa a conexão. As senhas são usadas apenas nessa requisição, não ficam no Firestore. Em produção, proteja a API com autenticação e substitua a regra aberta do Firestore por autenticação adequada.

## DBCompare Connector (Windows)

Para distribuir a API local sem exigir Node.js ou terminal, gere o instalador Windows com `npm run package:connector`. O arquivo será criado na pasta `release`. Após a instalação, o **DBCompare Connector** inicia com o Windows, fica na bandeja do sistema e mantém a API em `127.0.0.1:3333` apenas para a máquina local. Clique duas vezes no ícone da bandeja para abrir o DBCompare; o menu permite reiniciar a API ou encerrar o Connector.

O instalador é distribuído pelo [GitHub Releases](https://github.com/carlafillmann/dbcompareconfig/releases/tag/v1.0.0). O botão de download ao lado do status do Connector aponta para essa versão.
