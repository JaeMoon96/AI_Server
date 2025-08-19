import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

const REQUIRED_UMA_KEYS = ["uma_height","uma_belly","uma_waist","uma_width","uma_fore_arm","uma_arm","uma_legs"];

function authHeaders() {
  const token = localStorage.getItem("token") || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ClothViewer() {
  const { id } = useParams();
  const nav = useNavigate();
  const iframeRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [hasUma, setHasUma] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setErr("");

        // 1) 단일 outfit
        const r1 = await fetch(`/api/cloth/outfits/${id}`, { headers: authHeaders(), credentials:"include" });
        if (!r1.ok) throw new Error(`Outfit 실패: ${r1.status}`);
        const outfit = await r1.json();

        // 2) UMA (있으면 함께 전송)
        let uma = null;
        try {
          const r2 = await fetch("/api/mannequin/uma", { headers: authHeaders(), credentials:"include" });
          if (r2.ok) {
            const ures = await r2.json();
            const u = ures?.umaData || ures?.summary || ures || {};
            const ok = REQUIRED_UMA_KEYS.every(k => Number.isFinite(parseFloat(u[k])));
            if (ok) uma = u; else setHasUma(false);
          } else setHasUma(false);
        } catch { setHasUma(false); }

        const token = localStorage.getItem("token") || "";
        const iframe = iframeRef.current;
        const send = () => {
          if (uma) {
            iframe.contentWindow?.postMessage({ type:"unity:init", payload:{ uma, outfits:[outfit] }, token }, "*");
          } else {
            iframe.contentWindow?.postMessage({ type:"unity:outfits", outfits:[outfit], token }, "*");
          }
          if (!cancelled) setLoading(false);
        };

        try {
          if (iframe.contentWindow?.document?.readyState === "complete") send();
          else iframe.addEventListener("load", send, { once: true });
        } catch {
          iframe.addEventListener("load", send, { once: true });
        }
      } catch (e) {
        if (!cancelled) { setErr(e.message || "로드 실패"); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <div style={{ height:"100%", display:"grid", gridTemplateRows:"auto 1fr", gap:8, padding:12 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <button onClick={()=>nav(-1)} style={{ padding:"6px 10px" }}>← 뒤로</button>
        <strong>Cloth Viewer</strong>
        {loading && <span style={{ fontSize:12, opacity:.7 }}>loading…</span>}
        {err && <span style={{ color:"#ff6b6b", fontSize:12 }}>{err}</span>}
        {!loading && !err && !hasUma && <span style={{ marginLeft:"auto", fontSize:12, opacity:.8 }}>UMA 없음</span>}
      </div>

      <div style={{ border:"1px solid #333", background:"#231F20", borderRadius:8, overflow:"hidden" }}>
        {/* 필요 시 아래 경로를 실제 빌드 위치로 변경 */}
        <iframe
          ref={iframeRef}
          src="/ClothViewer/ClothViewer/index.html"
          title="Unity ClothViewer"
          width="100%"
          height="100%"
          style={{ border:"none", minHeight:540 }}
          allow="autoplay; fullscreen; xr-spatial-tracking"
        />
      </div>
    </div>
  );
}