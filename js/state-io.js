// ═══════════════════════════════════════════════════════════════════════════
// state-io.js — Round-trip banner state through the generated PNG.
//
// On download we embed a JSON snapshot of the entire form (including the
// uploaded logo + prize image bytes, base64'd) as a PNG iTXt metadata chunk.
// On re-upload we walk the chunks, find the snapshot, and rehydrate every
// input so the user can edit text (licence number, dates, packages, etc.)
// without re-entering anything.
//
// Caveat: iTXt survives byte-for-byte file movement (upload, email, cloud
// storage) but is stripped by tools that re-encode the PNG (Photoshop
// export, Preview save, some social platforms). The user must hand the
// downloaded PNG straight back to the builder for restore to work.
// ═══════════════════════════════════════════════════════════════════════════

export const STATE_KEY = 'RaffleBuilderState';
export const STATE_VERSION = 1;

const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

// ── CRC32 (PNG polynomial, reflected, initial 0xFFFFFFFF) ───────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function hasPngSig(buf) {
  if (buf.length < 8) return false;
  for (let i = 0; i < 8; i++) if (buf[i] !== PNG_SIG[i]) return false;
  return true;
}

// Build a PNG chunk: [len(4)][type(4)][data][crc(4)]. CRC covers type+data.
function makeChunk(type4, dataBytes) {
  const typeBytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) typeBytes[i] = type4.charCodeAt(i);

  const chunk = new Uint8Array(12 + dataBytes.length);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, dataBytes.length, false);
  chunk.set(typeBytes, 4);
  chunk.set(dataBytes, 8);

  const crcInput = new Uint8Array(4 + dataBytes.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(dataBytes, 4);
  dv.setUint32(8 + dataBytes.length, crc32(crcInput), false);
  return chunk;
}

// iTXt data layout:
//   keyword(1-79 Latin-1) 0x00
//   compressionFlag(1 byte, 0 = uncompressed)
//   compressionMethod(1 byte, 0 = deflate — ignored when flag=0)
//   languageTag(Latin-1, may be empty) 0x00
//   translatedKeyword(UTF-8, may be empty) 0x00
//   text(UTF-8)
function buildItxtData(keyword, text) {
  const enc = new TextEncoder();
  const kw = enc.encode(keyword);
  const txt = enc.encode(text);
  const out = new Uint8Array(kw.length + 1 + 1 + 1 + 1 + 1 + txt.length);
  let off = 0;
  out.set(kw, off); off += kw.length;
  out[off++] = 0;   // null terminator after keyword
  out[off++] = 0;   // compression flag = 0 (uncompressed)
  out[off++] = 0;   // compression method
  out[off++] = 0;   // empty language tag + null
  out[off++] = 0;   // empty translated keyword + null
  out.set(txt, off);
  return out;
}

function parseItxtData(data) {
  let i = 0;
  while (i < data.length && data[i] !== 0) i++;
  if (i >= data.length) return null;
  const keyword = new TextDecoder('utf-8').decode(data.subarray(0, i));
  i++;
  if (i + 2 > data.length) return null;
  const cflag = data[i]; /* cmeth ignored when uncompressed */ i += 2;
  while (i < data.length && data[i] !== 0) i++;
  if (i >= data.length) return null;
  i++;
  while (i < data.length && data[i] !== 0) i++;
  if (i >= data.length) return null;
  i++;
  const textBytes = data.subarray(i);
  if (cflag !== 0) return null; // we never write compressed chunks; skip if we see one
  return { keyword, text: new TextDecoder('utf-8').decode(textBytes) };
}

function parseTextData(data) {
  let i = 0;
  while (i < data.length && data[i] !== 0) i++;
  if (i >= data.length) return null;
  // tEXt is Latin-1 per spec, but we round-trip our own payloads which are
  // always UTF-8 JSON — decode both parts as UTF-8 for compatibility with
  // any external tool that mistakenly wrote UTF-8 into a tEXt chunk.
  const keyword = new TextDecoder('utf-8').decode(data.subarray(0, i));
  const text = new TextDecoder('utf-8').decode(data.subarray(i + 1));
  return { keyword, text };
}

// Insert an iTXt chunk with our state JSON right after IHDR. Returns a new
// PNG Blob; the original is untouched.
export async function injectStateIntoPng(pngBlob, stateObj) {
  const buf = new Uint8Array(await pngBlob.arrayBuffer());
  if (!hasPngSig(buf)) throw new Error('injectStateIntoPng: not a PNG');

  const text = JSON.stringify(stateObj);
  const chunk = makeChunk('iTXt', buildItxtData(STATE_KEY, text));

  // IHDR sits at bytes 8..32 (length 4 + type 4 + data 13 + crc 4 = 25).
  const IHDR_END = 8 + 4 + 4 + 13 + 4;

  const out = new Uint8Array(buf.length + chunk.length);
  out.set(buf.subarray(0, IHDR_END), 0);
  out.set(chunk, IHDR_END);
  out.set(buf.subarray(IHDR_END), IHDR_END + chunk.length);
  return new Blob([out], { type: 'image/png' });
}

// Walk the PNG chunks looking for our keyword. Returns the parsed JSON
// object, or null if not found / invalid.
export async function extractStateFromPng(fileOrBlob) {
  const buf = new Uint8Array(await fileOrBlob.arrayBuffer());
  if (!hasPngSig(buf)) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let i = 8;
  while (i + 8 <= buf.length) {
    const len = dv.getUint32(i, false);
    const type = String.fromCharCode(buf[i + 4], buf[i + 5], buf[i + 6], buf[i + 7]);
    const dataStart = i + 8;
    const dataEnd = dataStart + len;
    if (dataEnd + 4 > buf.length) break;

    if (type === 'iTXt' || type === 'tEXt') {
      const data = buf.subarray(dataStart, dataEnd);
      const parsed = type === 'iTXt' ? parseItxtData(data) : parseTextData(data);
      if (parsed && parsed.keyword === STATE_KEY) {
        try { return JSON.parse(parsed.text); } catch { return null; }
      }
    }
    if (type === 'IEND') break;
    i = dataEnd + 4;
  }
  return null;
}

// Convert a File (or Blob with a name/type) to a serialisable record.
// Uses a chunked charCode loop so we don't blow the argument-count limit
// on String.fromCharCode for larger images.
export async function fileToRecord(file) {
  if (!file) return null;
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
  }
  return {
    name: file.name || 'image',
    type: file.type || 'image/png',
    b64: btoa(bin),
  };
}

// Reverse of fileToRecord — builds a File object we can shove back into
// an <input type="file"> via DataTransfer.
export function recordToFile(rec) {
  if (!rec || typeof rec.b64 !== 'string') return null;
  const bin = atob(rec.b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], rec.name || 'image.png', { type: rec.type || 'image/png' });
}
