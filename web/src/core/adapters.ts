// 어댑터 5곳: 비전 분석, LLM(프롬프트 작성), 이미지 생성, 검증 모델, 레퍼런스 라이브러리.
// 현재는 모두 mock이다. 실제 이미지 분석·생성을 하지 않는다.
import { getReference, getTestProduct, REFERENCES } from "./data";
import type { CheckItem, CompiledPrompt, Product, Reference, Resolution } from "./types";

export type ImageRole = "product" | "reference";

export interface InputImage {
  role: ImageRole;
  /** mock: 테스트 제품 id (TPROD01~04) */
  test_id?: string;
  /** 업로드 이미지 (data URL). mock은 내용을 분석하지 않는다 */
  data_url?: string;
  name?: string;
}

export interface VisionAdapter {
  analyzeProduct(images: readonly InputImage[]): Promise<Product>;
}

export interface PromptWriterAdapter {
  /** 컴파일된 프롬프트를 다듬는다. 블록 구조·길이 제한은 호출 측에서 다시 확인한다 */
  refine(prompt: CompiledPrompt): Promise<CompiledPrompt>;
}

export interface ImageGenAdapter {
  generate(req: { prompt: string; images: readonly InputImage[]; correction?: string }): Promise<{ id: string; mock: boolean }>;
}

export interface VerifierAdapter {
  verify(req: {
    image_id: string;
    product: Product;
    reference: Reference;
    resolution: Resolution;
    attempt: number;
  }): Promise<CheckItem[]>;
}

export interface ReferenceLibraryAdapter {
  list(): readonly Reference[];
  get(id: string): Reference | undefined;
}

export interface Adapters {
  vision: VisionAdapter;
  writer: PromptWriterAdapter;
  imageGen: ImageGenAdapter;
  verifier: VerifierAdapter;
  library: ReferenceLibraryAdapter;
  /** 모두 mock이면 true (응답·healthz에 표시) */
  mock: boolean;
}

/** 검증 체크리스트 항목. 형태 → 로고·인쇄 → 장면 순 */
export function buildChecklist(product: Product): Array<Omit<CheckItem, "pass">> {
  const shape: Array<Omit<CheckItem, "pass">> = [
    { stage: "shape", item: "형태·비율이 원본과 동일" },
    { stage: "shape", item: "구조·부품(실링·뚜껑 등) 유지" },
  ];
  const logo = (product.protected_elements.length
    ? product.protected_elements
    : ["로고", "패키지 그래픽", "인쇄 문구", "색"]
  ).map((e) => ({ stage: "logo_print" as const, item: `${e} 일치` }));
  const scene: Array<Omit<CheckItem, "pass">> = [
    { stage: "scene", item: "카메라 각도" },
    { stage: "scene", item: "제품 점유율" },
    { stage: "scene", item: "오브제 배치" },
    { stage: "scene", item: "조명 방향" },
    { stage: "scene", item: "배경 구조" },
  ];
  return [...shape, ...logo, ...scene];
}

let mockSeq = 0;

export function createMockAdapters(): Adapters {
  return {
    mock: true,
    vision: {
      async analyzeProduct(images) {
        const img = images.find((i) => i.role === "product");
        if (!img) throw new Error("제품 이미지가 없습니다");
        if (img.test_id) {
          const p = getTestProduct(img.test_id);
          if (!p) throw new Error(`알 수 없는 테스트 제품: ${img.test_id}`);
          return p;
        }
        // mock은 업로드 이미지를 분석하지 않는다
        return {
          id: "UPLOAD",
          name_on_pack: img.name ?? "업로드 제품",
          package_class: null,
          colors: { primary: "unknown", secondary: [] },
          protected_elements: [],
          package_motifs: [],
          risks: ["mock 어댑터는 업로드 이미지를 분석하지 않음"],
        };
      },
    },
    writer: { async refine(prompt) { return prompt; } },
    imageGen: {
      async generate() {
        mockSeq += 1;
        return { id: `mock-image-${mockSeq}`, mock: true };
      },
    },
    verifier: {
      async verify({ product }) {
        // mock: 실제 이미지를 보지 않으므로 모든 항목을 통과로 둔다
        return buildChecklist(product).map((c) => ({ ...c, pass: true }));
      },
    },
    library: { list: () => REFERENCES, get: getReference },
  };
}
