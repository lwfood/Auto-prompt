// 화면 상태 규칙 (순수 함수). 컴포넌트와 분리해 테스트한다.
import { INPUT_LIMITS, USP_MAX, type Draft, type InputImage, type UspInput } from "@/core";

export type Screen = "S1" | "S2" | "S3" | "LIB";

export type UspReference =
  | null
  | { kind: "library"; id: string }
  | { kind: "upload"; data_url: string; name: string };

export interface UspField {
  text: string;
  reference: UspReference;
}

export interface Upload {
  data_url?: string;
  test_id?: string;
  name: string;
}

export interface AppState {
  screen: Screen;
  productName: string;
  productImages: Upload[];
  logo: Upload | null;
  shape: Upload | null;
  usps: UspField[];
  drafts: Draft[];
  productLabel: string | null;
  /** 추천 제외된 레퍼런스 (이 브라우저 세션 기준) */
  excluded: string[];
  /** 라이브러리 화면: USP 번호(선택 모드) 또는 null(탐색 모드) */
  libraryFor: number | null;
  libraryReturn: Exclude<Screen, "LIB">;
  /** 이미지 생성 API 연결 여부. 연결되면 S3(시안 결과)로 간다. 현재 어댑터는 mock */
  imageApi: boolean;
  /** S3: 시안별 남은 수정 요청 횟수 */
  correctionsLeft: Record<number, number>;
  notice: string | null;
}

export const initialState: AppState = {
  screen: "S1",
  productName: "",
  productImages: [],
  logo: null,
  shape: null,
  usps: [{ text: "", reference: null }],
  drafts: [],
  productLabel: null,
  excluded: [],
  libraryFor: null,
  libraryReturn: "S1",
  imageApi: false,
  correctionsLeft: {},
  notice: null,
};

/** 제품 이미지가 있어야 시작할 수 있다 */
export function canStart(s: Pick<AppState, "productImages" | "logo" | "shape">): boolean {
  return s.productImages.length > 0 && supportCount(s) <= INPUT_LIMITS.images_max;
}

function supportCount(s: Pick<AppState, "productImages" | "logo" | "shape">): number {
  return s.productImages.length + (s.logo ? 1 : 0) + (s.shape ? 1 : 0);
}

/** 제품 이미지를 더 올릴 수 있는지 (제품·로고·형태 합계 최대 4장) */
export function canAddProductImage(s: Pick<AppState, "productImages" | "logo" | "shape">): boolean {
  return supportCount(s) < INPUT_LIMITS.images_max;
}

/** 내용이 있는 USP만, 순서대로 (USP 번호 = 시안 번호) */
export function filledUsps(usps: readonly UspField[]): UspField[] {
  return usps.filter((u) => u.text.trim()).slice(0, USP_MAX);
}

/** 만들어질 시안 수: USP가 있으면 USP 수, 없으면 2 (히어로 → 패키지 분석) */
export function draftCount(usps: readonly UspField[]): number {
  return filledUsps(usps).length || 2;
}

/** 다른 USP가 이미 쓰고 있는 라이브러리 레퍼런스 */
export function usedByOthers(usps: readonly UspField[], self: number | null): Map<string, number> {
  const m = new Map<string, number>();
  usps.forEach((u, i) => {
    if (i !== self && u.reference?.kind === "library") m.set(u.reference.id, i);
  });
  return m;
}

function toImage(u: Upload, role: InputImage["role"]): InputImage {
  return u.test_id ? { role, test_id: u.test_id, name: u.name } : { role, data_url: u.data_url, name: u.name };
}

/** API 요청 본문 (create/regenerate 공통 부분) */
export function requestBody(s: AppState) {
  const usps = filledUsps(s.usps);
  const images: InputImage[] = [
    ...s.productImages.map((u) => toImage(u, "product")),
    ...(s.logo ? [toImage(s.logo, "logo")] : []),
    ...(s.shape ? [toImage(s.shape, "shape")] : []),
    ...usps.flatMap((u, i) =>
      u.reference?.kind === "upload" ? [{ role: "reference" as const, usp_index: i, data_url: u.reference.data_url, name: u.reference.name }] : [],
    ),
  ];
  const uspInputs: UspInput[] = usps.map((u) => ({
    text: u.text.trim(),
    ...(u.reference?.kind === "library" ? { reference_id: u.reference.id } : {}),
    ...(u.reference?.kind === "upload" ? { reference_upload: true } : {}),
  }));
  return {
    images,
    usps: uspInputs,
    product_name: s.productName.trim() || undefined,
    excluded: s.excluded,
    mode: s.imageApi ? ("generate" as const) : ("prompt_only" as const),
  };
}

export function toggleExcluded(excluded: readonly string[], id: string): string[] {
  return excluded.includes(id) ? excluded.filter((x) => x !== id) : [...excluded, id];
}

export type ReworkResult = { ok: true; draft: Draft } | { ok: false; error: string };

/**
 * 재작업(프롬프트 다시 만들기·수정 요청) 결과 반영.
 * 실패하면 현재 결과를 유지하고, 재작업 중 바꾼 추천 제외 상태를 시작 전으로 되돌린다.
 */
export function applyRework(state: AppState, snapshotExcluded: readonly string[], result: ReworkResult): AppState {
  if (!result.ok) {
    return {
      ...state,
      excluded: [...snapshotExcluded],
      // 확인 필요(Q-04): 재작업 실패 안내 문구
      notice: `다시 만들지 못해 현재 결과를 유지해요. (${result.error})`,
    };
  }
  return {
    ...state,
    drafts: state.drafts.map((d) => (d.index === result.draft.index ? result.draft : d)),
    notice: null,
  };
}
