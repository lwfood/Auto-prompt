"use client";
// S1 · 입력 (Figma 646:146)
import { getReference, INPUT_LIMITS, TEST_PRODUCTS, USP_MAX } from "@/core";
import { canAddProductImage, canStart, draftCount, type AppState, type UspField } from "../state";
import { Dropzone, NoticeBanner, PageTitle, useFilePicker, type AppEnv } from "./common";

interface Props {
  s: AppState;
  set: (patch: Partial<AppState>) => void;
  env: AppEnv;
  busy: boolean;
  onCreate: () => void;
  onPickLibrary: (uspIndex: number) => void;
  onError: (m: string) => void;
}

export function InputScreen({ s, set, env, busy, onCreate, onPickLibrary, onError }: Props) {
  const addProduct = useFilePicker((f) => set({ productImages: [...s.productImages, f] }), onError);
  const startable = canStart(s);
  const sampleId = s.productImages.find((p) => p.test_id)?.test_id;

  const setUsp = (i: number, patch: Partial<UspField>) =>
    set({ usps: s.usps.map((u, k) => (k === i ? { ...u, ...patch } : u)) });

  return (
    <div className="body">
      <PageTitle title="제품 정보를 입력해요" description="제품 이미지 1장이면 시작할 수 있어요. USP는 선택이고, USP 번호가 곧 시안 번호가 돼요." />
      <div className="columns">
        <div className="col">
          <section className="card" aria-labelledby="product-info">
            <p className="card-title" id="product-info">제품 정보</p>
            <label className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <span className="label">제품명 (선택)</span>
              <div className="input">
                <input
                  value={s.productName}
                  maxLength={INPUT_LIMITS.text_max}
                  placeholder="예: 위즐 바닐라 모나카"
                  onChange={(e) => set({ productName: e.target.value })}
                />
              </div>
            </label>
          </section>

          <section className="card" aria-labelledby="product-images">
            <div>
              <p className="card-title" id="product-images">제품 이미지</p>
              <p className="card-desc">필수 1장 · 고화질의 정면 또는 평면 사진이면 충분해요. 로고 확대·제품 형태는 검증 정확도를 높이는 보조 이미지예요.</p>
            </div>
            <div className="upload-row">
              <div className="upload-field">
                <div className="upload-label">제품 이미지<span className="tag tag-required">필수</span></div>
                {s.productImages.length > 0 && (
                  <div className="image-list">
                    {s.productImages.map((p, i) => (
                      <div className="image-item" key={i}>
                        <img src={p.data_url ?? env.assetUrl("product", p.test_id!)} alt="" />
                        <span title={p.name}>{p.name}</span>
                        <button className="icon-btn" aria-label={`${p.name} 삭제`} onClick={() => set({ productImages: s.productImages.filter((_, k) => k !== i) })}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <button className="btn btn-dark btn-lg" disabled={!canAddProductImage(s)} onClick={addProduct.open}>이미지 추가</button>
                {addProduct.input}
              </div>
              <Dropzone
                label="로고 확대"
                value={s.logo ? { src: s.logo.data_url ?? "", name: s.logo.name } : null}
                onChange={(v) => set({ logo: v })}
                onError={onError}
              />
              <Dropzone
                label="제품 형태"
                value={s.shape ? { src: s.shape.data_url ?? "", name: s.shape.name } : null}
                onChange={(v) => set({ shape: v })}
                onError={onError}
              />
            </div>
            <div className="samples">
              <span className="muted">샘플 제품으로 체험하기</span>
              {TEST_PRODUCTS.map((p) => (
                <button
                  key={p.id}
                  className="sample-chip"
                  aria-pressed={sampleId === p.id}
                  onClick={() => set({ productImages: [{ test_id: p.id, name: p.file ?? p.id }], logo: null, shape: null, productName: s.productName || (p.ko?.name ?? "") })}
                >
                  {p.ko?.name ?? p.name_on_pack}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="col">
          <div className="section-head">
            <strong>USP</strong>
            <span>선택 · 최대 3개 · 입력하지 않아도 진행할 수 있어요.</span>
          </div>
          {s.usps.map((u, i) => (
            <UspCard
              key={i}
              index={i}
              usp={u}
              env={env}
              onText={(text) => setUsp(i, { text })}
              onReference={(reference) => setUsp(i, { reference })}
              onPickLibrary={() => onPickLibrary(i)}
              onDelete={i > 0 ? () => set({ usps: s.usps.filter((_, k) => k !== i) }) : undefined}
              onError={onError}
            />
          ))}
          {s.usps.length < USP_MAX && (
            <button className="add-tile" onClick={() => set({ usps: [...s.usps, { text: "", reference: null }] })}>
              + USP 추가 ({s.usps.length}/{USP_MAX})
            </button>
          )}
          <div className="cta">
            <button className="btn btn-accent btn-xl" disabled={!startable || busy} onClick={onCreate}>
              {busy ? "만드는 중…" : "프롬프트 만들기"}
            </button>
            <p className="muted">
              {startable ? `시안 ${draftCount(s.usps)}개가 만들어져요` : `제품 이미지를 올리면 시작할 수 있어요 · 시안 ${draftCount(s.usps)}개가 만들어져요`}
            </p>
          </div>
        </div>
      </div>
      <NoticeBanner label="기본 동작">
        아무것도 고르지 않으면 라이브러리에서 제품에 어울리는 레퍼런스를 자동으로 골라요. USP를 쓰면 USP에 어울리는 레퍼런스를 고르고, 레퍼런스를 직접 지정하면 그 USP의 시안에 그대로 써요. USP가 없으면 히어로 → 패키지 분석 순으로 2개를 만들어요.
      </NoticeBanner>
      <label className="demo-switch">
        <input type="checkbox" checked={s.imageApi} onChange={(e) => set({ imageApi: e.target.checked })} />
        시연 설정 · 이미지 생성 API 연결로 보기 (현재 mock — 실제 이미지는 만들지 않고 결과 화면 흐름만 보여요)
      </label>
    </div>
  );
}

function UspCard({
  index, usp, env, onText, onReference, onPickLibrary, onDelete, onError,
}: {
  index: number;
  usp: UspField;
  env: AppEnv;
  onText: (t: string) => void;
  onReference: (r: UspField["reference"]) => void;
  onPickLibrary: () => void;
  onDelete?: () => void;
  onError: (m: string) => void;
}) {
  const pc = useFilePicker((f) => onReference({ kind: "upload", ...f }), onError);
  const ref = usp.reference;
  const libRef = ref?.kind === "library" ? getReference(ref.id) : undefined;
  return (
    <section className="usp-card" aria-label={`USP ${index + 1}`}>
      <div className="usp-head">
        <strong>USP {index + 1}</strong>
        {onDelete && <button className="link" onClick={onDelete}>삭제</button>}
      </div>
      <div className="input">
        <input
          value={usp.text}
          maxLength={INPUT_LIMITS.usp_max}
          placeholder="예: 우유 함량 20%의 부드러운 바닐라"
          aria-label={`USP ${index + 1} 문구`}
          onChange={(e) => onText(e.target.value)}
        />
        <span className="count">{usp.text.length}/{INPUT_LIMITS.usp_max}</span>
      </div>
      <div className="ref-row">
        <span>레퍼런스</span>
        {!ref && (
          <>
            <button className="btn btn-outline" onClick={onPickLibrary}>라이브러리 선택</button>
            <button className="btn btn-outline" onClick={pc.open}>내 PC</button>
            <span>고르지 않으면 자동으로 골라요</span>
          </>
        )}
        {ref && (
          <div className="ref-chip">
            {ref.kind === "library" ? <img src={env.assetUrl("reference", ref.id)} alt="" /> : <img src={ref.data_url} alt="" />}
            <span>{ref.kind === "library" ? `${ref.id} · ${libRef?.ko?.name ?? ""}` : `내 PC · ${ref.name}`}</span>
            <button className="link" onClick={ref.kind === "library" ? onPickLibrary : pc.open}>변경</button>
            <button className="icon-btn" aria-label="레퍼런스 지정 해제" onClick={() => onReference(null)}>✕</button>
          </div>
        )}
        {pc.input}
      </div>
      {!usp.text.trim() && ref && <p className="small">USP 문구를 써야 이 레퍼런스가 시안에 쓰여요.</p>}
    </section>
  );
}
