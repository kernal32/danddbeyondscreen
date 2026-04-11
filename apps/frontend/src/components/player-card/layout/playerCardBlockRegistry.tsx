import type { ComponentType } from 'react';
import type {
  PlayerCardKnownBlockType,
  PlayerCardLayoutElement,
  PlayerCardLayoutViewModelInput,
} from '@ddb/shared-types';

export type PlayerCardBlockRenderProps = {
  element: PlayerCardLayoutElement;
  viewModel: PlayerCardLayoutViewModelInput;
};

function ContainerBlock({ element }: PlayerCardBlockRenderProps) {
  return (
    <div
      className="min-h-0 overflow-hidden rounded border border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--text)_4%,transparent)]"
      data-pc-block={element.id}
    >
      <span className="sr-only">container</span>
    </div>
  );
}

function MigratedSectionBlock({ element }: PlayerCardBlockRenderProps) {
  const sid = typeof element.props?.sectionId === 'string' ? element.props.sectionId : '?';
  return (
    <div
      className="flex h-full min-h-0 flex-col justify-center overflow-hidden rounded border border-dashed border-[var(--border-subtle)] px-2 py-1"
      data-pc-migrated-section={sid}
    >
      <span className="text-center font-mono text-[10px] uppercase tracking-wide text-[var(--muted)]">
        Migrated · {sid}
      </span>
      <span className="text-center text-[9px] text-[var(--muted)]">Schema block (replace with typed widgets)</span>
    </div>
  );
}

function MockLabelBlock({ element }: PlayerCardBlockRenderProps) {
  const text = typeof element.props?.text === 'string' ? element.props.text : element.type;
  return (
    <div className="flex h-full items-center justify-center overflow-hidden text-[var(--text)]" data-pc-mock-label={element.id}>
      <span className="text-sm font-medium">{text}</span>
    </div>
  );
}

const REGISTRY: Record<PlayerCardKnownBlockType, ComponentType<PlayerCardBlockRenderProps>> = {
  container: ContainerBlock,
  migratedSection: MigratedSectionBlock,
  mockLabel: MockLabelBlock,
};

export function getPlayerCardBlockComponent(
  type: PlayerCardKnownBlockType,
): ComponentType<PlayerCardBlockRenderProps> {
  return REGISTRY[type];
}
