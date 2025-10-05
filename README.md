NotebookLM Clone
================

A minimal Google NotebookLM-like app: upload a PDF, index per-page text, chat with RAG, and click citations to jump to pages.

Setup
-----

Backend
```
cd backend
echo "PORT=4000" > .env
echo "OPENAI_API_KEY=sk-..." >> .env
npm install
npm run dev
```

Frontend
```
cd frontend
npm install
VITE_API_URL=http://localhost:4000 npm run dev
```

Usage
-----
- Upload a PDF. The app extracts per-page text client-side and indexes embeddings on the server.
- Ask questions in the chat. Answers include citation buttons by page; click to scroll the viewer to that page.

Notes
-----
- In-memory vector store for demo; replace with a real vector DB for production.

