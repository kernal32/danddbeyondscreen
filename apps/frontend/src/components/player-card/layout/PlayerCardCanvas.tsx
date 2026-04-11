import type { CSSProperties } from 'react';
import type {
  PlayerCardLayoutElement,
  PlayerCardLayoutSchema,
  PlayerCardLayoutViewModelInput,
} from '@ddb/shared-types';
import { evaluatePlayerCardLayoutVisibility } from './evaluatePlayerCardVisibility';
import { getPlayerCardBlockComponent } from './playerCardBlockRegistry';

function anchorTransform(anchor: PlayerCardLayoutElement['anchor']): string {
  const x = anchor?.x ?? 'left';
  const y = anchor?.y ?? 'top';
  const tx = x === 'center' ? '-50%' : x === 'right' ? '-100%' : '0';
  const ty = y === 'center' ? '-50%' : y === 'bottom' ? '-100%' : '0';
  return `translate(${tx}, ${ty})`;
}

function elementStyle(el: PlayerCardLayoutElement): CSSProperties {
  const s: CSSProperties = {
    position: 'absolute',
    left: `${el.x}%`,
    top: `${el.y}%`,
    width: `${el.w}%`,
    height: `${el.h}%`,
    zIndex: el.zIndex ?? 0,
    transform: anchorTransform(el.anchor),
    boxSizing: 'border-box',
  };
  if (el.styleOverrides) {
    for (const [k, v] of Object.entries(el.styleOverrides)) {
      (s as Record<string, string>)[k] = v;
    }
  }
  return s;
}

export type PlayerCardCanvasProps = {
  schema: PlayerCardLayoutSchema;
  viewModel: PlayerCardLayoutViewModelInput;
  className?: string;
};

/**
 * Absolute-percent layout canvas for schema-mode player cards.
 */
export default function PlayerCardCanvas({ schema, viewModel, className = '' }: PlayerCardCanvasProps) {
  const roots = schema.elements
    .filter((el) => el.parentId == null || el.parentId === '')
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

  return (
    <div
      className={`relative min-h-[12rem] w-full min-w-0 overflow-hidden rounded-lg ${className}`.trim()}
      data-player-card-canvas
    >
      {roots.map((el) => {
        if (!evaluatePlayerCardLayoutVisibility(el.visibility, viewModel)) return null;
        const Comp = getPlayerCardBlockComponent(el.type);
        return (
          <div key={el.id} style={elementStyle(el)} className="min-w-0">
            <Comp element={el} viewModel={viewModel} />
          </div>
        );
      })}
    </div>
  );
}

/** Valid demo schema for Storybook / manual testing without session state. */
export const PLAYER_CARD_LAYOUT_DEMO_MOCK_SCHEMA: PlayerCardLayoutSchema = {
  version: 1,
  elements: [
    {
      id: 'demo-mock-a',
      type: 'mockLabel',
      x: 4,
      y: 6,
      w: 42,
      h: 14,
      anchor: { x: 'left', y: 'top' },
      zIndex: 1,
      props: { text: 'Mock label A' },
    },
    {
      id: 'demo-mock-b',
      type: 'mockLabel',
      x: 96,
      y: 50,
      w: 38,
      h: 14,
      anchor: { x: 'right', y: 'center' },
      zIndex: 2,
      props: { text: 'Mock B (right-center)' },
    },
    {
      id: 'demo-mig-primary',
      type: 'migratedSection',
      x: 4,
      y: 72,
      w: 92,
      h: 22,
      anchor: { x: 'left', y: 'top' },
      zIndex: 0,
      visibility: { all: [{ path: 'options.showHitPoints', eq: true }] },
      props: { sectionId: 'primaryStats' },
    },
  ],
};
