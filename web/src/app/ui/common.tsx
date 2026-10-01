"use client";
// 공통 컴포넌트 (Figma: App Header, Step Indicator, Page Title, Notice Banner, Upload Dropzone)
import { useRef, useState, type ReactNode } from "react";

export interface RunResult {
  ok: boolean;
  status: number;
  data: any;
}

/** 서버(/api/run) 또는 브라우저 안 데모가 같은 형태로 제공한다 */
export interface AppEnv {
  run(body: unknown): Promise<RunResult>;
  /** 레퍼런스·샘플 제품 이미지 주소 */
  assetUrl(kind: "reference" | "product", id: string): string;
  /** 파일 내려받기 링크를 쓸 수 있는지 (데모 페이지는 새 탭으로 연다) */
  canDownload?: boolean;
}

export type StepState = "done" | "current" | "todo";

export function AppHeader({
  steps,
  onLibrary,
}: {
  steps: Array<{ label: string; state: StepState }>;
  onLibrary?: () => void;
}) {
  return (
    <header className="app-header">
      <div className="side">
        <div className="brand"><div className="logo-mark" /><span>Reference Image Director</span></div>
      </div>
      <nav className="steps" aria-label="진행 단계">
        {steps.map((s, i) => (
          <div key={s.label} className="row" style={{ gap: 12, flexWrap: "nowrap" }}>
            {i > 0 && <div className={`step-connector${s.state !== "todo" ? " done" : ""}`} />}
            <div className={`step ${s.state}`} aria-current={s.state === "current" ? "step" : undefined}>
              <span className="dot">{s.state === "done" ? "✓" : i + 1}</span>
              <span className="label-text">{s.label}</span>
            </div>
          </div>
        ))}
      </nav>
      <div className="side end">
        {onLibrary && <button className="btn btn-outline header-lib" onClick={onLibrary}>Reference Library</button>}
        <div className="avatar" aria-hidden>AB</div>
      </div>
    </header>
  );
}

export function LibraryHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="app-header">
      <div className="side"><div className="brand"><div className="logo-mark" /><span>Reference Image Director</span></div></div>
      <div className="header-title">Reference Library</div>
      <div className="side end">
        <button className="btn btn-outline" onClick={onBack}>← 돌아가기</button>
        <div className="avatar" aria-hidden>AB</div>
      </div>
    </header>
  );
}

export function PageTitle({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  const body = (
    <div className="page-title">
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
  return children ? <div className="title-row">{body}{children}</div> : body;
}

export function NoticeBanner({ label, children, tone = "info" }: { label: string; children: ReactNode; tone?: "info" | "warn" }) {
  return (
    <div className={`notice${tone === "warn" ? " warn" : ""}`} role={tone === "warn" ? "alert" : "note"}>
      <strong>{label}</strong>
      <p>{children}</p>
    </div>
  );
}

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export const ACCEPT = "image/png,image/jpeg,image/webp";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** 파일 선택 버튼 (숨긴 input) */
export function useFilePicker(onFile: (f: { data_url: string; name: string }) => void, onError: (m: string) => void) {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      accept={ACCEPT}
      className="sr-only"
      tabIndex={-1}
      onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        if (f.size > MAX_FILE_BYTES) return onError("이미지는 10MB까지 올릴 수 있어요.");
        onFile({ data_url: await readAsDataUrl(f), name: f.name });
      }}
    />
  );
  return { open: () => ref.current?.click(), input };
}

/** 업로드 영역 (Figma Upload Dropzone S). 올린 뒤에는 미리보기와 삭제 버튼 */
export function Dropzone({
  label,
  required,
  value,
  onChange,
  onError,
}: {
  label: string;
  required?: boolean;
  value: { src: string; name: string } | null;
  onChange: (v: { data_url: string; name: string } | null) => void;
  onError: (m: string) => void;
}) {
  const [drag, setDrag] = useState(false);
  const picker = useFilePicker(onChange, onError);
  return (
    <div className="upload-field">
      <div className="upload-label">
        {label}
        <span className={`tag ${required ? "tag-required" : "tag-optional"}`}>{required ? "필수" : "선택"}</span>
      </div>
      <div
        className={`dropzone${drag ? " drag" : ""}`}
        role="button"
        tabIndex={0}
        aria-label={`${label} 올리기`}
        onClick={() => !value && picker.open()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !value && picker.open()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (!f) return;
          if (!ACCEPT.split(",").includes(f.type)) return onError("PNG, JPG, WEBP 이미지만 올릴 수 있어요.");
          if (f.size > MAX_FILE_BYTES) return onError("이미지는 10MB까지 올릴 수 있어요.");
          onChange({ data_url: await readAsDataUrl(f), name: f.name });
        }}
      >
        {value ? (
          <>
            <img className="preview" src={value.src} alt={value.name} />
            <button className="remove" aria-label={`${label} 삭제`} onClick={(e) => { e.stopPropagation(); onChange(null); }}>✕</button>
          </>
        ) : (
          <>
            {/* Figma 'File download' 아이콘은 에셋 서버 접근이 막혀 글리프로 대체 (확인 필요) */}
            <span aria-hidden style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>↓</span>
            <span className="title">이미지 올리기</span>
            <span className="hint">PNG, JPG · 10MB</span>
          </>
        )}
      </div>
      {picker.input}
    </div>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 클립보드 권한이 없는 환경(일부 iframe)용 대체 방법
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
