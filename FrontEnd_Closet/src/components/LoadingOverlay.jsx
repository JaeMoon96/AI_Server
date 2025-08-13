import ReactDOM from "react-dom";
import "./loadingOverlay.css";

function LoadingOverlay({ message }) {
  return ReactDOM.createPortal(
    <div className="loading-overlay">
      <div className="spinner" />
      <p>{message}</p>
    </div>,
    document.getElementById("modal-root") // 이걸로 root 밖으로 렌더링
  );
}

export default LoadingOverlay;
