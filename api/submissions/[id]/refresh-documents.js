import { supabaseAdmin } from '../../lib/supabase.js';
import { requireAuth, handleCors } from '../../lib/auth.js';
import { processSubmission, getDocuments } from '../../lib/knackly.js';

const CONVERTAPI_SECRET = process.env.CONVERTAPI_SECRET || 'K8fKJ4TsD5q39R31xw3Ja9ktOiKW28M1';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { id } = req.query;

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

    // If no Knackly record yet, try to trigger generation
    if (!submission.knackly_record_id) {
      if (submission.submission_status !== 'completed') {
        return res.status(400).json({
          success: false,
          error: 'Submission must be completed before generating documents'
        });
      }

      const triggerResult = await triggerKnacklyGeneration(submission);

      if (!triggerResult.success) {
        return res.json({
          success: true,
          message: triggerResult.error || 'Document generation not available',
          data: {
            id: submission.id,
            knacklyStatus: 'pending',
            knacklyDocuments: null,
          },
        });
      }

      const { data: updatedAfterTrigger } = await supabaseAdmin
        .from('poa_submissions')
        .select('*')
        .eq('id', id)
        .single();

      return res.json({
        success: true,
        message: 'Document generation started',
        data: {
          id: updatedAfterTrigger.id,
          knacklyStatus: updatedAfterTrigger.knackly_status,
          knacklyRecordId: updatedAfterTrigger.knackly_record_id,
          knacklyDocuments: null,
        },
      });
    }

    // Check for document updates and convert to PDF
    console.log('Starting checkAndUpdateDocuments...');
    const result = await checkAndUpdateDocuments(submission, user.id);
    console.log('checkAndUpdateDocuments result:', JSON.stringify(result, null, 2));

    const { data: updated } = await supabaseAdmin
      .from('poa_submissions')
      .select('*')
      .eq('id', id)
      .single();

    res.json({
      success: true,
      message: result.updated ? 'Documents retrieved successfully' : (result.reason || result.error || 'Documents still processing'),
      data: {
        id: updated.id,
        knacklyStatus: updated.knackly_status,
        knacklyDocuments: updated.knackly_documents,
        debug: {
          result: result,
          knacklyRecordId: submission.knackly_record_id,
          currentStatus: submission.knackly_status,
        },
      },
    });
  } catch (error) {
    console.error('Refresh documents error:', error);
    res.status(500).json({ success: false, error: 'Failed to refresh documents' });
  }
}

async function triggerKnacklyGeneration(submission) {
  try {
    const result = await processSubmission(submission);

    if (result.success) {
      await supabaseAdmin
        .from('poa_submissions')
        .update({
          knackly_record_id: result.recordId,
          knackly_status: 'processing',
          knackly_sent_at: new Date().toISOString()
        })
        .eq('id', submission.id);

      console.log(`Knackly: Submission ${submission.id} sent, record ID: ${result.recordId}`);
    }

    return result;
  } catch (error) {
    console.error('Knackly generation error:', error);
    return { success: false, error: error.message };
  }
}

async function checkAndUpdateDocuments(submission, userId) {
  if (!submission.knackly_record_id) {
    return { updated: false, reason: 'No Knackly record ID' };
  }

  if (submission.knackly_status === 'complete' && submission.knackly_documents?.length > 0) {
    // Check if ALL PDFs are already stored
    const hasStoredPdfs = submission.knackly_documents.every(doc => doc.storedUrl);
    if (hasStoredPdfs) {
      return { updated: false, reason: 'Already complete with stored PDFs' };
    }
    // Some documents missing storedUrl - continue to re-process only those
    console.log('Some documents missing storedUrl, will retry conversion for those');
  }

  try {
    console.log(`Knackly: Checking documents for record ${submission.knackly_record_id}`);
    const response = await getDocuments(submission.knackly_record_id, submission.form_type);
    console.log('Knackly response:', JSON.stringify(response, null, 2));

    if (response && response.status === 'Ok' && response.files && response.files.length > 0) {
      console.log(`Knackly: Found ${response.files.length} documents, converting to PDF...`);

      // First, ensure the bucket exists (create if not)
      await ensureBucketExists();

      // Convert each document to PDF and store in Supabase
      const processedDocuments = [];
      const existingDocs = submission.knackly_documents || [];

      for (let index = 0; index < response.files.length; index++) {
        const file = response.files[index];
        const docName = file.name || `Document ${index + 1}`;

        // Check if we already have a storedUrl for this document (skip if yes)
        const existingDoc = existingDocs.find((d) => d.originalName === docName || d.name === docName);
        if (existingDoc?.storedUrl) {
          console.log(`Document ${index + 1} already has storedUrl, skipping:`, docName);
          processedDocuments.push(existingDoc);
          continue;
        }

        console.log(`Processing document ${index + 1}:`, docName, 'URL:', file.publicUrl);

        try {
          let storedUrl = null;
          let pdfName = docName;

          if (docName.toLowerCase().endsWith('.docx') && file.publicUrl) {
            // Convert DOCX to PDF
            console.log(`Converting ${docName} to PDF...`);
            const pdfBuffer = await convertDocxToPdf(file.publicUrl);
            console.log(`Converted! Buffer size: ${pdfBuffer.length} bytes`);
            pdfName = docName.replace(/\.docx$/i, '.pdf');

            // Store PDF in Supabase Storage - sanitize filename for storage
            const safePdfName = sanitizeFilename(pdfName);
            const storagePath = `${userId}/${submission.id}/${safePdfName}`;
            console.log(`Uploading to Supabase Storage: ${storagePath} (original: ${pdfName})`);

            const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
              .from('user-documents')
              .upload(storagePath, pdfBuffer, {
                contentType: 'application/pdf',
                upsert: true
              });

            if (uploadError) {
              console.error(`Storage upload error for ${docName}:`, uploadError.message, uploadError);
            } else {
              console.log('Upload successful:', uploadData);
              // Get public URL
              const { data: urlData } = supabaseAdmin.storage
                .from('user-documents')
                .getPublicUrl(storagePath);
              storedUrl = urlData?.publicUrl;
              console.log(`Public URL: ${storedUrl}`);
            }
          } else if (file.publicUrl) {
            // Not a DOCX or no conversion needed - just use the Knackly URL
            console.log(`Document ${docName} is not DOCX, using original URL`);
            storedUrl = file.publicUrl;
          }

          processedDocuments.push({
            id: file.id || `doc-${index}`,
            name: pdfName,
            originalName: docName,
            publicUrl: file.publicUrl,
            storedUrl: storedUrl,
            type: 'application/pdf',
          });
        } catch (convError) {
          console.error(`Failed to convert ${docName}:`, convError.message, convError.stack);
          // Still add the document but without storedUrl
          processedDocuments.push({
            id: file.id || `doc-${index}`,
            name: docName,
            publicUrl: file.publicUrl,
            storedUrl: null,
            type: file.type || 'application/octet-stream',
          });
        }
      }

      await supabaseAdmin
        .from('poa_submissions')
        .update({
          knackly_status: 'complete',
          knackly_documents: processedDocuments
        })
        .eq('id', submission.id);

      console.log(`Documents processed for submission ${submission.id}:`, JSON.stringify(processedDocuments, null, 2));
      return { updated: true, status: 'complete', documents: processedDocuments };
    }

    return { updated: false, status: response?.status || 'processing' };
  } catch (error) {
    console.error('Knackly document check error:', error.message, error.stack);
    return { updated: false, error: error.message };
  }
}

async function ensureBucketExists() {
  try {
    // Check if bucket exists
    const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();

    if (listError) {
      console.error('Error listing buckets:', listError);
      return;
    }

    const bucketExists = buckets?.some(b => b.name === 'user-documents');

    if (!bucketExists) {
      console.log('Creating user-documents bucket...');
      const { error: createError } = await supabaseAdmin.storage.createBucket('user-documents', {
        public: true,
        fileSizeLimit: 52428800, // 50MB
      });

      if (createError) {
        console.error('Error creating bucket:', createError);
      } else {
        console.log('Bucket created successfully');
      }
    } else {
      console.log('Bucket user-documents already exists');
    }
  } catch (error) {
    console.error('Bucket check error:', error);
  }
}

function sanitizeFilename(filename) {
  // Replace em-dash, en-dash, and other special dashes with regular dash
  let safe = filename
    .replace(/[\u2013\u2014\u2015]/g, '-')  // em-dash, en-dash, horizontal bar
    .replace(/[\u2018\u2019]/g, "'")         // smart quotes
    .replace(/[\u201C\u201D]/g, '"')         // smart double quotes
    .replace(/[^\w\s\-_.()]/g, '')           // remove other special chars
    .replace(/\s+/g, ' ')                    // normalize whitespace
    .trim();

  // Ensure filename is not empty
  if (!safe || safe === '.pdf' || safe === '.docx') {
    safe = 'document' + (filename.includes('.pdf') ? '.pdf' : '.docx');
  }

  return safe;
}

async function convertDocxToPdf(docxUrl) {
  console.log('ConvertAPI: Converting from URL:', docxUrl);

  const response = await fetch('https://v2.convertapi.com/convert/docx/to/pdf?Secret=' + CONVERTAPI_SECRET, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Parameters: [
        {
          Name: 'File',
          FileValue: {
            Url: docxUrl
          }
        },
        {
          Name: 'StoreFile',
          Value: true
        }
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
