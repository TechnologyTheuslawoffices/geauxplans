# EstateAdmin Catalog Structure

## Overview

EstateAdmin is the **Succession/Probate Administration** catalog for handling estate administration after death - petitions for possession, accounting, debt payments, and related succession documents.

| Metric | Count |
|--------|-------|
| **Properties (Variables)** | 228 |
| **Apps** | 4 |
| **Templates** | 53 |
| **Formulas** | 173 |
| **Layouts** | 1 |

---

## Variable Types Distribution

| Type | Count | Description |
|------|-------|-------------|
| `selection` | 71 | Dropdowns, radio buttons, multi-select |
| `true/false` | 58 | Boolean checkboxes/toggles |
| `object` | 41 | Single or list of model instances |
| `text` | 32 | Free-form text input |
| `date` | 17 | Date picker values |
| `number` | 8 | Numeric values |
| `global` | 1 | Global/shared variable |

---

## Apps (4 total)

| App Name | Purpose |
|----------|---------|
| `Succession` | Main succession/probate app |
| `POAApp` | Power of Attorney documents |
| `Letterhead` | Letterhead template |
| `test` | Test/development app |

---

## Templates (53 total)

### Succession Documents
| Template | Type | Purpose |
|----------|------|---------|
| `AffidavitSmallSuccession` | docx | Small succession affidavit |
| `JudgmentofPossession` | docx | Judgment placing heirs in possession |
| `PetitionforAdministration` | docx | Petition to open administration |
| `PetitionforPossession` | docx | Petition to be placed in possession |
| `LettersAdmin` | docx | Letters of administration |
| `DDL` | docx | Descriptive list of assets |

### Court Filings
| Template | Type | Purpose |
|----------|------|---------|
| `OrderApptingEstateRep` | docx | Order appointing estate representative |
| `PetitionFilingAccting` | docx | Petition filing accounting |
| `PetitionFinalAccting` | docx | Final accounting petition |
| `FinalAccting` | docx | Final accounting document |
| `AccountingTemplate` | docx | Accounting template |
| `JgmtReAcct` | docx | Judgment regarding accounting |
| `PetitionToReopen` | docx | Petition to reopen succession |

### Property/Debt Documents
| Template | Type | Purpose |
|----------|------|---------|
| `PetAuthoritySellRealProp` | docx | Petition for authority to sell real property |
| `JgmtReSellRealProp` | docx | Judgment regarding sale of real property |
| `PetPayUrgentDebts` | docx | Petition to pay urgent debts |
| `OrderAuthPayUrgentDebts` | docx | Order authorizing payment of urgent debts |

### Certificates & Notices
| Template | Type | Purpose |
|----------|------|---------|
| `CertNoOppositionAccting` | docx | Certificate of no opposition to accounting |
| `CertNoOppositionSellRealProp` | docx | Certificate of no opposition to sale |
| `CertServiceFinalAcct` | docx | Certificate of service for final accounting |
| `NoticeFilingAccting` | docx | Notice of filing accounting |
| `AffidavitOfPublicationAccting` | docx | Affidavit of publication |

### Renunciation & Resignation
| Template | Type | Purpose |
|----------|------|---------|
| `FullRenunciation` | docx | Full renunciation of succession rights |
| `ExecutorResignation` | docx | Executor resignation |
| `AffAcceptanceRA` | docx | Affidavit of acceptance |
| `OrderReturnBond` | docx | Order to return bond |

### Letters to Clerk
| Template | Type | Purpose |
|----------|------|---------|
| `LtrClerkOfCourtAfterDelays` | docx | Letter to clerk after delays |
| `LtrClerkOfCourtFilingAccounting` | docx | Letter filing accounting |
| `LtrClerkOfCourtPetPayUrgentDebts` | docx | Letter re: petition to pay debts |
| `LtrClerkOfCourtRePetPossession` | docx | Letter re: petition for possession |
| `LtrClerkOfCourtRePetProbate` | docx | Letter re: petition for probate |
| `LtrClerkOfCourtRePetSaleImmovProp` | docx | Letter re: sale of immovable property |
| `LtrClerkOfCourtReSSA` | docx | Letter re: small succession affidavit |
| `LtrReClosing` | docx | Closing letter |
| `LtrReClosingSSA` | docx | Closing letter for SSA |

### Publication Letters
| Template | Type | Purpose |
|----------|------|---------|
| `LtrRePublicationAccountingAndTableau` | docx | Publication letter for accounting |
| `LtrRePublicationSaleImmovProp1` | docx | Publication letter for property sale |

### Other
| Template | Type | Purpose |
|----------|------|---------|
| `PowerOfAttorney` | docx | Power of attorney |
| `LPOA` | docx | Limited power of attorney |
| `TheusLetterhead` | docx | Firm letterhead |
| `VerificationAccting` | docx | Verification of accounting |

### Text Templates (Reusable Snippets)
| Template | Purpose |
|----------|---------|
| `ExecutorTitle` | Executor title text |
| `DecedentMarriageFamilyTX` | Decedent marriage/family description |
| `Decedent2MarriageFamilyTX` | Second decedent marriage/family |

---

## Key Variable Patterns

### Naming Conventions
| Pattern | Example | Purpose |
|---------|---------|---------|
| `Decedent*` | DecedentFirst, DecedentGender | Decedent information |
| `*TF` | MarriedTF, ChildrenTF | True/False booleans |
| `All*` | AllHeirs, AllBanks | Aggregated lists |
| `Total*` | TotalAssets, TotalDebts | Calculated totals |
| `True*` | TrueHeirs1, TrueChildren | Filtered/computed lists |
| `*Petition*` | PetitionTextList | Petition-related |

### Core Variables
- `Decedent` - Deceased person object
- `SurvivingSpouse` - Surviving spouse (if any)
- `AllHeirs` - All heirs of the estate
- `TrueChildren` - Verified children
- `TotalEstateValue` - Total estate value
- `TotalDebts` - Total debts
- `TotalEstateNet` - Net estate value

### Community Property Variables
- `HalfCommunityProperty` - Half of community property
- `ImmovableCommunity` / `ImmovableSeparate` - Real property
- `MovableCommunity` / `MovableSeparate` - Personal property
- `TotalCommunityProperty` / `TotalSeparateProperty`
- `TotalCommunityDebt` / `TotalSeparateDebt`

### Asset Categories
- `AllBanks` - Bank accounts
- `AllBusiness` - Business interests
- `AllImmoveable` - Real property
- `AllLife` - Life insurance
- `AllMoveable` - Personal property
- `AllOther` - Other assets
- `AllRetirement` - Retirement accounts
- `AllVehicles` - Vehicles

---

## Comparison with EstatePlanning

| Feature | EstatePlanning | EstateAdmin |
|---------|---------------|-------------|
| **Purpose** | Living estate planning | Post-death administration |
| **Focus** | Trusts, wills, POAs | Successions, probate |
| **Variables** | 743 | 228 |
| **Templates** | 103 | 53 |
| **Apps** | 24 | 4 |

---

## Next Steps

To fully utilize this catalog:
1. Import into geauxplans-v2
2. Connect to shared models (individual, agent, etc.)
3. Configure layouts for interview flow
4. Test document generation
