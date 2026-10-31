/**
 * Document Automation - Records API
 *
 * GET /api/docauto/records - List records (with filters)
 * POST /api/docauto/records - Create new record
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { searchParams } = new URL(request.url);

    const catalogId = searchParams.get('catalogId');
    const appId = searchParams.get('appId');
    const matterId = searchParams.get('matterId');
    const clientId = searchParams.get('clientId');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
      .from('doc_records')
      .select(`
        id,
        catalog_id,
        app_id,
        data,
        status,
        generated_docs,
        tenant_id,
        matter_id,
        client_id,
        created_by,
        created_at,
        updated_at,
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
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (catalogId) {
      query = query.eq('catalog_id', catalogId);
    }

    if (appId) {
      query = query.eq('app_id', appId);
    }

    if (matterId) {
      query = query.eq('matter_id', matterId);
    }

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: records, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      records,
      pagination: {
        limit,
        offset,
        total: count,
      },
    });
  } catch (error) {
    console.error('Error fetching records:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await request.json();

    const {
      catalogId,
      appId,
      data,
      tenantId,
      matterId,
      clientId,
      createdBy,
    } = body;

    if (!catalogId) {
      return NextResponse.json(
        { error: 'catalogId is required' },
        { status: 400 }
      );
    }

    const { data: record, error } = await supabase
      .from('doc_records')
      .insert({
        catalog_id: catalogId,
        app_id: appId,
        data: data || {},
        status: 'draft',
        tenant_id: tenantId,
        matter_id: matterId,
        client_id: clientId,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    console.error('Error creating record:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
