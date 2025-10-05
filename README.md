NotebookLM Clone
================

A minimal Google NotebookLM-like app: upload a PDF, index per-page text, chat with RAG, and click citations to jump to pages.

Setup
-----

Backend (OpenAI cloud)
```
cd backend
echo "PORT=4000" > .env
echo "OPENAI_BASE_URL=https://api.openai.com/v1" >> .env
echo "OPENAI_API_KEY=sk-..." >> .env
echo "MODEL_EMBED=text-embedding-3-small" >> .env
echo "MODEL_CHAT=gpt-4o-mini" >> .env
npm install
npm run dev
```

Frontend
```
cd frontend
npm install
VITE_API_URL=http://localhost:4000 npm run dev
```

Local (free) with Ollama
------------------------
1) Install Ollama (macOS)
```
brew install --cask ollama
open -a Ollama
```
2) Pull models
```
ollama pull nomic-embed-text
ollama pull llama3.1:8b   # or: ollama pull mistral:7b
```
3) Configure backend for local API
```
cd backend
cat > .env << 'EOF'
PORT=4000
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
MODEL_EMBED=nomic-embed-text
MODEL_CHAT=llama3.1:8b
EOF
npm run dev
```

Usage
-----
- Upload a PDF. The app extracts per-page text client-side and indexes embeddings on the server.
- Ask questions in the chat. Answers include citation buttons by page; click to scroll the viewer to that page.

Notes
-----
- In-memory vector store for demo; replace with a real vector DB for production (pgvector/Qdrant).
- Environment vars: `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `MODEL_EMBED`, `MODEL_CHAT`, `PORT` (backend); `VITE_API_URL` (frontend).
- Deploy: backend on Render/Railway; frontend on Netlify/Vercel (set `VITE_API_URL`).


What we used and why
---------------------
- React + Vite (frontend): fast DX, instant HMR, simple env handling, easy to deploy to Netlify/Vercel.
- pdf.js (`pdfjs-dist`): reliable, mature PDF extraction and rendering in the browser; lets us extract per‑page text client‑side to avoid token cost for OCR and minimize server load.
- Node + Express (backend): minimal surface for upload, indexing and chat; easy to configure with envs and swap model providers.
- OpenAI/OpenRouter/Ollama (model API abstraction): server uses OpenAI‑compatible APIs, so we can switch between cloud (OpenAI), meta‑router (OpenRouter) or fully local (Ollama) only via env variables.
- Embeddings: `text-embedding-3-small` (or `nomic-embed-text` in Ollama) for low cost and good retrieval quality.
- Chat model: `gpt-4o-mini` (or `llama3.1:8b` locally) to balance speed, cost and quality.
- Styling: lightweight inline styles for this take‑home; keeps code size small. Easy to replace with Tailwind/Mantine later.

Architecture overview
---------------------
1. Upload: PDF is uploaded to the backend (streamed to disk) and simultaneously loaded in the browser for text extraction.
2. Extraction: The browser uses pdf.js to extract per‑page text. This avoids tokenizing entire PDFs server‑side and keeps token usage minimal.
3. Indexing: Client sends `{pageNumber, text}` per page; server chunks long pages (~1.5k chars), embeds chunks, averages to a single page embedding, and stores in memory (can be swapped for pgvector/Qdrant).
4. Retrieval: For each question, server embeds the query, does cosine similarity against page embeddings, selects top‑k (k=4) pages.
5. Generation: Server prompts the LLM with only the selected page snippets and returns citations (page numbers) alongside the answer.
6. Viewer: The PDF viewer renders canvases; clicking a citation button scrolls to that page.

Token‑ and cost‑efficiency
--------------------------
- Client‑side text extraction (no OCR tokens).
- Small embedding model; chunking with averaging ensures robust retrieval without excessive tokens.
- Top‑k retrieval limits context size passed to the chat model.
- Concise prompt + low temperature for short, focused outputs.

Limitations and future work
---------------------------
- Persistence: replace in‑memory store with pgvector/Qdrant (adds multi‑doc support, persistence, metadata filters).
- Complex PDFs: integrate LlamaParse/LlamaIndex for robust table/figure extraction to markdown.
- Security: add file type/size validation and optional auth.
- UI polish: move to a design system (Mantine/Tailwind) and add dark mode.

