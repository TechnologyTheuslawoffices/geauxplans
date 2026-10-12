// Firm-info WORKSPACE GLOBAL.
//
// In real Knackly, `firmInfo` is a workspace-level global (the "FIRM INFO"
// record reachable from GLOBAL INFO ▸ Firm Info) that is automatically present
// in EVERY interview/generation — it is NOT stored per-record. This clone has
// no workspace-global store, so without this the `firmInfo` variable is
// undefined at generation time and every `firmInfo.*` reference renders blank:
// firm letterhead, signature/notary blocks, and the SYNTHETIC firm entity
// (id "TheusLaw23894DLFJ") that the `NewAgents` catalog formula builds and that
// can be selected as a successor trustee.
//
// The values below mirror the live workspace's Firm Information record
// ("Made-Up Law Firm"). The FirmInfo model derives FirmStreet1/FirmCity/
// FirmState/FirmZip/FirmBlockAddress via model FORMULAS off firmAddresses[0];
// because model-formula resolution does not run on `type:"global"` properties,
// those derived fields are supplied here as literals as well (the same flat
// shape the interview test-data preset already uses).

const arizonaState = {
  Name: 'Arizona',
  Abbrev: 'AZ',
  ParishCounty: 'County',
};

const firmMainAddress = {
  StreetAddress1: '1000 S 400 East',
  StreetAddress2: '',
  City: 'MadeUp Town',
  State: arizonaState,
  Zip: '23423',
  CityStateZip: 'MadeUp Town, Arizona 23423',
};

const firmInfoGlobal: Record<string, unknown> = {
  FirmName: 'Made-Up Law Firm',
  FirmEntityType: 'limited liability company',
  FirmEIN: '23-4234233',

  FirmPhone: '(345) 435-3453',
  FirmFax: '(457) 567-5675',
  FirmEmail: 'staff@made-upfirm.com',
  FirmWebsite: 'made-upfirm.com',

  FirmParishCounty: 'County',
  FirmParish: 'Box Elder',

  firmAddresses: [firmMainAddress],

  // Derived flat fields (FirmInfo model formulas off firmAddresses[0]) supplied
  // directly because model formulas do not run on a global property.
  FirmStreet1: '1000 S 400 East',
  FirmStreet2: null,
  FirmCity: 'MadeUp Town',
  FirmState: 'Arizona',
  FirmZip: '23423',
  FirmBlockAddress: '1000 S 400 East\nMadeUp Town, Arizona 23423',

  AttorneysAndStaff: [
    {
      // id$ matches the PreparingAttorney selection stored in the record
      // (bondRealRecord.json: PreparingAttorney = "65e0b4b450af3045b6462b7e").
      // Without it the userData selection cannot resolve to this attorney and
      // the entire "Document prepared by:" block renders blank.
      id$: '65e0b4b450af3045b6462b7e',
      First: 'Mandy',
      Middle: '',
      Last: 'Made-Up',
      Suffix: '',
      UseName: 'Mandy',
      Title: 'Attorney',
      Initials: 'mm',
      Gender: { Name: 'female', HeShe: 'she', HimHer: 'her', HisHer: 'her', MrMrs: 'Ms.' },
      Roles: [{ Name: 'Attorney' }, { Name: 'Notary' }, { Name: 'Staff' }],
      // #51 — flat literals mirroring the attorneysandstaff model formulas
      // (IsAttorneyTF = Roles|contains:"Attorney", etc.). Model formulas don't
      // run on stored globals when interview option filters evaluate (e.g.
      // AttorneyList = firmInfo.AttorneysAndStaff|filter: IsAttorneyTF), so
      // they are supplied as data — same precedent as FirmStreet1/FirmCity.
      IsAttorneyTF: true,
      IsNotaryTF: true,
      IsStaffTF: true,
      BarNo: '2342352345',
      NotaryNumber: '111111111',
      Email: 'mandy@made-up.com',
      StaffP: '',
      StaffF: '',
      ParishCounty: { Name: 'County' },
      EnterParish: 'Somerton',
      UseFirmAddressTF: true,
      // TrueAddress = UseFirmAddressTF ? SelectAddress : Address. With
      // UseFirmAddressTF true, Street/CityStateZip come from SelectAddress, so
      // it must hold the chosen firm address (here the only firm address).
      SelectAddress: { ...firmMainAddress },
      Address: { ...firmMainAddress },
    },
    // Additional made-up roster entries so each role (Attorney / Notary /
    // Staff) is individually represented — same field shape as Mandy above
    // (attorneysandstaff model: IsAttorneyTF/IsNotaryTF/IsStaffTF derive from
    // Roles|contains, so Roles uses the {Name} selection-list shape).
    {
      id$: '65e0b4b450af3045b6462b7f',
      First: 'Andrew',
      Middle: 'A.',
      Last: 'Made-Up',
      Suffix: '',
      UseName: 'Andy',
      Title: 'Attorney',
      Initials: 'aam',
      Gender: { Name: 'male', HeShe: 'he', HimHer: 'him', HisHer: 'his', MrMrs: 'Mr.' },
      Roles: [{ Name: 'Attorney' }],
      IsAttorneyTF: true,
      IsNotaryTF: false,
      IsStaffTF: false,
      BarNo: '5675675678',
      NotaryNumber: '',
      Email: 'andrew@made-up.com',
      StaffP: '(345) 345-3454',
      StaffF: '',
      ParishCounty: { Name: 'County' },
      EnterParish: 'Somerton',
      UseFirmAddressTF: true,
      SelectAddress: { ...firmMainAddress },
      Address: { ...firmMainAddress },
    },
    {
      id$: '65e0b4b450af3045b6462b80',
      First: 'Nora',
      Middle: '',
      Last: 'Made-Up',
      Suffix: '',
      UseName: '',
      Title: 'Notary Public',
      Initials: 'nm',
      Gender: { Name: 'female', HeShe: 'she', HimHer: 'her', HisHer: 'her', MrMrs: 'Ms.' },
      Roles: [{ Name: 'Notary' }],
      IsAttorneyTF: false,
      IsNotaryTF: true,
      IsStaffTF: false,
      BarNo: '',
      NotaryNumber: '222222222',
      Email: 'nora@made-up.com',
      StaffP: '(345) 345-3455',
      StaffF: '',
      ParishCounty: { Name: 'County' },
      EnterParish: 'Somerton',
      UseFirmAddressTF: true,
      SelectAddress: { ...firmMainAddress },
      Address: { ...firmMainAddress },
    },
    {
      id$: '65e0b4b450af3045b6462b81',
      First: 'Sam',
      Middle: '',
      Last: 'Made-Up',
      Suffix: '',
      UseName: '',
      Title: 'Paralegal',
      Initials: 'sm',
      Gender: { Name: 'male', HeShe: 'he', HimHer: 'him', HisHer: 'his', MrMrs: 'Mr.' },
      Roles: [{ Name: 'Staff' }],
      IsAttorneyTF: false,
      IsNotaryTF: false,
      IsStaffTF: true,
      BarNo: '',
      NotaryNumber: '',
      Email: 'sam@made-up.com',
      StaffP: '(345) 345-3456',
      StaffF: '(457) 567-5676',
      ParishCounty: { Name: 'County' },
      EnterParish: 'Somerton',
      UseFirmAddressTF: true,
      SelectAddress: { ...firmMainAddress },
      Address: { ...firmMainAddress },
    },
  ],
};

export default firmInfoGlobal;
