// src/components/UnityViewer.jsx
function UnityViewer({ modelUrl }) {
  const iframeSrc = `http://15.165.129.131:3000/unity-viewer/index.html?model=${encodeURIComponent(modelUrl)}`;

  return (
    <div style={{ width: "100%", height: "100%", border: "1px solid #333", backgroundColor: "#231F20" }}>
      <iframe
        title="Unity 3D Viewer"
        src={iframeSrc}
        width="100%"
        height="100%"
        style={{ border: "none" }}
        allowFullScreen
      ></iframe>
    </div>
  );
}

export default UnityViewer;
