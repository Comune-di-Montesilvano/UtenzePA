// Busta CAdES (.p7m) delle fatture firmate: serve solo il contenuto, la firma
// l'ha già verificata lo SDI. Lettore ASN.1 BER minimo, senza dipendenze:
// ContentInfo → [0] SignedData → encapContentInfo → [0] eContent (OCTET STRING,
// anche costruito a pezzi, con lunghezze definite o indefinite).

interface Node {
  tag: number;
  constructed: boolean;
  start: number; // inizio del contenuto
  end: number; // fine del contenuto (esclusi gli eventuali 00 00 finali)
  next: number; // primo byte dopo il nodo
}

const SEQUENCE = 0x10;
const OCTET_STRING = 0x04;
const CONTEXT_0 = 0xa0;

function fail(): never {
  throw new Error('p7m illeggibile');
}

function readNode(buf: Buffer, offset: number): Node {
  if (offset + 2 > buf.length) fail();
  const first = buf[offset];
  if ((first & 0x1f) === 0x1f) fail(); // tag multi-byte: non usati nelle buste CMS
  let pos = offset + 1;
  const lenByte = buf[pos++];
  const constructed = (first & 0x20) !== 0;
  if (lenByte === 0x80) {
    if (!constructed) fail();
    const start = pos;
    let cur = start;
    while (!(buf[cur] === 0 && buf[cur + 1] === 0)) {
      cur = readNode(buf, cur).next;
      if (cur >= buf.length) fail();
    }
    return { tag: first, constructed, start, end: cur, next: cur + 2 };
  }
  let len = lenByte;
  if (lenByte & 0x80) {
    const n = lenByte & 0x7f;
    if (n > 4) fail();
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[pos++];
  }
  if (pos + len > buf.length) fail();
  return { tag: first, constructed, start: pos, end: pos + len, next: pos + len };
}

function children(buf: Buffer, node: Node): Node[] {
  const out: Node[] = [];
  for (let cur = node.start; cur < node.end;) {
    const child = readNode(buf, cur);
    out.push(child);
    cur = child.next;
  }
  return out;
}

function octets(buf: Buffer, node: Node): Buffer {
  if ((node.tag & 0x1f) !== OCTET_STRING) fail();
  if (!node.constructed) return buf.subarray(node.start, node.end);
  return Buffer.concat(children(buf, node).map((c) => octets(buf, c)));
}

function isSequence(node: Node | undefined): node is Node {
  return !!node && node.constructed && (node.tag & 0x1f) === SEQUENCE;
}

function toDer(data: Buffer): Buffer {
  if (data[0] === 0x30) return data;
  const decoded = Buffer.from(data.toString('latin1').replace(/\s+/g, ''), 'base64');
  if (decoded[0] !== 0x30) fail();
  return decoded;
}

export function extractP7m(data: Buffer): Buffer {
  const buf = toDer(data);
  const contentInfo = readNode(buf, 0);
  if (!isSequence(contentInfo)) fail();
  const explicit = children(buf, contentInfo)[1];
  if (!explicit || explicit.tag !== CONTEXT_0) fail();
  const signedData = children(buf, explicit)[0];
  if (!isSequence(signedData)) fail();
  const encap = children(buf, signedData)[2];
  if (!isSequence(encap)) fail();
  const eContent = children(buf, encap)[1];
  if (!eContent || eContent.tag !== CONTEXT_0) fail();
  const content = children(buf, eContent)[0];
  if (!content) fail();
  return octets(buf, content);
}
