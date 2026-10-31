/**
 * DOCX → PDF conversion via ConvertAPI.
 *
 * Ported from the doc-tools service (app/api/poa/generate/route.ts), which was
 * the only path that ever produced PDFs. The local engine assembles DOCX only,
 * so this is what turns those into the PDFs clients download.
 *
 * Conversion is best-effort: if the key is missing or the call fails the caller
 * keeps the DOCX rather than losing the document, exactly as doc-tools did.
 * `fetch` is the Node 18+ global (Vercel runs Node 22), so there is nothing to
 * install.
 *
 * This lives in its own module (rather than inside localDocgen) because the
 * conversion is now driven one document at a time by the route, so it can
 * report per-document progress while a plan's dozen-plus documents are
 * rendered.
 */

const CONVERTAPI_SECRET = process.env.CONVERTAPI_SECRET || '';

/**
 * The name a converted document should carry: the DOCX name with a .pdf
 * extension. Non-DOCX names (e.g. a doctools .pdf, or a .txt) are returned
 * unchanged so this is safe to call on any document.
 */
function pdfName(name) {
  return typeof name === 'string' ? name.replace(/\.docx$/i, '.pdf') : name;
}

/**
 * @param {Buffer} docxBuffer
 * @param {string} filename
 * @returns {Promise<Buffer|null>} the PDF, or null if conversion was skipped or
 *   failed (caller should fall back to the DOCX).
 */
async function convertDocxToPdf(docxBuffer, filename) {
  if (!CONVERTAPI_SECRET) {
    console.log('pdfConvert SKIP: no CONVERTAPI_SECRET configured');
    return null;
  }
  try {
    const response = await fetch('https://v2.convertapi.com/convert/docx/to/pdf', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CONVERTAPI_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Parameters: [
          { Name: 'File', FileValue: { Name: filename, Data: docxBuffer.toString('base64') } },
        ],
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      console.error(`pdfConvert FAIL: ${String(filename).substring(0, 40)} - ${err.substring(0, 120)}`);
      return null;
    }
    const result = await response.json();
    if (result.Files?.[0]?.FileData) {
      return Buffer.from(result.Files[0].FileData, 'base64');
    }
    return null;
  } catch (e) {
    console.error(`pdfConvert ERR: ${e}`);
    return null;
  }
}

module.exports = { convertDocxToPdf, pdfName };
