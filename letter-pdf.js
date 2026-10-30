/* A single A4 PDF page containing the finished letter image. No network or library required. */
(function (root) {
  function fromJPEG(jpeg, width, height) {
    if (!(jpeg instanceof Uint8Array) || !jpeg.length || width < 1 || height < 1) {
      throw new Error('Не удалось подготовить изображение письма.');
    }

    const encoder = new TextEncoder();
    const chunks = [];
    const offsets = [0];
    let length = 0;
    const add = value => {
      const bytes = typeof value === 'string' ? encoder.encode(value) : value;
      chunks.push(bytes);
      length += bytes.length;
    };
    const object = (number, body) => {
      offsets[number] = length;
      add(`${number} 0 obj\n${body}\nendobj\n`);
    };

    add('%PDF-1.4\n%MARKOV\n');
    object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    object(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.276 841.89] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');

    offsets[4] = length;
    add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    add(jpeg);
    add('\nendstream\nendobj\n');

    const page = 'q 595.276 0 0 841.89 0 0 cm /Im0 Do Q\n';
    offsets[5] = length;
    add(`5 0 obj\n<< /Length ${encoder.encode(page).length} >>\nstream\n${page}endstream\nendobj\n`);

    const xref = length;
    add('xref\n0 6\n0000000000 65535 f \n');
    for (let i = 1; i <= 5; i++) add(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
    add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

    const result = new Uint8Array(length);
    let position = 0;
    for (const chunk of chunks) {
      result.set(chunk, position);
      position += chunk.length;
    }
    return result;
  }

  root.MarkovLetterPDF = { fromJPEG };
  if (typeof module !== 'undefined') module.exports = { fromJPEG };
})(typeof window !== 'undefined' ? window : globalThis);
