/**
 * Document Automation - Catalogs API
 *
 * GET /api/docauto/catalogs - List all catalogs
 * POST /api/docauto/catalogs - Create a new catalog
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get tenant_id from auth if available
    const authHeader = request.headers.get('authorization');
    let tenantId: string | null = null;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);

      if (user) {
        // Get user's tenant
        const { data: tenantUser } = await supabase
          .from('tenant_users')
          .select('tenant_id')
          .eq('user_id', user.id)
          .single();

        tenantId = tenantUser?.tenant_id;
      }
    }

    // Query catalogs
    let query = supabase
      .from('doc_catalogs')
      .select(`
        id,
        name,
        label,
        summary_template,
        tenant_id,
        created_at,
        updated_at
      `)
      .order('name');

    // Filter by tenant if available
    if (tenantId) {
      query = query.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
    }

    const { data: catalogs, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ catalogs });
  } catch (error) {
    console.error('Error fetching catalogs:', error);
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

    const { name, label, summaryTemplate, tenantId } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    const { data: catalog, error } = await supabase
      .from('doc_catalogs')
      .insert({
        name,
        label,
        summary_template: summaryTemplate,
        tenant_id: tenantId,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ catalog }, { status: 201 });
  } catch (error) {
    console.error('Error creating catalog:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
