/**
 * Document Automation - Single Record API
 *
 * GET /api/docauto/records/[recordId] - Get record
 * PUT /api/docauto/records/[recordId] - Update record
 * DELETE /api/docauto/records/[recordId] - Delete record
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface Params {
  params: Promise<{ recordId: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { recordId } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: record, error } = await supabase
      .from('doc_records')
      .select(`
        *,
        doc_catalogs (
          id,
          name,
          label
        ),
        doc_apps (
          id,
          name,
          description
        )
      `)
      .eq('id', recordId)
      .single();

    if (error) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    return NextResponse.json({ record });
  } catch (error) {
    console.error('Error fetching record:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { recordId } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await request.json();

    const { data, status, appId, matterId, clientId } = body;

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data !== undefined) {
      updateData.data = data;
    }

    if (status !== undefined) {
      updateData.status = status;
    }

    if (appId !== undefined) {
      updateData.app_id = appId;
    }

    if (matterId !== undefined) {
      updateData.matter_id = matterId;
    }

    if (clientId !== undefined) {
      updateData.client_id = clientId;
    }

    const { data: record, error } = await supabase
      .from('doc_records')
      .update(updateData)
      .eq('id', recordId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ record });
  } catch (error) {
    console.error('Error updating record:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { recordId } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabase
      .from('doc_records')
      .delete()
      .eq('id', recordId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting record:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
