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
  usp?: string;
}

export interface Resolution {
  aspect: string;
  aspect_source: "reference" | "user";
  camera_elevation_deg: number;
  camera_clamped: boolean;
  product_count: 1;
  pedestal: { keep: boolean; shape?: string; color?: string };
  contrast_guard: boolean;
  props: { slots: string[]; contents: string[]; grounded: boolean };
  people_or_hands: boolean;
  exclude: string[];
  accepted_notes: string[];
  rejected_notes: Array<{ note: string; reason: string }>;
  log: ConflictLogEntry[];
}

export interface CompiledPrompt {
  text: string;
  length: number;
  blocks: { integrity: string; scene: string; adapt: string; exclude: string };
  trimmed: boolean;
  summary_ko: string[];
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
  reference_id: string;
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
