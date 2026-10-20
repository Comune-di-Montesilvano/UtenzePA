import { pathToFileURL } from 'url';
import { extractPdf } from './sdi-files';

// Testo del PDF allegato alla fattura, per le regole «parola» dei pattern
// (consumi e matricola che alcuni fornitori scrivono solo nel PDF).

interface TextItem {
  str?: string;
  hasEOL?: boolean;
}

interface PdfJs {
  getDocument(src: {
    data: Uint8Array;
    isEvalSupported: boolean;
    useSystemFonts: boolean;
    verbosity: number;
  }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: TextItem[] }> }>;
    }>;
    destroy(): Promise<void>;
  };
}

// pdfjs-dist è solo ESM: import dinamico vero (in commonjs TypeScript lo
// trasformerebbe in require), col percorso risolto da qui e non dalla cartella
// di lavoro del processo. Caricato solo quando un pattern legge il PDF.
const importEsm = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<PdfJs>;
let pdfjs: Promise<PdfJs> | null = null;

// A capo dove pdfjs segnala fine riga, spazio tra i pezzi della stessa riga. I
// numeri spezzati dall'impaginazione («4.078 , 000») si ricompongono.
export function joinTextItems(pages: TextItem[][]): string {
  return pages
    .map((items) =>
      items.map((i) => (i.str === undefined ? '' : i.str + (i.hasEOL ? '\n' : ' '))).join(''),
    )
    .join('\n')
    .replace(/(\d) ?([.,]) ?(?=\d)/g, '$1$2');
}

/** Testo del PDF allegato all'XML; null se non c'è o non si legge. */
export async function pdfText(xml: Buffer): Promise<string | null> {
  const pdf = extractPdf(xml);
  if (!pdf) return null;
  pdfjs ??= importEsm(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
  const task = (await pdfjs).getDocument({
    data: new Uint8Array(pdf.data),
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
  });
  try {
    const doc = await task.promise;
    const pages: TextItem[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      pages.push((await (await doc.getPage(n)).getTextContent()).items);
    }
    return joinTextItems(pages);
  } catch {
    return null;
  } finally {
    await task.destroy();
  }
}
