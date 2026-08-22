/**
 * Preconditions that must hold before estate documents may be generated.
 *
 * WHY THIS EXISTS
 * ---------------
 * The document engine will happily render a will from incomplete data. Verified
 * by generating "Will-Based Estate Plan Solo Documents" with an empty
 * `ClientWillResiduary`: the will is produced (142,937 bytes) and contains
 *
 *     "I bequeath and devise the rest, residue and remainder of all property
 *      ... unto my Residuary Legatee named hereinbelow ..."
 *
 * followed by an EMPTY "Residuary Legatee Name / Relationship / Share" table.
 * That is a defective will — it disposes of the entire residuary estate to a
 * legatee who is never named, which invites exactly the "bad will" litigation
 * this product exists to prevent.
 *
 * The intake form cannot currently produce that data. It asks one free-text
 * question ("Residuary Estate Distribution — e.g. Equally among my children"),
 * whereas the catalog models a residuary entry as a 107-field object requiring
 * a beneficiary reference, `HowReceive` (outright vs in trust), distribution
 * mechanics, lapse handling and trustee structures. Prose cannot be converted
 * into those terms without inventing legally-operative provisions.
 *
 * So we refuse rather than emit a defective instrument. POA-only plans are
 * unaffected: they have no residuary.
 */

/** Plans whose documents include a will or a trust with a residuary clause. */
const DISPOSITIVE_FORM_TYPES = new Set([
  'willBasedEstatePlan',
  'willBasedEstatePlan2Person',
  'minorChildEstatePlan',
  'minorChildEstatePlan2Person',
  'trustBasedEstatePlanSolo',
  'trustBasedEstatePlan2Person',
]);

/**
 * A residuary/bequest instruction is only usable if it is structured data. The
 * form used to store free text, which is why this returns false for strings.
 */
function isStructuredDistribution(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Shares must total exactly 100, mirroring the catalog's own check:
 *
 *   ClientWillResiduaryBenesTotal  = peek(ClientWillResiduary|reduce: _result + GeauxBequest : 0)
 *   WarnIfLessThan100PercentClientWill = ... ClientWillResiduaryBenesTotal == 100 ? false : true
 *
 * A total under 100 means part of the estate has no named recipient — the same
 * defect as an empty legatee table, just partial.
 */
function residuaryTotal(entries) {
  return entries.reduce((sum, e) => sum + (parseFloat(e && e.share_percent) || 0), 0);
}

/**
 * @returns {{ok: boolean, blockers: string[]}}
 */
function checkGenerationPreconditions(formType, formData) {
  const blockers = [];

  if (!DISPOSITIVE_FORM_TYPES.has(formType)) {
    return { ok: true, blockers };
  }

  const data = typeof formData === 'string' ? JSON.parse(formData) : (formData || {});
  const will = data.will_info || {};
  const trust = data.trust_info || {};
  const isTrust = /^trustBased/.test(formType);
  const section = isTrust ? trust : will;

  const residuary = section.residuary_distribution;
  if (!isStructuredDistribution(residuary)) {
    blockers.push(
      'Residuary distribution is missing or is unstructured free text. A will or ' +
      'trust cannot be generated without named residuary beneficiaries and their ' +
      'shares, because the document would otherwise contain an empty legatee table.'
    );
  } else {
    if (residuary.some((e) => !e || !e.recipient)) {
      blockers.push(
        'One or more residuary beneficiaries have no name. Every share must ' +
        'identify who receives it.'
      );
    }
    const total = residuaryTotal(residuary);
    if (Math.abs(total - 100) > 0.01) {
      blockers.push(
        `Residuary shares total ${Math.round(total * 100) / 100}%, not 100%. The ` +
        'remainder of the estate would have no named beneficiary.'
      );
    }
  }

  if (section.has_specific_bequests === true &&
      !isStructuredDistribution(section.specific_bequests)) {
    blockers.push(
      'Specific bequests were requested but are unstructured free text. Each ' +
      'bequest needs an identified recipient and the property being given.'
    );
  }

  if (isStructuredDistribution(section.specific_bequests) &&
      section.specific_bequests.some((b) => !b || !b.recipient || !String(b.description || '').trim())) {
    blockers.push(
      'Each specific bequest needs both a recipient and a description of the ' +
      'property being given.'
    );
  }

  if (!isTrust && !will.primary_executor) {
    blockers.push('No executor has been named for the will.');
  }

  return { ok: blockers.length === 0, blockers };
}

module.exports = {
  checkGenerationPreconditions,
  DISPOSITIVE_FORM_TYPES,
};
