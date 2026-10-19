import { describe, expect, it } from 'vitest';
import {
  canContain,
  checkParentAssignment,
  childLevelOf,
  descendantIds,
  isStrictAncestor,
  isUnitLevel,
  parentLevelOf,
  type UnitNode,
} from './unit-hierarchy.js';

const units: (UnitNode & { level: 'Ward' | 'Stake' | 'Region' | 'District' })[] = [
  { id: 'district', parentId: null, level: 'District' },
  { id: 'region', parentId: 'district', level: 'Region' },
  { id: 'stake-a', parentId: 'region', level: 'Stake' },
  { id: 'stake-b', parentId: 'region', level: 'Stake' },
  { id: 'ward-a1', parentId: 'stake-a', level: 'Ward' },
  { id: 'ward-a2', parentId: 'stake-a', level: 'Ward' },
  { id: 'ward-b1', parentId: 'stake-b', level: 'Ward' },
  { id: 'lone-ward', parentId: null, level: 'Ward' },
];
const byId = new Map(units.map((unit) => [unit.id, unit]));

describe('unit levels', () => {
  it('orders Ward → Stake → Region → District', () => {
    expect(parentLevelOf('Ward')).toBe('Stake');
    expect(parentLevelOf('Stake')).toBe('Region');
    expect(parentLevelOf('Region')).toBe('District');
    expect(parentLevelOf('District')).toBeNull();
    expect(childLevelOf('District')).toBe('Region');
    expect(childLevelOf('Ward')).toBeNull();
  });

  it('only allows a parent exactly one level up', () => {
    expect(canContain('Stake', 'Ward')).toBe(true);
    expect(canContain('Region', 'Ward')).toBe(false);
    expect(canContain('Ward', 'Stake')).toBe(false);
    expect(canContain('Stake', 'Stake')).toBe(false);
  });

  it('recognizes level names', () => {
    expect(isUnitLevel('Stake')).toBe(true);
    expect(isUnitLevel('stake')).toBe(false);
    expect(isUnitLevel(undefined)).toBe(false);
  });
});

describe('ancestry', () => {
  it('finds strict ancestors at any depth', () => {
    expect(isStrictAncestor('stake-a', 'ward-a1', byId)).toBe(true);
    expect(isStrictAncestor('district', 'ward-b1', byId)).toBe(true);
    expect(isStrictAncestor('ward-a1', 'ward-a1', byId)).toBe(false);
    expect(isStrictAncestor('stake-a', 'ward-b1', byId)).toBe(false);
    expect(isStrictAncestor('ward-a1', 'stake-a', byId)).toBe(false);
    expect(isStrictAncestor('district', 'lone-ward', byId)).toBe(false);
  });

  it('terminates on a cycle', () => {
    const looped = new Map<string, UnitNode>([
      ['x', { id: 'x', parentId: 'y' }],
      ['y', { id: 'y', parentId: 'x' }],
    ]);
    expect(isStrictAncestor('z', 'x', looped)).toBe(false);
  });

  it('lists descendants nearest first', () => {
    expect(descendantIds('stake-a', units)).toEqual(['ward-a1', 'ward-a2']);
    expect(descendantIds('region', units)).toEqual([
      'stake-a',
      'stake-b',
      'ward-a1',
      'ward-a2',
      'ward-b1',
    ]);
    expect(descendantIds('ward-a1', units)).toEqual([]);
  });
});

describe('checkParentAssignment', () => {
  const unit = (id: string): UnitNode & { level: 'Ward' | 'Stake' | 'Region' | 'District' } =>
    byId.get(id) as UnitNode & { level: 'Ward' | 'Stake' | 'Region' | 'District' };

  it('allows moving a ward to another stake', () => {
    expect(checkParentAssignment(unit('ward-a1'), unit('stake-b'), byId)).toBeNull();
  });

  it('rejects skipping a level, self-parenting, and cycles', () => {
    expect(checkParentAssignment(unit('ward-a1'), unit('region'), byId)).toBe('wrong_level');
    expect(checkParentAssignment(unit('stake-a'), unit('stake-a'), byId)).toBe('self');
    const corrupt = new Map<string, UnitNode>(byId);
    corrupt.set('region', { id: 'region', parentId: 'stake-a' });
    expect(
      checkParentAssignment(
        unit('stake-a'),
        { id: 'region', parentId: 'stake-a', level: 'Region' },
        corrupt,
      ),
    ).toBe('cycle');
  });
});
