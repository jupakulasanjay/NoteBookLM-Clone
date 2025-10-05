import React, { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, PDFDocumentProxy } from 'pdfjs-dist'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl as string

export type PdfViewerHandle = {
  scrollToPage: (pageNumber: number) => void
}

export default React.forwardRef<PdfViewerHandle, { fileUrl: string | null }>(function PdfViewer({ fileUrl }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)

  useImperativeHandle(ref, () => ({
    scrollToPage: (pageNumber: number) => {
      const el = containerRef.current?.querySelector(`[data-pdf-page="${pageNumber}"]`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }))

  useEffect(() => {
    let mounted = true
    async function load() {
      if (!fileUrl) { setPdf(null); return }
      const loadingTask = getDocument(fileUrl)
      const doc = await loadingTask.promise
      if (!mounted) return
      setPdf(doc)
    }
    load()
    return () => { mounted = false }
  }, [fileUrl])

  useEffect(() => {
    if (!pdf || !containerRef.current) return
    const container = containerRef.current
    container.innerHTML = ''
    ;(async () => {
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const viewport = page.getViewport({ scale: 1.2 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        canvas.setAttribute('data-pdf-page', String(i))
        canvas.style.display = 'block'
        canvas.style.margin = '24px auto'
        canvas.style.boxShadow = '0 0 0 1px #e5e5e5'
        const ctx = canvas.getContext('2d')!
        await page.render({ canvasContext: ctx, viewport }).promise
        container.appendChild(canvas)
      }
    })()
  }, [pdf])

  return (
    <div ref={containerRef} style={{ overflow: 'auto', height: '100%', background: '#fff', borderLeft: '1px solid #eee' }} />
  )
})


