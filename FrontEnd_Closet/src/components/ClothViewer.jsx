// src/components/ClothViewer.jsx
import React, {forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState} from "react";
import PropTypes from "prop-types";

/**
 * 안전한 postMessage 브릿지 기반 Unity 의류 뷰어 iframe
 * - 부모 → 자식: postMessage({ type: 'changeClothing' | 'LOAD_OUTFIT', outfitId })
 * - 자식 → 부모:
 *    - 문자열: "unityReady" | "outfitsLoaded:N" | "outfitChanged:<id>" | "serverUrlChanged:<url>" | "error:<msg>"
 *    - 객체:   { type: "UNITY_CLOTH_CHANGED", outfitId }
 */
const ClothViewer = forwardRef(function ClothViewer(
  {
    viewerUrl = "http://15.165.129.131:9001/index.html",
    apiBase   = "http://15.165.129.131:3000/api",
    token     = null,                   // 없으면 localStorage.token 사용 시도
    initialOutfitId = null,            // 최초 로드시 선택할 아이템
    className = "",
    style     = { width: "100%", height: "100%" },
    onReady,
    onClothingChanged,
    showDebug = process.env.NODE_ENV === "development",
  },
  ref
) {
  const iframeRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [outfitCount, setOutfitCount] = useState(null);
  const messageQueue = useRef([]); // ready 이전 메시지 큐

  const effectiveToken = useMemo(() => token || (typeof window !== "undefined" ? localStorage.getItem("token") : ""), [token]);

  // iframe src 구성 (뷰어 스크립트가 query param 읽음)
  const src = useMemo(() => {
    const qs = new URLSearchParams();
    if (apiBase) qs.set("apiBase", apiBase);
    if (effectiveToken) qs.set("token", effectiveToken);
    if (initialOutfitId) {
      // 구현체별 키 호환: 둘 다 넣어줌
      qs.set("outfitId", initialOutfitId);
      qs.set("selectedId", initialOutfitId);
    }
    return `${viewerUrl}?${qs.toString()}`;
  }, [viewerUrl, apiBase, effectiveToken, initialOutfitId]);

  const viewerOrigin = useMemo(() => {
    try { return new URL(src).origin; } catch { return "*"; }
  }, [src]);

  // 내부 전송 함수 (ready 전이면 큐에 쌓음)
  const postToViewer = (payload) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    if (!ready) {
      messageQueue.current.push(payload);
      return;
    }
    win.postMessage(payload, viewerOrigin === "null" ? "*" : viewerOrigin);
  };

  // 부모가 호출할 수 있는 공개 API
  useImperativeHandle(ref, () => ({
    changeOutfit: (outfitId) => {
      if (!outfitId) return;
      // 구현체 호환을 위해 두 타입 모두 전송
      postToViewer({ type: "changeClothing", outfitId });
      postToViewer({ type: "LOAD_OUTFIT",    outfitId });
    },
    reloadOutfits: () => postToViewer({ type: "RELOAD_OUTFITS" }),
    ping: () => postToViewer({ type: "PING" }),
    isReady: () => ready,
  }), [ready]);

  // 자식 → 부모 이벤트 수신
  useEffect(() => {
    const handler = (event) => {
      // 오리진 확인 (필요 시 완화하려면 주석 처리)
      if (viewerOrigin !== "*" && event.origin !== viewerOrigin) return;

      const { data } = event;
      if (typeof data === "string") {
        if (data === "unityReady") {
          setReady(true);
          // 큐 플러시
          const win = iframeRef.current?.contentWindow;
          while (messageQueue.current.length && win) {
            const p = messageQueue.current.shift();
            win.postMessage(p, viewerOrigin === "null" ? "*" : viewerOrigin);
          }
          onReady && onReady();
          return;
        }

        if (data.startsWith("outfitsLoaded:")) {
          const n = Number(data.split(":")[1] || "0");
          setOutfitCount(Number.isFinite(n) ? n : null);
          return;
        }

        if (data.startsWith("outfitChanged:")) {
          const id = data.split(":")[1];
          onClothingChanged && onClothingChanged(id);
          return;
        }

        if (data.startsWith("serverUrlChanged:")) {
          if (showDebug) console.debug("viewer server url:", data.split(":")[1]);
          return;
        }

        if (data.startsWith("error:")) {
          console.error("[ClothViewer] child error:", data.slice(6));
          return;
        }
      }

      // 객체 프로토콜 처리
      if (data && typeof data === "object") {
        if (data.type === "UNITY_READY" || data.type === "unityReady") {
          setReady(true);
          const win = iframeRef.current?.contentWindow;
          while (messageQueue.current.length && win) {
            const p = messageQueue.current.shift();
            win.postMessage(p, viewerOrigin === "null" ? "*" : viewerOrigin);
          }
          onReady && onReady();
        } else if (data.type === "UNITY_CLOTH_CHANGED" && data.outfitId) {
          onClothingChanged && onClothingChanged(data.outfitId);
        }
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onReady, onClothingChanged, viewerOrigin, showDebug]);

  // iframe 로드 후 초기 핑(선택)
  const onIframeLoad = () => {
    // 일부 빌드는 첫 메시지 전송 전까지 부모와 동기화가 늦을 수 있어 PING
    postToViewer({ type: "PING" });
  };

  return (
    <div className={`cloth-viewer-frame ${className}`} style={{ position: "relative", ...style }}>
      <iframe
        ref={iframeRef}
        src={src}
        title="Cloth Viewer"
        // sandbox는 보안 강화를 위해 유지; allow-same-origin은 자식이 자기 오리진 권한 유지
        sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups"
        allow="autoplay; fullscreen; xr-spatial-tracking; gamepad"
        style={{ border: "0", width: "100%", height: "100%" }}
        onLoad={onIframeLoad}
      />
      {showDebug && (
        <div style={{
          position: "absolute",
          top: 8, right: 8,
          background: "rgba(0,0,0,0.7)",
          color: "#fff",
          padding: "8px 10px",
          borderRadius: 8,
          fontSize: 12,
          pointerEvents: "none",
          zIndex: 10,
        }}>
          <div><b>ClothViewer</b></div>
          <div>ready: {String(ready)}</div>
          <div>outfits: {outfitCount ?? "-"}</div>
          <div style={{maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
            {src}
          </div>
        </div>
      )}
    </div>
  );
});

ClothViewer.propTypes = {
  viewerUrl: PropTypes.string,
  apiBase: PropTypes.string,
  token: PropTypes.string,
  initialOutfitId: PropTypes.string,
  className: PropTypes.string,
  style: PropTypes.object,
  onReady: PropTypes.func,
  onClothingChanged: PropTypes.func,
  showDebug: PropTypes.bool,
};

export default ClothViewer;
