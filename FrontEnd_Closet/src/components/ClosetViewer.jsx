import { useRef } from "react";

const BACKEND = "http://15.165.129.131:3000";

function ClosetViewer() {
  const iframeRef = useRef(null);
  const token = localStorage.getItem("token") || "";

  const base = `${BACKEND}/unity/closet-viewer/index.html`;
  const qs = new URLSearchParams({ apiBase: `${BACKEND}/api`, token });
  const iframeUrl = `${base}?${qs.toString()}`;

  return (
    <div style={{ width: "100%", height: "100%", background: "#231F20" }}>
      <iframe
        ref={iframeRef}
        key={iframeUrl}
        title="Unity Closet Viewer"
        src={iframeUrl}
        width="100%"
        height="100%"
        style={{ border: "none", background: "#231F20", display: "block" }}
        allowFullScreen
        onLoad={() => console.log("✅ Closet iframe 로드 완료")}
        onError={(error) => console.error("❌ Closet iframe 로드 실패:", error)}
      />
    </div>
  );
}

export default ClosetViewer;
