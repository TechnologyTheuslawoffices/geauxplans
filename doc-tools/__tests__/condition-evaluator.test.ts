/**
 * Condition Evaluator Tests
 * Comprehensive test suite for the shared condition evaluator
 */

import {
  evaluateCondition,
  evaluateFilterCondition,
  getNestedValue,
  applyFormatters,
  clearConditionCache,
} from '../lib/shared/condition-evaluator';

// Clear cache before each test to ensure isolation
beforeEach(() => {
  clearConditionCache();
});

describe('getNestedValue', () => {
  const testData = {
    Name: 'John',
    Client: {
      FirstName: 'John',
      LastName: 'Doe',
      NameCO: 'John Doe',
      Gender: {
        HeShe: 'he',
        HimHer: 'him',
        Name: 'Male',
      },
    },
    Spouse: {
      FirstName: 'Jane',
      LastName: 'Doe',
    },
    Children: [
      { Name: 'Alice', Age: 10 },
      { Name: 'Bob', Age: 8 },
    ],
    Amount: 1000,
    IsMarried: true,
  };

  test('gets simple property', () => {
    expect(getNestedValue(testData, 'Name')).toBe('John');
  });

  test('gets nested property', () => {
    expect(getNestedValue(testData, 'Client.FirstName')).toBe('John');
  });

  test('gets deeply nested property', () => {
    expect(getNestedValue(testData, 'Client.Gender.HeShe')).toBe('he');
  });

  test('gets array length', () => {
    expect(getNestedValue(testData, 'Children.length')).toBe(2);
  });

  test('returns undefined for missing property', () => {
    expect(getNestedValue(testData, 'Missing')).toBeUndefined();
  });

  test('returns undefined for missing nested property', () => {
    expect(getNestedValue(testData, 'Client.Missing')).toBeUndefined();
  });

  test('returns undefined for null path segment', () => {
    expect(getNestedValue(testData, 'Missing.Property')).toBeUndefined();
  });

  test('gets .Name from selection object', () => {
    expect(getNestedValue(testData, 'Client.Gender.Name')).toBe('Male');
  });
});

describe('evaluateCondition - Boolean Logic', () => {
  const data = {
    IsMarried: true,
    HasChildren: true,
    IsRetired: false,
    Age: 45,
  };

  test('evaluates true boolean', () => {
    expect(evaluateCondition('IsMarried', data)).toBe(true);
  });

  test('evaluates false boolean', () => {
    expect(evaluateCondition('IsRetired', data)).toBe(false);
  });

  test('evaluates negation', () => {
    expect(evaluateCondition('!IsRetired', data)).toBe(true);
    expect(evaluateCondition('!IsMarried', data)).toBe(false);
  });

  test('evaluates AND operator', () => {
    expect(evaluateCondition('IsMarried && HasChildren', data)).toBe(true);
    expect(evaluateCondition('IsMarried && IsRetired', data)).toBe(false);
  });

  test('evaluates OR operator', () => {
    expect(evaluateCondition('IsMarried || IsRetired', data)).toBe(true);
    expect(evaluateCondition('IsRetired || IsMarried', data)).toBe(true);
    expect(evaluateCondition('IsRetired || !HasChildren', data)).toBe(false);
  });

  test('evaluates complex expression with parentheses', () => {
    expect(evaluateCondition('(IsMarried && HasChildren) || IsRetired', data)).toBe(true);
    expect(evaluateCondition('IsMarried && (HasChildren || IsRetired)', data)).toBe(true);
    expect(evaluateCondition('!(IsMarried && IsRetired)', data)).toBe(true);
  });

  test('evaluates empty condition as true', () => {
    expect(evaluateCondition('', data)).toBe(true);
  });
});

describe('evaluateCondition - Comparisons', () => {
  const data = {
    Age: 45,
    Name: 'John',
    Status: 'Active',
    Children: [{ Name: 'Alice' }, { Name: 'Bob' }],
    Type: { Name: 'Premium' },
  };

  test('evaluates equality with string', () => {
    expect(evaluateCondition('Name == "John"', data)).toBe(true);
    expect(evaluateCondition('Name == "Jane"', data)).toBe(false);
  });

  test('evaluates inequality with string', () => {
    expect(evaluateCondition('Name != "Jane"', data)).toBe(true);
    expect(evaluateCondition('Name != "John"', data)).toBe(false);
  });

  test('evaluates greater than', () => {
    expect(evaluateCondition('Age > 40', data)).toBe(true);
    expect(evaluateCondition('Age > 50', data)).toBe(false);
  });

  test('evaluates less than', () => {
    expect(evaluateCondition('Age < 50', data)).toBe(true);
    expect(evaluateCondition('Age < 40', data)).toBe(false);
  });

  test('evaluates greater than or equal', () => {
    expect(evaluateCondition('Age >= 45', data)).toBe(true);
    expect(evaluateCondition('Age >= 46', data)).toBe(false);
  });

  test('evaluates less than or equal', () => {
    expect(evaluateCondition('Age <= 45', data)).toBe(true);
    expect(evaluateCondition('Age <= 44', data)).toBe(false);
  });

  test('evaluates list length comparison', () => {
    expect(evaluateCondition('Children.length > 1', data)).toBe(true);
    expect(evaluateCondition('Children.length == 2', data)).toBe(true);
    expect(evaluateCondition('Children.length > 2', data)).toBe(false);
  });

  test('evaluates number < variable', () => {
    expect(evaluateCondition('1 < Children.length', data)).toBe(true);
    expect(evaluateCondition('3 < Children.length', data)).toBe(false);
  });

  test('evaluates selection object .Name comparison', () => {
    expect(evaluateCondition('Type.Name == "Premium"', data)).toBe(true);
    expect(evaluateCondition('Type.Name != "Basic"', data)).toBe(true);
  });
});

describe('evaluateCondition - List Filters', () => {
  const data = {
    Children: [
      { Name: 'Alice', Age: 10, Parentage: 'Joint' },
      { Name: 'Bob', Age: 8, Parentage: 'Joint' },
      { Name: 'Carol', Age: 15, Parentage: 'Client' },
    ],
    Agents: [
      { Name: 'Agent1', IsActive: true },
      { Name: 'Agent2', IsActive: false },
      { Name: 'Agent3', IsActive: true },
    ],
    Options: ['USA', 'Canada', 'Mexico'],
  };

  test('evaluates |any: with equality', () => {
    expect(evaluateCondition('Children|any: Parentage == "Joint"', data)).toBe(true);
    expect(evaluateCondition('Children|any: Parentage == "Spouse"', data)).toBe(false);
  });

  test('evaluates |every: with equality', () => {
    expect(evaluateCondition('Children|every: Parentage == "Joint"', data)).toBe(false);
    expect(evaluateCondition('Agents|every: IsActive', data)).toBe(false);
  });

  test('evaluates |contains: with string array', () => {
    expect(evaluateCondition('Options|contains:"USA"', data)).toBe(true);
    expect(evaluateCondition('Options|contains:"France"', data)).toBe(false);
  });

  test('handles empty list for |any:', () => {
    const emptyData = { Items: [] };
    expect(evaluateCondition('Items|any: IsActive', emptyData)).toBe(false);
  });

  test('handles empty list for |every:', () => {
    const emptyData = { Items: [] };
    expect(evaluateCondition('Items|every: IsActive', emptyData)).toBe(true);
  });
});

describe('evaluateCondition - String Methods', () => {
  const data = {
    Name: 'John Smith Jr.',
    Email: 'john@example.com',
  };

  test('evaluates .endsWith()', () => {
    expect(evaluateCondition('Name.endsWith(".")', data)).toBe(true);
    expect(evaluateCondition('Name.endsWith("Jr")', data)).toBe(false);
  });

  test('evaluates .startsWith()', () => {
    expect(evaluateCondition('Name.startsWith("John")', data)).toBe(true);
    expect(evaluateCondition('Name.startsWith("Jane")', data)).toBe(false);
  });
});

describe('evaluateCondition - With Item Context', () => {
  const globalData = {
    Client: { id: '123', Name: 'John' },
    Spouse: { id: '456', Name: 'Jane' },
  };

  const itemContext = {
    id: '456',
    Name: 'Agent Jane',
    Type: 'Primary',
  };

  test('prefers item context over global data', () => {
    expect(evaluateCondition('Name == "Agent Jane"', globalData, itemContext)).toBe(true);
    expect(evaluateCondition('id == "456"', globalData, itemContext)).toBe(true);
  });

  test('accesses global data when not in item context', () => {
    expect(evaluateCondition('Client.Name == "John"', globalData, itemContext)).toBe(true);
  });

  test('compares item context to global data', () => {
    expect(evaluateCondition('id == Spouse.id', globalData, itemContext)).toBe(true);
    expect(evaluateCondition('id == Client.id', globalData, itemContext)).toBe(false);
  });
});

describe('evaluateFilterCondition', () => {
  const globalData = {
    MinAge: 18,
  };

  test('filters by truthy property', () => {
    const item = { IsActive: true };
    expect(evaluateFilterCondition('IsActive', item, globalData)).toBe(true);

    const item2 = { IsActive: false };
    expect(evaluateFilterCondition('IsActive', item2, globalData)).toBe(false);
  });

  test('filters by negated property', () => {
    const item = { IsDeceased: true };
    expect(evaluateFilterCondition('!IsDeceased', item, globalData)).toBe(false);

    const item2 = { IsDeceased: false };
    expect(evaluateFilterCondition('!IsDeceased', item2, globalData)).toBe(true);
  });

  test('filters by comparison expression', () => {
    const item = { Status: 'Active' };
    expect(evaluateFilterCondition('Status == "Active"', item, globalData)).toBe(true);
    expect(evaluateFilterCondition('Status != "Inactive"', item, globalData)).toBe(true);
  });

  test('filters by numeric comparison', () => {
    const item = { Age: 25 };
    expect(evaluateFilterCondition('Age > 18', item, globalData)).toBe(true);
    expect(evaluateFilterCondition('Age < 30', item, globalData)).toBe(true);
  });
});

describe('applyFormatters', () => {
  test('applies |upper', () => {
    expect(applyFormatters('hello', '|upper')).toBe('HELLO');
  });

  test('applies |lower', () => {
    expect(applyFormatters('HELLO', '|lower')).toBe('hello');
  });

  test('applies |titlecaps', () => {
    expect(applyFormatters('hello world', '|titlecaps')).toBe('Hello World');
  });

  test('applies |initcap', () => {
    expect(applyFormatters('hello world', '|initcap')).toBe('Hello world');
  });

  test('applies |cardinal', () => {
    expect(applyFormatters('1', '|cardinal')).toBe('one');
    expect(applyFormatters('21', '|cardinal')).toBe('twenty-one');
    expect(applyFormatters('100', '|cardinal')).toBe('one hundred');
  });

  test('applies |ordinal', () => {
    expect(applyFormatters('1', '|ordinal')).toBe('first');
    expect(applyFormatters('2', '|ordinal')).toBe('second');
    expect(applyFormatters('3', '|ordinal')).toBe('third');
  });

  test('applies date format', () => {
    const result = applyFormatters('2024-01-15', '|format: "MMMM D, YYYY"');
    expect(result).toBe('January 15, 2024');
  });

  test('applies multiple formatters', () => {
    expect(applyFormatters('hello', '|upper|lower')).toBe('hello');
  });
});

describe('Condition Caching', () => {
  const data = { Flag: true };

  test('caches repeated evaluations', () => {
    // First evaluation
    const result1 = evaluateCondition('Flag', data);
    // Second evaluation should hit cache
    const result2 = evaluateCondition('Flag', data);

    expect(result1).toBe(true);
    expect(result2).toBe(true);
  });

  test('cache is cleared properly', () => {
    evaluateCondition('Flag', data);
    clearConditionCache();
    // After clear, should re-evaluate
    const result = evaluateCondition('Flag', data);
    expect(result).toBe(true);
  });
});

describe('Edge Cases', () => {
  test('handles undefined data', () => {
    expect(evaluateCondition('Missing', {})).toBe(false);
  });

  test('handles null values', () => {
    const data = { Value: null };
    expect(evaluateCondition('Value', data)).toBe(false);
  });

  test('handles empty string comparison', () => {
    const data = { Name: '' };
    expect(evaluateCondition('Name == ""', data)).toBe(true);
    expect(evaluateCondition('Name', data)).toBe(false);
  });

  test('handles zero comparison', () => {
    const data = { Count: 0 };
    expect(evaluateCondition('Count == 0', data)).toBe(true);
    expect(evaluateCondition('Count', data)).toBe(false);
    expect(evaluateCondition('Count > 0', data)).toBe(false);
  });

  test('handles special characters in strings', () => {
    const data = { Name: "O'Brien" };
    expect(evaluateCondition('Name', data)).toBe(true);
  });

  test('handles deeply nested conditionals', () => {
    const data = { A: true, B: false, C: true, D: false };
    expect(evaluateCondition('(A && !B) || (C && D)', data)).toBe(true);
    expect(evaluateCondition('((A && B) || C) && !D', data)).toBe(true);
  });
});

describe('Real-World Knackly Patterns', () => {
  const trustData = {
    JointOrSinglePlan: 'Joint',
    RevApt: { Name: 'Revocable' },
    MaritalTrustType: 'MaritalFed',
    ContingentTrustOptions: ['USA', 'Disabled Bene'],
    Children: [
      { Name: 'Child1', Parentage: 'Joint' },
      { Name: 'Child2', Parentage: 'Joint' },
    ],
    Client: {
      NameCO: 'John Smith',
      Gender: { HeShe: 'he', HimHer: 'him' },
    },
    Spouse: {
      NameCO: 'Jane Smith',
    },
    LifePartners: false,
    TrustProtectorTF: true,
  };

  test('Joint vs Single plan check', () => {
    expect(evaluateCondition('JointOrSinglePlan == "Joint"', trustData)).toBe(true);
    expect(evaluateCondition('JointOrSinglePlan == "Single"', trustData)).toBe(false);
  });

  test('RevApt selection check', () => {
    expect(evaluateCondition('RevApt.Name == "Revocable"', trustData)).toBe(true);
    expect(evaluateCondition('RevApt.Name == "APT"', trustData)).toBe(false);
  });

  test('ContingentTrustOptions contains check', () => {
    expect(evaluateCondition('ContingentTrustOptions|contains:"USA"', trustData)).toBe(true);
    expect(evaluateCondition('ContingentTrustOptions|contains:"Retirement"', trustData)).toBe(false);
  });

  test('Children every parentage check', () => {
    expect(evaluateCondition('Children|every: Parentage == "Joint"', trustData)).toBe(true);
  });

  test('Complex trust condition', () => {
    expect(evaluateCondition(
      '(JointOrSinglePlan == "Joint") && TrustProtectorTF && !LifePartners',
      trustData
    )).toBe(true);
  });

  test('Marital trust type not NoMarital', () => {
    expect(evaluateCondition('MaritalTrustType != "NoMarital"', trustData)).toBe(true);
  });
});
