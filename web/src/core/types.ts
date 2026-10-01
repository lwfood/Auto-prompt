// 코어 타입. web과 mcp가 함께 쓴다.

export type Judgment = "LOCK" | "ADAPT" | "CONDITIONAL" | "REPLACE";
export type Priority = "P1" | "P2" | "P3" | "P4" | "P5";

export interface PackageClass {
  id: string;
  example: string;
  elevation_deg: [number, number];
  note: string;
}

export interface Product {
  id: string;
  file?: string;
  size_px?: [number, number];
  name_on_pack: string;
  /** mock 어댑터에서 분석하지 못한 업로드 제품은 null */
  package_class: string | null;
  view?: string;
  colors: { primary: string; secondary: string[] };
  protected_elements: string[];
  package_motifs: string[];
  risks: string[];
  /** 프롬프트·화면용 한국어 표기 */
  ko?: { name: string; primary: string; secondary: string[]; motifs: string[] };
}

export interface ReferenceProp {
  slot: string;
  content: string;
}

export interface Reference {
  id: string;
  file: string;
  size_px: [number, number];
  aspect: string;
  art_direction: string;
  source: string;
  camera: { elevation_deg: number; azimuth: string; lens_feel: string };
  composition: {
    product_count: number;
    product_position: string;
    product_occupancy: string;
    layout: string;
  };
  background: { wall_color: string; floor_color: string; structure: string };
  lighting: { type: string; direction: string; shadow: string };
  pedestal: { present: boolean; shape?: string; color?: string };
  props: ReferenceProp[];
  people_or_hands: boolean;
  /** 구조 변경 연출. core=true면 핵심 연출(후보 제외), 아니면 부수적(REPLACE + 감점) */
  structure_tricks: Array<string | { name: string; core: boolean }>;
  exclude_elements: string[];
  notes?: string;
  /** 사용자가 PC에서 올린 레퍼런스 (mock은 분석하지 않는다) */
  uploaded?: boolean;
  /** 프롬프트·화면용 한국어 표기 */
  ko?: ReferenceKo;
}

export interface ReferenceKo {
  name: string;
  azimuth: string;
  position: string;
  lighting_type: string;
  lighting_direction: string;
  shadow: string;
  structure: string;
  wall_color: string | null;
  floor_color: string;
  pedestal_shape?: string;
  pedestal_color?: string;
  props: Array<{ slot: string; short: string }>;
  exclude_elements: string[];
}

/** USP 한 개 = 시안 한 개. 레퍼런스는 라이브러리 id 또는 PC 업로드, 없으면 자동 */
export interface UspInput {
  text: string;
  reference_id?: string;
  reference_upload?: boolean;
}

/** 시안별 오브제·소품·색상 수정 (제품 자체는 바뀌지 않는다) */
export interface Overrides {
  props?: string;
  colors?: string;
}

export type ConflictId =
  | "X1" | "X2" | "X3" | "X4" | "X5" | "X6" | "X7" | "X8" | "X9" | "X10" | "X11";

export interface ConflictLogEntry {
  id: ConflictId;
  judgment: Judgment | null;
  detail: string;
}

export type DirectionId = "USP" | "HERO" | "PACKAGE";

export interface DraftOptions {
  /** 사용자 지정 종횡비 (X9). 예: "1:1" */
  aspect?: string;
  /** 단상 제거 요청 (CONDITIONAL) */
  remove_pedestal?: boolean;
  /** 사용자 수정사항 (X11). P1 훼손 항목은 제외·경고 */
  notes?: string[];
  /** 이 시안의 USP 문구 */
  usp?: string;
  overrides?: Overrides;
  /** 로고 확대·제품 형태 보조 이미지가 있는지 */
  has_support_images?: boolean;
}

export interface Resolution {
  /** null = 업로드한 레퍼런스와 같은 비율 */
  aspect: string | null;
  aspect_source: "reference" | "user";
  /** null = 업로드한 레퍼런스를 따름 */
  camera_elevation_deg: number | null;
  camera_clamped: boolean;
  product_count: 1;
  pedestal: { keep: boolean; shape?: string; color?: string };
  contrast_guard: boolean;
  props: { slots: string[]; contents: string[]; grounded: boolean };
  people_or_hands: boolean;
  exclude: string[];
  accepted_notes: string[];
  rejected_notes: Array<{ note: string; reason: string }>;
  overrides: Overrides;
  log: ConflictLogEntry[];
}

export interface CompiledPrompt {
  text: string;
  length: number;
  blocks: { integrity: string; scene: string; adapt: string; exclude: string };
  trimmed: boolean;
  summary_ko: string[];
  checklist: Array<{ label: string; pass: boolean }>;
}

export type CheckStage = "shape" | "logo_print" | "scene";

export interface CheckItem {
  stage: CheckStage;
  item: string;
  pass: boolean;
}

export interface VerificationResult {
  checks: CheckItem[];
  shape_pass: boolean;
  logo_pass: boolean;
  scene_ratio: number;
  scene_pass: boolean;
  pass: boolean;
  /** 실패한 첫 단계 (형태 → 로고·인쇄 → 장면 순) */
  failed_stage: CheckStage | null;
}

export interface Draft {
  index: number;
  direction: DirectionId;
  /** USP 기준 시안이면 USP 번호(0부터)와 문구 */
  usp: { index: number; text: string } | null;
  reference_id: string;
  reference_name: string;
  reference_uploaded: boolean;
  match_score: number;
  prompt: CompiledPrompt;
  background_color: string;
  image: { id: string; mock: boolean } | null;
  verification: VerificationResult | null;
  corrected: boolean;
  remaining_issues: string[];
  warnings: string[];
  resolution: Resolution;
  status: "done" | "failed";
  error?: string;
}
