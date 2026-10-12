/**
 * Document Automation - Single Catalog API (Optimized)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Simple in-memory cache (5 minute TTL)
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

interface Params {
  params: Promise<{ catalogId: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { catalogId } = await params;

    // Check cache first
    const cacheKey = `catalog:${catalogId}`;
    const cached = getCached<{ catalog: unknown }>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Run all independent queries in PARALLEL
    const [
      catalogResult,
      variablesResult,
      formulasResult,
      templatesResult,
      layoutsResult,
      appsResult,
      staticTablesResult,
      modelsResult,
    ] = await Promise.all([
      supabase.from('doc_catalogs').select('*').eq('id', catalogId).single(),
      supabase.from('doc_variables').select('*').eq('catalog_id', catalogId).order('sort_order'),
      supabase.from('doc_formulas').select('*').eq('catalog_id', catalogId),
      supabase.from('doc_templates').select('*').eq('catalog_id', catalogId),
      supabase.from('doc_layouts').select('*').eq('catalog_id', catalogId),
      supabase.from('doc_apps').select('*').eq('catalog_id', catalogId).order('name'),
      supabase.from('doc_static_tables').select('*'),
      supabase.from('doc_models').select('*'),
    ]);

    if (catalogResult.error) {
      return NextResponse.json({ error: 'Catalog not found' }, { status: 404 });
    }

    const catalog = catalogResult.data;
    const variables = variablesResult.data || [];
    const models = modelsResult.data || [];

    // Find which models are actually referenced by object variables
    const referencedModelIds = new Set<string>();
    for (const v of variables) {
      if (v.type === 'object' || v.type === 'list_of_object') {
        const modelRef = v.config?.model_ref;
        if (modelRef) {
          // Find model by knackly_id
          const model = models.find(m => m.knackly_id === modelRef);
          if (model) referencedModelIds.add(model.id);
        }
      }
    }

    // Get variable IDs for options query
    const variableIds = variables.map(v => v.id);

    // Only fetch model variables if we have referenced models
    const modelIdsArray = Array.from(referencedModelIds);

    // Run second batch of queries in parallel
    const [optionsResult, modelVariablesResult] = await Promise.all([
      variableIds.length > 0
        ? supabase.from('doc_selection_options').select('*').in('variable_id', variableIds).order('sort_order')
        : Promise.resolve({ data: [] }),
      modelIdsArray.length > 0
        ? supabase.from('doc_variables').select('*').in('model_id', modelIdsArray).order('sort_order')
        : Promise.resolve({ data: [] }),
    ]);

    const options = optionsResult.data || [];
    const modelVariables = modelVariablesResult.data || [];

    // Get options for model variables
    const modelVarIds = modelVariables.map(v => v.id);
    const modelOptionsResult = modelVarIds.length > 0
      ? await supabase.from('doc_selection_options').select('*').in('variable_id', modelVarIds).order('sort_order')
      : { data: [] };
    const modelOptions = modelOptionsResult.data || [];

    // Build variables with options
    const variablesWithOptions = variables.map(v => ({
      ...v,
      options: options.filter(o => o.variable_id === v.id),
    }));

    // Build only referenced models with their variables
    const referencedModels = models
      .filter(m => referencedModelIds.has(m.id))
      .map(m => ({
        ...m,
        variables: modelVariables
          .filter(v => v.model_id === m.id)
          .map(v => ({
            ...v,
            options: modelOptions.filter(o => o.variable_id === v.id),
          })),
      }));

    const response = {
      catalog: {
        ...catalog,
        variables: variablesWithOptions,
        formulas: formulasResult.data || [],
        templates: templatesResult.data || [],
        layouts: layoutsResult.data || [],
        apps: appsResult.data || [],
        staticTables: staticTablesResult.data || [],
        models: referencedModels,
      },
    };

    // Cache the result
    setCache(cacheKey, response);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching catalog:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { catalogId } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await request.json();

    const { name, label, summaryTemplate } = body;

    const { data: catalog, error } = await supabase
      .from('doc_catalogs')
      .update({
        name,
        label,
        summary_template: summaryTemplate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', catalogId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ catalog });
  } catch (error) {
    console.error('Error updating catalog:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { catalogId } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabase
      .from('doc_catalogs')
      .delete()
      .eq('id', catalogId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting catalog:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
