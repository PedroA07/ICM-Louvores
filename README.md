# ICM Louvores

Reprodutor de louvores da **Igreja Cristã Maranata** — estilo Spotify, com áudios, partituras e capas de álbum embutidas.

![Plataforma](https://img.shields.io/badge/plataforma-Windows-blue)
![Versão](https://img.shields.io/badge/versão-1.0.0-red)
![Licença](https://img.shields.io/badge/licença-privado-lightgrey)

---

## Download e Instalação

1. Acesse a página de [Releases](https://github.com/PedroA07/ICM-Louvores/releases/latest)
2. Baixe o arquivo **`ICM.Louvores.Setup.1.0.0.exe`**
3. Execute o instalador e siga os passos
4. Na primeira abertura, o app baixa automaticamente todos os louvores (~1.8 GB) — aguarde alguns minutos

> **Requisitos:** Windows 10 ou superior (64-bit) · Conexão com internet na primeira abertura

---

## Funcionalidades

- Reprodução de áudio com barra de progresso e controle de volume
- Separação por categorias: Coletânea, Avulsos, Equipe de Louvor, CIAs, Seminário
- Visualização de partituras em PDF integrada ao app
- Capas de álbum carregadas dos metadados ID3 dos arquivos MP3
- Busca por título, número, artista ou álbum
- Download automático dos louvores na primeira execução
- Interface com as cores e identidade visual da Igreja Cristã Maranata

---

## Estrutura do Projeto

```
ICM APP/
├── main.js          # Processo principal do Electron (janela, download, servidor)
├── preload.js       # Bridge de IPC entre main e renderer
├── server.js        # Servidor Express (API de catálogo, streaming de áudio/PDF)
├── public/
│   ├── index.html   # Interface completa do app
│   ├── loading.html # Tela de carregamento / progresso de download
│   └── icon.ico     # Ícone do aplicativo
└── package.json
```

---

## Tecnologias

| Tecnologia | Uso |
|---|---|
| [Electron](https://www.electronjs.org/) | App desktop nativo Windows |
| [Express](https://expressjs.com/) | Servidor local de áudio, PDF e API |
| [music-metadata](https://github.com/borewit/music-metadata) | Leitura de metadados e capas dos MP3s |
| [extract-zip](https://github.com/maxogden/extract-zip) | Extração do zip de louvores no primeiro uso |

---

## Desenvolvimento

```bash
# Instalar dependências
npm install

# Rodar apenas o servidor web (sem Electron)
npm start

# Rodar o app Electron em modo desenvolvimento
npm run electron

# Gerar instalador Windows (.exe)
npm run build
```

> Para desenvolvimento, coloque a pasta `louvores/Material para ensaio` dentro do diretório do projeto.

---

## Como Funciona o Download Automático

Na primeira execução, o app verifica se os louvores estão presentes. Se não estiver:

1. Baixa `louvores.zip` (~1.8 GB) do GitHub Releases com barra de progresso
2. Extrai para `%APPDATA%\ICM Louvores\louvores\`
3. Salva o caminho em `%APPDATA%\ICM Louvores\config.json`
4. Nas próximas aberturas, carrega direto sem baixar novamente

---

*Igreja Cristã Maranata — Maanaim de Domingos Martins, ES*
