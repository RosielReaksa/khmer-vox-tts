import "server-only";

function stripLeadingId3v2(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 10) return bytes;
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return bytes;

  const size =
    ((bytes[6] & 0x7f) << 21) |
    ((bytes[7] & 0x7f) << 14) |
    ((bytes[8] & 0x7f) << 7) |
    (bytes[9] & 0x7f);
  const totalTagSize = 10 + size;
  return totalTagSize < bytes.length ? bytes.subarray(totalTagSize) : new Uint8Array();
}

function stripTrailingId3v1(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 128) return bytes;
  const start = bytes.length - 128;
  if (bytes[start] === 0x54 && bytes[start + 1] === 0x41 && bytes[start + 2] === 0x47) {
    return bytes.subarray(0, start);
  }
  return bytes;
}

export async function concatMp3Buffers(buffers: Uint8Array[]): Promise<Uint8Array> {
  if (buffers.length === 0) return new Uint8Array();
  if (buffers.length === 1) return buffers[0];

  const parts = buffers
    .map((buffer, index) => {
      let part = buffer;
      if (index > 0) part = stripLeadingId3v2(part);
      if (index < buffers.length - 1) part = stripTrailingId3v1(part);
      return part;
    })
    .filter((part) => part.length > 0);

  return new Uint8Array(Buffer.concat(parts.map((part) => Buffer.from(part))));
}
