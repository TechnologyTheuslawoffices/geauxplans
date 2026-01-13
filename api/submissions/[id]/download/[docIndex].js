import { supabaseAdmin } from '../../../lib/supabase.js';
import { requireAuth, handleCors } from '../../../lib/auth.js';

const CONVERTAPI_SECRET = process.env.CONVERTAPI_SECRET || 'K8fKJ4TsD5q39R31xw3Ja9ktOiKW28M1';

async function convertDocxToPdf(docxUrl) {
  console.log('ConvertAPI: Converting from URL:', docxUrl);

  const response = await fetch('https://v2.convertapi.com/convert/docx/to/pdf?Secret=' + CONVERTAPI_SECRET, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Parameters: [
        { Name: 'File', FileValue: { Url: docxUrl } },
        { Name: 'StoreFile', Value: true }
      ]
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('ConvertAPI error:', response.status, text);
    throw new Error(`ConvertAPI failed: ${response.status}`);
  }

  const result = await response.json();

  if (result.Files && result.Files.length > 0) {
    const file = result.Files[0];
    if (file.FileData) {
      return Buffer.from(file.FileData, 'base64');
    }
    if (file.Url) {
      const pdfResponse = await fetch(file.Url);
      if (pdfResponse.ok) {
        return Buffer.from(await pdfResponse.arrayBuffer());
      }
    }
  }

  throw new Error('ConvertAPI returned no files');
}

export default async function handler(req, res) {
  console.log('Download endpoint called:', req.method, req.query);
  console.log('Auth header:', req.headers.authorization ? 'present' : 'missing');

  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) {
    console.log('Auth failed - no user returned');
    return;
  }
  console.log('Auth succeeded, user:', user.id);

  const { id, docIndex } = req.query;
  console.log('Fetching submission:', id, 'doc:', docIndex);

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

    const documents = submission.knackly_documents || [];
    console.log('Documents in submission:', JSON.stringify(documents, null, 2));
    const docIdx = parseInt(docIndex);

    if (docIdx < 0 || docIdx >= documents.length) {
      console.log('Document index out of range:', docIdx, 'total docs:', documents.length);
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    const doc = documents[docIdx];
    console.log('Selected document:', JSON.stringify(doc, null, 2));

    // If we have a stored PDF URL (pre-converted), redirect to it
    if (doc.storedUrl) {
      console.log(`Redirecting to stored PDF: ${doc.storedUrl}`);
      return res.redirect(302, doc.storedUrl);
    }

    // Fallback: get from Knackly URL and convert if needed
    const downloadUrl = doc.publicUrl || doc.url;
    if (!downloadUrl) {
      return res.status(400).json({ success: false, error: 'No download URL available' });
    }

    const originalName = doc.originalName || doc.name || 'document';
    const isDocx = originalName.toLowerCase().endsWith('.docx');

    console.log(`Fetching document from: ${downloadUrl}, isDocx: ${isDocx}`);

    // If it's a DOCX, convert to PDF on-the-fly
    if (isDocx) {
      try {
        console.log('Converting DOCX to PDF on download...');
        const pdfBuffer = await convertDocxToPdf(downloadUrl);
        const pdfName = originalName.replace(/\.docx$/i, '.pdf');
        const safePdfName = pdfName.replace(/[^\x20-\x7E]/g, '');

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${safePdfName}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        return res.send(pdfBuffer);
      } catch (convError) {
        console.error('On-the-fly conversion failed:', convError.message);
        // Fall through to serve original document
      }
    }

    // Serve original document
    const docResponse = await fetch(downloadUrl);
    if (!docResponse.ok) {
      return res.status(502).json({ success: false, error: 'Failed to fetch document' });
    }

    const docBuffer = Buffer.from(await docResponse.arrayBuffer());
    const filename = doc.name || 'document';
    const safeFilename = filename.replace(/[^\x20-\x7E]/g, '');

    const contentType = filename.toLowerCase().endsWith('.pdf')
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Length', docBuffer.length);
    res.send(docBuffer);

  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({ success: false, error: 'Failed to download document' });
  }
}
