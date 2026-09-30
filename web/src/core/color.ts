// 색 이름 → 근사 명도·색상. library.json·products.json의 색 표기를 읽기 위한 초안 표이며 튜닝 대상이다.

export interface ColorInfo {
  /** 0(검정)~100(흰색) */
  lightness: number;
  /** 0~359, 무채색은 null */
  hue: number | null;
}

// 앞쪽 키워드가 먼저 매칭된다(구체적인 이름을 먼저 둔다).
const TABLE: ReadonlyArray<[string, ColorInfo]> = [
  ["pale mint", { lightness: 88, hue: 150 }],
  ["mint", { lightness: 80, hue: 150 }],
  ["dark green", { lightness: 25, hue: 130 }],
  ["deep green", { lightness: 28, hue: 130 }],
  ["green", { lightness: 45, hue: 125 }],
  ["navy", { lightness: 22, hue: 225 }],
  ["light blue", { lightness: 80, hue: 205 }],
  ["blue", { lightness: 45, hue: 215 }],
  ["mustard", { lightness: 62, hue: 48 }],
  ["gold", { lightness: 70, hue: 45 }],
  ["yellow", { lightness: 78, hue: 55 }],
  ["cream", { lightness: 92, hue: 45 }],
  ["beige", { lightness: 82, hue: 40 }],
  ["lilac", { lightness: 78, hue: 285 }],
  ["purple", { lightness: 45, hue: 280 }],
  ["pink", { lightness: 78, hue: 340 }],
  ["red", { lightness: 45, hue: 0 }],
  ["orange", { lightness: 60, hue: 28 }],
  ["brown", { lightness: 35, hue: 25 }],
  ["white", { lightness: 97, hue: null }],
  ["black", { lightness: 8, hue: null }],
  ["grey", { lightness: 55, hue: null }],
  ["gray", { lightness: 55, hue: null }],
];

export function colorInfo(name: string): ColorInfo | null {
  const n = name.toLowerCase();
  for (const [key, info] of TABLE) if (n.includes(key)) return info;
  return null;
}

/** 대비 가드 기준: 제품 주색과 배경(벽·바닥) 명도 차가 이 값보다 작으면 묻힌 것으로 본다 (튜닝 대상) */
export const CONTRAST_MIN_LIGHTNESS_GAP = 25;

export function lightnessGap(a: string, b: string): number | null {
  const ia = colorInfo(a);
  const ib = colorInfo(b);
  if (!ia || !ib) return null;
  return Math.abs(ia.lightness - ib.lightness);
}

/** 제품이 배경에 묻히는지: 명도 차가 작고 색상 차도 작을 때(무채색 포함) */
export const CONTRAST_MIN_HUE_GAP = 60;

export function isBuried(productColor: string, bgColor: string): boolean {
  const gap = lightnessGap(productColor, bgColor);
  if (gap === null || gap >= CONTRAST_MIN_LIGHTNESS_GAP) return false;
  const hue = hueDistance(productColor, bgColor);
  return hue === null || hue < CONTRAST_MIN_HUE_GAP;
}

/** 색상환 거리 0~180. 무채색이 섞이면 null */
export function hueDistance(a: string, b: string): number | null {
  const ia = colorInfo(a);
  const ib = colorInfo(b);
  if (!ia || !ib || ia.hue === null || ib.hue === null) return null;
  const d = Math.abs(ia.hue - ib.hue) % 360;
  return d > 180 ? 360 - d : d;
}

/** 배경 표기에서 실제 색만 추린다. "none (seamless)"는 제외 */
export function backgroundColors(bg: { wall_color: string; floor_color: string }): string[] {
  return [bg.wall_color, bg.floor_color].filter((c) => colorInfo(c) !== null);
}
