import { useRef } from "react";

const BACKEND = "http://15.165.129.131:3000";

function AvatarViewer() {
  const iframeRef = useRef(null);
  const token = localStorage.getItem("token") || "";

  const iframeUrl = `${BACKEND}/unity/avatar-viewer/index.html?token=${encodeURIComponent(token)}&apiBase=${BACKEND}/api`;

  return (
    <div style={{ width: "100%", height: "100%", background: "#231F20" }}>
      <iframe
        ref={iframeRef}
        title="Unity Avatar Viewer"
        src={iframeUrl}
        width="100%"
        height="100%"
        style={{ border: "none", display: "block", background: "#231F20" }}
        allowFullScreen
      />
    </div>
  );
}

export default AvatarViewer;
