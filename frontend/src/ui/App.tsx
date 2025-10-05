import React, { useMemo, useRef, useState } from "react";
import {
  IconUpload,
  IconUser,
  IconRobot,
  IconX,
  IconFileDescription,
  IconSend,
} from "@tabler/icons-react";
import axios from "axios";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
// @ts-ignore
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import PdfViewer, { PdfViewerHandle } from "./PdfViewer";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl as string;

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export default function App() {
  const [step, setStep] = useState<"upload" | "chat">("upload");
  const [docId, setDocId] = useState<string | null>(null);
  const [pdfFileUrl, setPdfFileUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<
    {
      role: "user" | "assistant";
      text: string;
      citations?: { pageNumber: number }[];
    }[]
  >([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [showReady, setShowReady] = useState<boolean>(false);
  const viewerRef = useRef<PdfViewerHandle>(null);

  async function handleUpload(file: File) {
    setStep("upload");
    setStatus("Uploading PDF");
    setProgress(5);
    const form = new FormData();
    form.append("file", file);
    const resp = await axios.post(`${API_URL}/api/upload`, form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (e.total)
          setProgress(Math.min(70, Math.round((e.loaded / e.total) * 60) + 5));
      },
    });
    const { docId } = resp.data;
    setDocId(docId);
    const url = URL.createObjectURL(file);
    setPdfFileUrl(url);
    try {
      setStatus("Extracting text");
      setProgress(75);
      const extracted = await extractPages(file);
      setStatus("Indexing");
      setProgress(90);
      await axios.post(
        `${API_URL}/api/index`,
        { docId, pages: extracted },
        { timeout: 180000 }
      );
      setStatus("Your document is ready!");
      setProgress(100);
      setStep("chat");
      setShowReady(true);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || "Indexing failed";
      setStatus(`Indexing failed: ${msg}`);
      setProgress(0);
    }
  }

  async function extractPages(
    file: File
  ): Promise<{ pageNumber: number; text: string }[]> {
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocument({ data }).promise;
    const result: { pageNumber: number; text: string }[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const text = (textContent.items as any[])
        .map((it: any) => ("str" in it ? it.str : ""))
        .join(" ");
      result.push({ pageNumber: i, text });
    }
    return result;
  }

  async function sendQuestion() {
    if (!docId || !question.trim()) return;
    const q = question.trim();
    setShowReady(false);
    setMessages((m) => [...m, { role: "user", text: q }]);
    setQuestion("");
    setLoading(true);
    setMessages((m) => [...m, { role: "assistant", text: "__typing__" }]);
    try {
      const resp = await axios.post(`${API_URL}/api/chat`, {
        docId,
        question: q,
      });
      setMessages((m) => {
        const copy = [...m];
        if (copy.length && copy[copy.length - 1]?.text === "__typing__") {
          copy[copy.length - 1] = {
            role: "assistant",
            text: resp.data.answer,
            citations: resp.data.citations,
          };
        } else {
          copy.push({
            role: "assistant",
            text: resp.data.answer,
            citations: resp.data.citations,
          });
        }
        return copy;
      });
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || "Chat failed";
      setMessages((m) => {
        const copy = [...m];
        if (copy.length && copy[copy.length - 1]?.text === "__typing__") {
          copy[copy.length - 1] = {
            role: "assistant",
            text: `Error: ${msg}. Check backend.`,
          };
        } else {
          copy.push({
            role: "assistant",
            text: `Error: ${msg}. Check backend.`,
          });
        }
        return copy;
      });
    }
    setLoading(false);
  }

  function gotoPage(pn: number) {
    viewerRef.current?.scrollToPage(pn);
  }

  const viewer = useMemo(
    () => <PdfViewer ref={viewerRef} fileUrl={pdfFileUrl} />,
    [pdfFileUrl]
  );

  return (
    <div style={{ width: "100%", height: "100%" }}>
      {step === "upload" && (
        <div style={{ height: "100%", display: "grid", placeItems: "center" }}>
          {progress > 0 ? (
            <ProgressScreen label={status} value={progress} />
          ) : (
            <UploadCard
              onFile={handleUpload}
              status={status || "Upload PDF to start chatting"}
            />
          )}
        </div>
      )}
      {step === "chat" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "420px 1fr",
            width: "100%",
            height: "100%",
          }}
        >
          <div
            style={{
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2 style={{ margin: 0 }}>NotebookLM Clone</h2>
              <button
                onClick={() => {
                  setStep("upload");
                  setMessages([]);
                  setProgress(0);
                  setStatus("Upload PDF to start chatting");
                }}
                style={{
                  border: "1px solid #ddd",
                  background: "#fff",
                  borderRadius: 8,
                  padding: "6px 10px",
                  cursor: "pointer",
                }}
              >
                New PDF
              </button>
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  position: "relative",
                  flex: 1,
                  overflow: "auto",
                  background: "#fff",
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                {showReady && (
                  <div style={{ position: "sticky", top: 0, zIndex: 5 }}>
                    <ReadyToast onClose={() => setShowReady(false)} />
                  </div>
                )}
                {messages.map((m, idx) => {
                  const isUser = m.role === "user";
                  return (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        marginBottom: 14,
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          background: isUser ? "#e5e7eb" : "#ede9fe",
                          color: isUser ? "#111827" : "#7c3aed",
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        {isUser ? (
                          <IconUser size={16} />
                        ) : (
                          <IconRobot size={16} />
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        {isUser ? (
                          <div style={{ fontWeight: 600, color: "#111827" }}>
                            {m.text}
                          </div>
                        ) : (
                          <div
                            style={{
                              background: "#fafafe",
                              border: "1px solid #eee",
                              borderRadius: 10,
                              padding: "12px 14px",
                            }}
                          >
                            {m.text === "__typing__" ? (
                              <TypingDots />
                            ) : (
                              <div
                                style={{
                                  whiteSpace: "pre-wrap",
                                  lineHeight: 1.6,
                                }}
                              >
                                {m.text}
                              </div>
                            )}
                            {m.citations &&
                              m.citations.length > 0 &&
                              m.text !== "__typing__" && (
                                <div
                                  style={{
                                    marginTop: 10,
                                    display: "flex",
                                    gap: 8,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  {m.citations.map((c, i) => (
                                    <button
                                      key={i}
                                      onClick={() => gotoPage(c.pageNumber)}
                                      style={{
                                        padding: "6px 10px",
                                        borderRadius: 999,
                                        border: "1px solid #a855f7",
                                        background: "#f3e8ff",
                                        color: "#7c3aed",
                                        cursor: "pointer",
                                      }}
                                    >
                                      Page {c.pageNumber}
                                    </button>
                                  ))}
                                </div>
                              )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendQuestion();
                  }}
                  placeholder="Ask about the document..."
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #ddd",
                  }}
                />
                <button
                  onClick={sendQuestion}
                  aria-label="Send"
                  style={{
                    width: 44,
                    height: 44,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 12,
                    border: "none",
                    background: "#7c3aed",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                  disabled={loading}
                >
                  <IconSend size={20} />
                </button>
              </div>
            </div>
          </div>
          {viewer}
        </div>
      )}
    </div>
  );
}

function UploadCard({
  onFile,
  status,
}: {
  onFile: (f: File) => void;
  status: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type === "application/pdf") onFile(f);
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        background: "#fff",
        border: dragOver ? "2px solid #7c3aed" : "1px dashed #d1d5db",
        borderRadius: 16,
        padding: 28,
        textAlign: "center",
        cursor: "pointer",
        boxShadow: "0 4px 16px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          margin: "0 auto 12px",
          borderRadius: "50%",
          background: "#f3e8ff",
          display: "grid",
          placeItems: "center",
          color: "#7c3aed",
        }}
      >
        <IconUpload size={28} stroke={2} />
      </div>
      <div style={{ fontWeight: 700, color: "#111827" }}>
        Upload PDF to start chatting
      </div>
      <div style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>
        Click or drag and drop your file here
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        onChange={onChange}
        style={{ display: "none" }}
      />
      <div style={{ marginTop: 16, fontSize: 12, color: "#7c3aed" }}>
        {status}
      </div>
    </div>
  );
}

function ProgressScreen({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ width: 720 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              border: "4px solid #e9d5ff",
              borderTopColor: "#7c3aed",
              animation: "spin 1s linear infinite",
            }}
          />
          <div style={{ fontSize: 24, fontWeight: 700, color: "#7c3aed" }}>
            {label}
          </div>
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "#7c3aed" }}>
          {Math.min(100, Math.max(0, Math.round(value)))}%
        </div>
      </div>
      <div style={{ height: 10, background: "#e9d5ff", borderRadius: 999 }}>
        <div
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            height: "100%",
            background: "#7c3aed",
            borderRadius: 999,
            transition: "width 200ms ease",
          }}
        />
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg);} }`}</style>
    </div>
  );
}

function TypingDots() {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            background: "#a78bfa",
            borderRadius: "50%",
            display: "inline-block",
            animation: `pulse 1s ${i * 0.15}s infinite ease-in-out`,
          }}
        />
      ))}
      <style>{`@keyframes pulse { 0%, 80%, 100% { opacity: .2; transform: translateY(0);} 40% { opacity: 1; transform: translateY(-2px);} }`}</style>
    </div>
  );
}

function ReadyToast({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "flex-start",
        padding: 2,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          background: "#f3e8ff",
          borderRadius: 16,
          padding: 12,
          boxShadow: "0 8px 24px rgba(124,58,237,0.10)",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          aria-label="close"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            border: "none",
            background: "transparent",
            color: "#7c3aed",
            cursor: "pointer",
          }}
        >
          <IconX size={18} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "#ede9fe",
              color: "#7c3aed",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <IconFileDescription size={18} />
          </div>
          <div
            style={{
              fontWeight: 900,
              color: "#7c3aed",
              fontSize: 20,
              lineHeight: 1.2,
            }}
          >
            Your document is ready!
          </div>
        </div>
        <div style={{ marginTop: 8, color: "#374151", fontSize: 14 }}>
          You can now ask questions about your document. For example:
          <ul
            style={{
              margin: "10px 0 0 0",
              paddingLeft: 18,
              color: "#4b5563",
              listStyleType: "disc",
            }}
          >
            <li>"What is the main topic of this document?"</li>
            <li>"Can you summarize the key points?"</li>
            <li>"What are the conclusions or recommendations?"</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
