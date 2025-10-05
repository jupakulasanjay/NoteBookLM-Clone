import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { nanoid } from 'nanoid';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const uploadDir = join(process.cwd(), 'storage', 'uploads');
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${nanoid(12)}-${file.originalname}`)
});
const upload = multer({ storage });

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const id = nanoid(10);
  res.json({
    docId: id,
    filename: req.file.originalname,
    path: req.file.path
  });
});

const memory = {
  pagesByDoc: new Map(),
};

const BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const MODEL_EMBED = process.env.MODEL_EMBED || 'text-embedding-3-small';
const MODEL_CHAT = process.env.MODEL_CHAT || 'gpt-4o-mini';

async function embedTexts(texts) {
  const OpenAI = (await import('openai')).default;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');
  const client = new OpenAI({ apiKey, baseURL: BASE_URL, project: process.env.OPENAI_PROJECT });
  const resp = await client.embeddings.create({ model: MODEL_EMBED, input: texts });
  return resp.data.map(d => d.embedding);
}

function chunkText(text, maxLen = 1500) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks;
}

function averageVectors(vectors) {
  if (vectors.length === 1) return vectors[0];
  const sum = new Array(vectors[0].length).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < v.length; i++) sum[i] += v[i];
  }
  for (let i = 0; i < sum.length; i++) sum[i] /= vectors.length;
  return sum;
}

app.post('/api/index', async (req, res) => {
  const { docId, pages } = req.body; // pages: [{pageNumber, text}]
  if (!docId || !Array.isArray(pages) || pages.length === 0) {
    return res.status(400).json({ error: 'docId and pages required' });
  }

  try {
    const rows = [];
    for (const p of pages) {
      const chunks = chunkText(p.text || '', 1500);
      const chunkEmbeds = await embedTexts(chunks.length ? chunks : ['']);
      const pageEmbedding = averageVectors(chunkEmbeds);
      rows.push({ ...p, embedding: pageEmbedding });
    }
    memory.pagesByDoc.set(docId, rows);
    res.json({ ok: true, pages: rows.length });
  } catch (e) {
    console.error('INDEXING_ERROR:', e);
    res.status(500).json({ error: 'embedding_failed', detail: String(e?.message || e) });
  }
});

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function answerWithRag(docId, question) {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: BASE_URL, project: process.env.OPENAI_PROJECT });

  const pages = memory.pagesByDoc.get(docId) || [];
  if (pages.length === 0) return { answer: 'Document not indexed yet.', citations: [] };

  const qEmbedding = (await client.embeddings.create({ model: MODEL_EMBED, input: question })).data[0].embedding;
  const ranked = pages
    .map(p => ({ p, score: cosineSimilarity(qEmbedding, p.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const context = ranked.map(({ p }) => `Page ${p.pageNumber}: ${p.text.slice(0, 1200)}`).join('\n\n');

  const prompt = `You are a helpful assistant answering questions about a PDF. Use the context to answer concisely and include citations as a list of page numbers you used. Keep the answer brief.\n\nContext:\n${context}\n\nQuestion: ${question}`;

  const chat = await client.chat.completions.create({
    model: MODEL_CHAT,
    messages: [
      { role: 'system', content: 'Answer based only on provided context. Cite pages used.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2
  });

  const answer = chat.choices[0]?.message?.content || '';
  const citations = ranked.map(({ p }) => ({ pageNumber: p.pageNumber }));
  return { answer, citations };
}

app.post('/api/chat', async (req, res) => {
  const { docId, question } = req.body;
  if (!docId || !question) return res.status(400).json({ error: 'docId and question required' });
  try {
    const result = await answerWithRag(docId, question);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'chat_failed', detail: String(e) });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});


