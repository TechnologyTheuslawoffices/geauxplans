import { supabaseAdmin } from '../../../lib/supabase.js';
import { requireAuth, handleCors } from '../../../lib/auth.js';
import { getDocuments } from '../../../lib/knackly.js';

const CONVERTAPI_SECRET = process.env.CONVERTAPI_SECRET || 'secret_RfaXEH6hpm9xPkKL';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { id, docIndex } = req.query;

  try {
    const { data: submission, error } = await supabaseAdmin
      .from('poa_submissions')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    if (!submission.knackly_record_id) {
      return res.status(400).json({ success: false, error: 'No Knackly record' });
    }

    // Get fresh document URLs from Knackly (S3 URLs expire)
    console.log(`Fetching fresh document URLs from Knackly for record: ${submission.knackly_record_id}`);
    const response = await getDocuments(submission.knackly_record_id, submission.form_type);

    if (!response || response.status !== 'Ok' || !response.files || response.files.length === 0) {
      return res.status(400).json({ success: false, error: 'Documents not ready' });
    }

    const docIdx = parseInt(docIndex);
    if (docIdx < 0 || docIdx >= response.files.length) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    const doc = response.files[docIdx];
    const downloadUrl = doc.publicUrl;

    if (!downloadUrl) {
      return res.status(400).json({ success: false, error: 'No download URL available' });
    }

    console.log(`Downloading document from S3: ${downloadUrl}`);

    // Fetch document from S3
    const docResponse = await fetch(downloadUrl);
    if (!docResponse.ok) {
      throw new Error(`Failed to fetch document: ${docResponse.status}`);
    }

    const docBuffer = Buffer.from(await docResponse.arrayBuffer());
    const contentType = docResponse.headers.get('content-type') || 'application/octet-stream';

    // Determine filename
    let filename = doc.name || 'document';
    filename = filename.replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim();
    if (!filename) filename = 'document';

    // Sanitize filename for Content-Disposition header
    let safeFilename = filename
      .replace(/–/g, '-')
      .replace(/—/g, '-')
      .replace(/'/g, "'")
      .replace(/'/g, "'")
      .replace(/"/g, '"')
      .replace(/"/g, '"')
      .replace(/[^\x20-\x7E]/g, '');

    // Convert DOCX to PDF
    let finalBuffer = docBuffer;
    let finalContentType = contentType;

    if (filename.endsWith('.docx')) {
      try {
        console.log('Converting DOCX to PDF...');
        finalBuffer = await convertDocxToPdf(docBuffer);
        finalContentType = 'application/pdf';
        safeFilename = safeFilename.replace(/\.docx$/i, '.pdf');
        console.log('Conversion successful, serving PDF');
      } catch (convError) {
        console.error('PDF conversion failed, serving original DOCX:', convError.message);
        finalContentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }
    } else if (filename.endsWith('.pdf')) {
      finalContentType = 'application/pdf';
    }

    // Set headers for download
    res.setHeader('Content-Type', finalContentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Length', finalBuffer.length);

    res.send(finalBuffer);
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({ success: false, error: 'Failed to download document' });
  }
}

async function convertDocxToPdf(docxBuffer) {
  const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);

  const header = `--${boundary}\r\nContent-Disposition: form-data; name="File"; filename="document.docx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;

  const bodyBuffer = Buffer.concat([
    Buffer.from(header),
    docxBuffer,
    Buffer.from(footer)
  ]);

  console.log('ConvertAPI: Converting DOCX to PDF...');

  const response = await fetch('https://v2.convertapi.com/convert/docx/to/pdf', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONVERTAPI_SECRET}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: bodyBuffer,
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('ConvertAPI error:', response.status, text);
    throw new Error(`ConvertAPI failed: ${response.status}`);
  }

  const result = await response.json();
  console.log('ConvertAPI response received');

  if (result.Files && result.Files.length > 0) {
    const file = result.Files[0];

    // Check if we have FileData (base64 encoded PDF)
    if (file.FileData) {
      console.log('ConvertAPI: Using base64 FileData');
      return Buffer.from(file.FileData, 'base64');
    }

    // Otherwise use URL to download
    const pdfUrl = file.Url || file.url;
    if (!pdfUrl) {
      throw new Error('No PDF URL in response');
    }

    console.log('ConvertAPI: PDF ready, downloading from URL');
    const pdfResponse = await fetch(pdfUrl);
    return Buffer.from(await pdfResponse.arrayBuffer());
  }

  throw new Error('No PDF file in response');
}
