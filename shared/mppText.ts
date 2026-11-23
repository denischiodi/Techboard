/** MPP lookup references are binary values, not UTF-16 display strings. */
export function readMppText(raw: Uint8Array): string | null {
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  if (
    raw.length >= 6 &&
    view.getUint16(0, true) === 0x0401 &&
    view.getUint32(2, true) === 0xffffffff
  )
    return null;
  let end = 0;
  while (end + 1 < raw.length && view.getUint16(end, true) !== 0) end += 2;
  try {
    // Fatal decoding rejects isolated surrogates, which PostgreSQL JSONB rejects too.
    return (
      new TextDecoder("utf-16le", { fatal: true })
        .decode(raw.subarray(0, end))
        .trim() || null
    );
  } catch {
    return null;
  }
}
