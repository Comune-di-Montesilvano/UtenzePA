import {CHAPTER_SIGNALS} from './budget-chapters-filters';

describe('CHAPTER_SIGNALS', () => {
  it('variazione di bilancio da chiedere', () => {
    const def = CHAPTER_SIGNALS.find(s => s.key === 'chapters_variation_needed');
    expect(def?.label).toBe('Variazione di bilancio da chiedere');
    expect(def?.ids).toBeUndefined();
  });
});
