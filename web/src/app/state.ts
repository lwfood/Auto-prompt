// 화면 상태 규칙 (순수 함수). 컴포넌트와 분리해 테스트한다.
import { INPUT_LIMITS, type Draft, type InputImage } from "@/core";

export type Screen = "S1" | "S2" | "S4";

export interface AppState {
  screen: Screen;
  images: InputImage[];
  usp: string;
  drafts: Draft[];
  productName: string | null;
  /** 추천 제외된 레퍼런스 (이 브라우저 세션 기준) */
  excluded: string[];
  detailIndex: number | null;
  notice: string | null;
}

export const initialState: AppState = {
  screen: "S1",
  images: [],
  usp: "",
  drafts: [],
  productName: null,
  excluded: [],
  detailIndex: null,
  notice: null,
};

/** 제품 이미지가 있어야 시작할 수 있다 */
export function canStart(images: readonly InputImage[]): boolean {
  return images.some((i) => i.role === "product") && images.length <= INPUT_LIMITS.images_max;
}

export function addImage(images: readonly InputImage[], img: InputImage): InputImage[] {
  return images.length >= INPUT_LIMITS.images_max ? [...images] : [...images, img];
}

export function toggleExcluded(excluded: readonly string[], id: string): string[] {
  return excluded.includes(id) ? excluded.filter((x) => x !== id) : [...excluded, id];
}

export type ReworkResult = { ok: true; draft: Draft } | { ok: false; error: string };

/**
 * 재작업(교체·수정사항) 결과 반영.
 * 실패하면 현재 결과를 유지하고, 재작업 중 바꾼 추천 제외 상태를 시작 전으로 되돌린다.
 */
export function applyRework(state: AppState, snapshotExcluded: readonly string[], result: ReworkResult): AppState {
  if (!result.ok) {
    return {
      ...state,
      excluded: [...snapshotExcluded],
      // 확인 필요: 재작업 실패 안내 문구 (docs/User_Flow.md)
      notice: `다시 만들지 못해 현재 결과를 유지합니다. (${result.error})`,
    };
  }
  return {
    ...state,
    drafts: state.drafts.map((d) => (d.index === result.draft.index ? result.draft : d)),
    notice: null,
  };
}
