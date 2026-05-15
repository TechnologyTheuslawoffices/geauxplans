/**
 * Knackly Import API
 *
 * POST /api/docauto/import
 *
 * Imports a Knackly export JSON into the database.
 */

import { NextRequest, NextResponse } from 'next/server';
import { importKnacklyCatalog } from '@/lib/docauto/knackly-import';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { exportData, tenantId, dryRun, skipTemplates } = body;

    if (!exportData) {
      return NextResponse.json(
        { error: 'Missing exportData in request body' },
        { status: 400 }
      );
    }

    // If exportData is a string, use it directly; otherwise stringify it
    const jsonContent = typeof exportData === 'string'
      ? exportData
      : JSON.stringify(exportData);

    const result = await importKnacklyCatalog(
      jsonContent,
      supabaseUrl,
      supabaseServiceKey,
      tenantId,
      { dryRun, skipTemplates }
    );

    return NextResponse.json(result);

  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    );
  }
}
