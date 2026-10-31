/**
 * Document Automation - Layout API
 * Handles layout updates for drag-and-drop functionality
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface Params {
  params: Promise<{ layoutId: string }>;
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { layoutId } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await request.json();

    const { rows, column_count } = body;

    const { data: layout, error } = await supabase
      .from('doc_layouts')
      .update({
        rows,
        column_count,
        updated_at: new Date().toISOString(),
      })
      .eq('id', layoutId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ layout });
  } catch (error) {
    console.error('Error updating layout:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { layoutId } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: layout, error } = await supabase
      .from('doc_layouts')
      .select('*')
      .eq('id', layoutId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ layout });
  } catch (error) {
    console.error('Error fetching layout:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
