import type { CombinedDecorSvgId, CombinedSvgColorMode } from '@ddb/shared-types/widget-config';
import type { CSSProperties } from 'react';
import {
  IconConditions,
  IconEye,
  IconHeart,
  IconInsight,
  IconSearch,
  IconShield,
  IconSparkles,
  IconSpellSaveD20,
} from '../components/party/PartyCardStatIcons';

function isHexColor(s: string | undefined): boolean {
  if (!s) return false;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s.trim());
}

function colorClass(mode: CombinedSvgColorMode): string {
  switch (mode) {
    case 'accent':
      return 'text-[var(--accent)]';
    case 'text':
      return 'text-[var(--text)]';
    case 'muted':
      return 'text-[var(--muted)]';
    case 'spellBar':
      return 'text-[var(--spell-bar)]';
    case 'ok':
      return 'text-[var(--ok)]';
    case 'custom':
      return '';
    case 'theme':
    default:
      return 'text-[var(--ac-tint)] opacity-90';
  }
}

export default function CombinedDecorSvgGraphic({
  id,
  colorMode = 'theme',
  colorCustom,
  className = '',
}: {
  id: CombinedDecorSvgId;
  colorMode?: CombinedSvgColorMode;
  colorCustom?: string;
  className?: string;
}) {
  const cls = colorClass(colorMode);
  const custom = colorMode === 'custom' && isHexColor(colorCustom) ? colorCustom!.trim() : undefined;
  const style = custom ? ({ color: custom } as CSSProperties) : undefined;
  const svgCls =
    `pointer-events-none h-full w-full max-h-full max-w-full shrink-0 object-contain ${cls} ${className}`.trim();

  const extra = style ? { style } : {};

  switch (id) {
    case 'heart':
      return <IconHeart className={svgCls} {...extra} />;
    case 'shield':
      return <IconShield className={svgCls} {...extra} />;
    case 'spellStar':
      return <IconSpellSaveD20 className={svgCls} {...extra} />;
    case 'eye':
      return <IconEye className={svgCls} {...extra} />;
    case 'search':
      return <IconSearch className={svgCls} {...extra} />;
    case 'insight':
      return <IconInsight className={svgCls} {...extra} />;
    case 'sparkles':
      return <IconSparkles className={svgCls} {...extra} />;
    case 'conditions':
      return <IconConditions className={svgCls} {...extra} />;
    default:
      return <IconHeart className={svgCls} {...extra} />;
  }
}
