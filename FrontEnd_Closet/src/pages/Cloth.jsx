import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function authHeaders() {
  const token = localStorage.getItem("token") || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function Cloth() {
  const nav = useNavigate();
  const [category, setCategory] = useState("top");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true); setErr("");
      try {
        const res = await fetch(`/api/cloth?category=${encodeURIComponent(category)}`, {
          headers: authHeaders(),
          credentials: "include",
        });
        if (!res.ok) throw new Error(`옷 목록 실패: ${res.status}`);
        const list = await res.json();
        if (!cancel) setItems(list || []);
      } catch (e) {
        if (!cancel) setErr(e.message || "불러오기 실패");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [category]);

  return (
    <div style={{ padding: 16 }}>
      <h2>My Closet – {category === "top" ? "Top" : "Bottom"}</h2>

      <div style={{ display:"flex", gap:8, margin:"10px 0 16px" }}>
        <button onClick={()=>setCategory("top")}    style={{ padding:"6px 10px" }}>Top</button>
        <button onClick={()=>setCategory("bottom")} style={{ padding:"6px 10px" }}>Bottom</button>
      </div>

      {loading && <div>Loading…</div>}
      {err && <div style={{ color:"#ff6b6b" }}>{err}</div>}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px,1fr))", gap:12 }}>
        {items.map(it => (
          <div key={it._id} style={{ border:"1px solid #333", borderRadius:10, overflow:"hidden" }}>
            <div style={{ width:"100%", height:140, background:"#0f1116" }}>
              {it.imageUrlFront
                ? <img
                    alt={it.name || it._id}
                    src={it.imageUrlFront.startsWith("http")
                          ? it.imageUrlFront
                          : `/api/images/cloth/${it.userId}/${it._id}/${it.imageUrlFront}`}
                    style={{ width:"100%", height:"100%", objectFit:"cover" }}
                  />
                : <div style={{ width:"100%", height:"100%", display:"grid", placeItems:"center", color:"#888" }}>no image</div>
              }
            </div>
            <div style={{ padding:10 }}>
              <div style={{ fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {it.name || "Untitled"}
              </div>
              <div style={{ fontSize:12, opacity:.8, margin:"6px 0" }}>
                {it.category}/{it.subCategory || "-"}
              </div>
              <button onClick={()=>nav(`/cloth/${it._id}/view`)} style={{ padding:"6px 8px" }}>
                뷰어로 보기
              </button>
            </div>
          </div>
        ))}
      </div>

      {!loading && !items.length && !err && (
        <div style={{ marginTop:16, opacity:.7 }}>해당 카테고리의 의상이 없습니다.</div>
      )}
    </div>
  );
}