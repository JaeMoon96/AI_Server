import { useEffect, useState } from "react";
import "./mannequinRegisterPage.css";
import LoadingOverlay from "../components/LoadingOverlay";

function MannequinRegisterPage({ onSuccess }) {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);   // 전체 프로세스 로딩
  const [polling, setPolling] = useState(false);   // 상태 조회 중 여부

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    console.log(`[Frontend] 파일 선택됨:`, file?.name);
    setImage(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  };

  const safeGetUserIdFromToken = () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return null;
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload?.id || null;
    } catch {
      return null;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!image) {
      alert("이미지를 선택해주세요.");
      return;
    }

    console.log(`[Frontend] 마네킹 생성 요청 시작`);

    const formData = new FormData();
    formData.append("mannequin", image);
    formData.append("exif_mode", "inplace");
    formData.append("no_smplifyx", "false");

    const token = localStorage.getItem("token");

    setLoading(true); // 전체 프로세스 시작 → 로딩 ON
    try {
      console.log(`[Frontend] 백엔드 API 호출 중...`);
      const res = await fetch("http://15.165.129.131:3000/api/mannequin/make-3d", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      let data = null;
      try { data = await res.json(); } catch {}

      if (!res.ok) {
        console.error(`[Frontend] 요청 실패:`, data);
        alert("생성 실패: " + (data?.message || `HTTP ${res.status}`));
        setLoading(false); // 업로드 단계에서 실패 → 전체 종료
        return;
      }

      console.log(`[Frontend] 요청 성공! 사용자 키: ${data.user_height}cm로 아바타 생성 시작`);
      console.log(`[Frontend] Job ID: ${data.job_id}`);

      // 업로드는 끝났지만 전체 프로세스는 아직 진행 중 → 로딩 유지, 폴링 시작
      setPolling(true);
    } catch (err) {
      console.error("[Frontend] 업로드 오류", err);
      alert("서버 오류 발생");
      setLoading(false); // 업로드 단계 예외 → 전체 종료
    }
    // finally 없음: 전체 프로세스가 끝날 때까지 로딩 유지
  };

  useEffect(() => {
    if (!polling) return;

    console.log(`[Frontend] 상태 폴링 시작`);

    const userId = safeGetUserIdFromToken();
    if (!userId) {
      console.error("[Frontend] 토큰에서 userId를 추출하지 못했습니다.");
      setPolling(false);
      setLoading(false); // 진행 불가 → 전체 종료
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      console.error("[Frontend] 토큰이 없습니다.");
      setPolling(false);
      setLoading(false); // 진행 불가 → 전체 종료
      alert("로그인이 필요합니다.");
      return;
    }

    const controller = new AbortController();
    let attempts = 0;
    const maxAttempts = 240; // 12분 (3초 * 240)

    const interval = setInterval(async () => {
      attempts += 1;
      try {
        console.log(`[Frontend] 상태 확인 중... (${attempts}/${maxAttempts})`);

        const res = await fetch(
          `http://15.165.129.131:3000/api/mannequin/status?userId=${userId}`,
          {
            signal: controller.signal,
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!res.ok) {
          if (res.status === 401) {
            clearInterval(interval);
            setPolling(false);
            setLoading(false); // 전체 종료
            alert("로그인이 만료되었거나 권한이 없습니다. 다시 로그인해주세요.");
            return;
          }
          if (res.status === 404) {
            console.warn("[Frontend] 작업을 찾을 수 없음 (404)");
            clearInterval(interval);
            setPolling(false);
            setLoading(false); // 전체 종료
            alert("생성 작업을 찾을 수 없습니다. 다시 시도해주세요.");
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        console.log(`[Frontend] 현재 상태: ${data.status}`);

        switch (data.status) {
          case "completed": {
            console.log(`[Frontend] 3D 마네킹 생성 완료!`);
            console.log(`[Frontend] 결과 파일들:`, data.resultFiles);
            clearInterval(interval);
            setPolling(false);
            setLoading(false); // 전체 프로세스 완료 → 로딩 OFF
            alert("3D 마네킹 생성 완료!");
            onSuccess?.(data.resultFiles);
            return;
          }
          case "failed": {
            console.error(`[Frontend] 생성 실패: ${data.error}`);
            clearInterval(interval);
            setPolling(false);
            setLoading(false); // 전체 종료
            alert("생성 실패: " + (data.error || "Unknown error"));
            return;
          }
          case "not_found": {
            console.warn("[Frontend] 작업을 찾을 수 없음 (not_found)");
            clearInterval(interval);
            setPolling(false);
            setLoading(false); // 전체 종료
            alert("생성 작업을 찾을 수 없습니다. 다시 시도해주세요.");
            return;
          }
          case "processing":
          default:
            // 계속 대기
            break;
        }

        if (attempts >= maxAttempts) {
          console.error("[Frontend] 타임아웃");
          clearInterval(interval);
          setPolling(false);
          setLoading(false); // 전체 종료
          alert("처리가 너무 오래 걸립니다. 잠시 후 다시 확인해주세요.");
        }
      } catch (err) {
        console.error("[Frontend] 상태 조회 실패", err);
        clearInterval(interval);
        setPolling(false);
        setLoading(false); // 전체 종료
        alert("상태 조회 중 오류가 발생했습니다.");
      }
    }, 3000);

    return () => {
      console.log(`[Frontend] 상태 폴링 정리`);
      controller.abort();
      clearInterval(interval);
    };
  }, [polling, onSuccess]);

  return (
    <div className="MannequinRegisterPage">
      {loading && (
        <LoadingOverlay
          message={polling ? "Making New Mannequin..." : "Uploading & Queuing Job..."}
        />
      )}

      <h2 className="MannequinTitle">ENROLL MANNEQUIN</h2>

      <form onSubmit={handleSubmit} className="formWrapper">
        <input
          type="file"
          name="mannequin"
          accept="image/*"
          onChange={handleFileChange}
          className="fileInput"
        />
        {preview && <img src={preview} alt="미리보기" className="previewMannequin" />}
        <button type="submit" className="submitButton" disabled={loading}>
          {loading ? (polling ? "처리 상태 확인 중..." : "업로드 중...") : "REQUEST"}
        </button>
      </form>
    </div>
  );
}

export default MannequinRegisterPage;
