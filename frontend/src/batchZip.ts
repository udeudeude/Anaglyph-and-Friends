// Images are already compressed. A stored ZIP avoids recompressing them and
// reads each Blob in chunks, without expanding every photo into memory at once.
export type ZipEntry = { name: string; blob: Blob };
const crcTable = new Uint32Array(256).map((_, index) => {
    let value = index;
    for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
});

async function crc32(blob: Blob) {
    let crc = 0xffffffff;
    for (let offset = 0; offset < blob.size; offset += 1024 * 1024) {
        const bytes = new Uint8Array(await blob.slice(offset, offset + 1024 * 1024).arrayBuffer());
        for (const value of bytes) crc = crcTable[(crc ^ value) & 255] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

export async function createBatchZip(entries: ZipEntry[], progress?: (done: number) => void) {
    if (entries.length >= 65535) throw new Error('This ZIP has too many files. Download the batch in smaller groups.');
    const parts: BlobPart[] = [], central: BlobPart[] = [];
    let offset = 0, centralSize = 0;
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >>> 1);
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (let i = 0; i < entries.length; i++) {
        const { name, blob } = entries[i];
        const encodedName = new TextEncoder().encode(name);
        const size = blob.size;
        if (encodedName.length > 65535 || offset + size + centralSize + encodedName.length * 2 + 100 >= 0xffffffff) {
            throw new Error('This ZIP would exceed 4 GB. Download individual results or process smaller folders.');
        }
        const crc = await crc32(blob);
        const local = new Uint8Array(30 + encodedName.length), view = new DataView(local.buffer);
        view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true);
        view.setUint16(6, 0x800, true); // UTF-8 filenames
        view.setUint16(10, time, true); view.setUint16(12, date, true);
        view.setUint32(14, crc, true); view.setUint32(18, size, true); view.setUint32(22, size, true);
        view.setUint16(26, encodedName.length, true); local.set(encodedName, 30);
        const record = new Uint8Array(46 + encodedName.length), directory = new DataView(record.buffer);
        directory.setUint32(0, 0x02014b50, true); directory.setUint16(4, 20, true); directory.setUint16(6, 20, true);
        directory.setUint16(8, 0x800, true); directory.setUint16(12, time, true); directory.setUint16(14, date, true);
        directory.setUint32(16, crc, true); directory.setUint32(20, size, true); directory.setUint32(24, size, true);
        directory.setUint16(28, encodedName.length, true); directory.setUint32(42, offset, true);
        record.set(encodedName, 46);
        parts.push(local, blob); central.push(record);
        offset += local.length + size; centralSize += record.length;
        progress?.(i + 1);
    }
    const end = new Uint8Array(22), view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true); view.setUint16(8, entries.length, true); view.setUint16(10, entries.length, true);
    view.setUint32(12, centralSize, true); view.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
