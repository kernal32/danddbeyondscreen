import { describe, expect, it } from 'vitest';
import { createDefaultTableLayout } from '@ddb/shared-types';
import { parseTableLayoutPayload } from './table-layout.js';

describe('parseTableLayoutPayload', () => {
  it('accepts default layout shape', () => {
    const d = createDefaultTableLayout();
    expect(parseTableLayoutPayload(d)).toEqual(d);
  });

  it('rejects overflow past 12 columns', () => {
    const d = createDefaultTableLayout();
    const bad = {
      ...d,
      widgets: d.widgets.map((w, i) => (i === 0 ? { ...w, w: 13 } : w)),
    };
    expect(parseTableLayoutPayload(bad)).toBeNull();
  });

  it('rejects duplicate widget ids', () => {
    const d = createDefaultTableLayout();
    const w = d.widgets[0];
    expect(
      parseTableLayoutPayload({
        ...d,
        widgets: [w, { ...w, id: w.id }],
      }),
    ).toBeNull();
  });
});
