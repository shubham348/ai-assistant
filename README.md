# AI Assistant

A chat application that lets you talk to AI models running locally or through Gemini and Groq.

## What you need

- Node.js 20.19 or newer
- npm
- Ollama if you want to use a local AI model
- A Gemini or Groq API key only if you want to use that provider

## Set up

Open two terminals in the project folder.

### 1. Start the backend

```powershell
cd server
npm install
Copy-Item .env.example .env
npm run dev
```

The backend will run at `http://localhost:3000`.

### 2. Start the frontend

In the second terminal:

```powershell
cd client
npm install
npm run dev
```

Open the address shown by Vite, usually `http://localhost:5173`.

## Configure AI models

Edit `server/.env`.

For a local Ollama model:

```dotenv
AI_MODELS=ollama:qwen2.5:3b
AI_DEFAULT_MODEL=ollama:qwen2.5:3b
OLLAMA_MODEL=qwen2.5:3b
```

If Ollama is not installed yet, install it and download the model:

```powershell
ollama serve
ollama pull qwen2.5:3b
```

Keep Ollama running in the background.

For Gemini:

```dotenv
AI_MODELS=gemini:gemini-2.5-flash
AI_DEFAULT_MODEL=gemini:gemini-2.5-flash
GEMINI_API_KEY=your_api_key
```

For Groq:

```dotenv
AI_MODELS=groq:llama-3.3-70b-versatile
AI_DEFAULT_MODEL=groq:llama-3.3-70b-versatile
GROQ_API_KEY=your_api_key
```

You can configure several providers at once by separating their values with commas:

```dotenv
AI_MODELS=ollama:qwen2.5:3b,gemini:gemini-2.5-flash,groq:llama-3.3-70b-versatile
AI_DEFAULT_MODEL=ollama:qwen2.5:3b
GEMINI_API_KEY=
GROQ_API_KEY=
```

Restart the backend after changing `server/.env`.

## Useful commands

Backend:

```powershell
npm run dev
npm run typecheck
npm run test:context
```

Frontend:

```powershell
npm run dev
npm run build
npm run lint
npm run preview
```

Run backend commands inside `server` and frontend commands inside `client`.

## Data

Conversations are saved automatically in `server/data/assistant.db` using SQLite.

## Common issues

**The frontend cannot connect**

- Start the backend first.
- Open `http://localhost:3000/api/health` and confirm it returns a successful response.

**Ollama is not available**

- Run `ollama serve`.
- Download the configured model with `ollama pull <model-name>`.
- Confirm it appears in `ollama list`.

**The API key is not working**

- Add the correct key to `server/.env`.
- Restart the backend after making the change.
