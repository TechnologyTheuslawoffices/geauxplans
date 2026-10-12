import { FORM_TYPES } from './formTypes';

/**
 * The interview must be able to collect everything the server insists on before
 * it will draft.
 *
 * The backend refuses to render a will or trust whose residuary legatee table is
 * empty, or a will with no executor — see
 * geauxplans-backend/src/services/docPreconditions.js. Both minor-child plans
 * shipped without an 'executors' or 'will_distribution' page, so those two fields
 * could never be filled in from anywhere in the product. Every minor-child client
 * finished the interview, saw "Complete" on their dashboard, and received no
 * documents at all, because the server had quietly declined to draft.
 *
 * These are static assertions about the page lists rather than rendering tests:
 * the defect was an absent screen, which no test that drives the screens present
 * can catch.
 */

/** Form types docPreconditions.js polices, and the section each one reads. */
const DISPOSITIVE_FORM_TYPES: Record<string, 'will' | 'trust'> = {
  willBasedEstatePlan: 'will',
  willBasedEstatePlan2Person: 'will',
  minorChildEstatePlan: 'will',
  minorChildEstatePlan2Person: 'will',
  trustBasedEstatePlanSolo: 'trust',
  trustBasedEstatePlan2Person: 'trust',
};

/** The page that collects `<section>_info.residuary_distribution`. */
const RESIDUARY_PAGE = { will: 'will_distribution', trust: 'distribution' };

describe('interview pages cover the server-side generation preconditions', () => {
  it.each(Object.keys(DISPOSITIVE_FORM_TYPES))(
    '%s collects a residuary distribution',
    (formType) => {
      const section = DISPOSITIVE_FORM_TYPES[formType];
      expect(FORM_TYPES[formType].pages).toContain(RESIDUARY_PAGE[section]);
    }
  );

  it.each(
    Object.keys(DISPOSITIVE_FORM_TYPES).filter(
      (t) => DISPOSITIVE_FORM_TYPES[t] === 'will'
    )
  )('%s collects an executor', (formType) => {
    expect(FORM_TYPES[formType].pages).toContain('executors');
  });

  /**
   * Executors, trustees and residuary legatees are all chosen from dropdowns fed
   * by `people_or_entities_who_will_serve_as_agents`. A page that asks the client
   * to pick someone before that list has been gathered offers an empty dropdown,
   * which looks identical to having no one to pick.
   */
  it.each(Object.keys(FORM_TYPES))(
    '%s gathers people before any page that picks from them',
    (formType) => {
      const { pages } = FORM_TYPES[formType];
      const agentsAt = pages.indexOf('agents');
      if (agentsAt === -1) return;

      for (const dependent of ['executors', 'guardians', 'children_trusts', 'trustees', 'will_distribution', 'distribution']) {
        const at = pages.indexOf(dependent);
        if (at !== -1) {
          expect(at).toBeGreaterThan(agentsAt);
        }
      }
    }
  );
});
