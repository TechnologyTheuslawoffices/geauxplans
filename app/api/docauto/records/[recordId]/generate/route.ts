/**
 * Document Automation - Generate Documents API
 *
 * POST /api/docauto/records/[recordId]/generate - Generate documents from record
 */

import { NextRequest, NextResponse } from 'next/server';
import { createDocumentGenerator } from '@/lib/docauto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface Params {
  params: Promise<{ recordId: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { recordId } = await params;
    const body = await request.json();
    const { templateIds } = body;

    // Create generator
    const generator = createDocumentGenerator(supabaseUrl, supabaseServiceKey);

    // Get record data
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: record, error: recordError } = await supabase
      .from('doc_records')
      .select('*')
      .eq('id', recordId)
      .single();

    if (recordError || !record) {
      return NextResponse.json(
        { error: 'Record not found' },
        { status: 404 }
      );
    }

    // Generate documents
    const result = await generator.generate({
      catalogId: record.catalog_id,
      appId: record.app_id,
      recordId,
      data: record.data,
      templateIds,
    });

    if (result.errors.length > 0 && result.documents.length === 0) {
      return NextResponse.json(
        { error: 'Failed to generate documents', details: result.errors },
        { status: 500 }
      );
    }

    return NextResponse.json({
      documents: result.documents,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Error generating documents:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
