// ClothRegisterPage.jsx - 큐 없는 간단한 버전
import { useState, useEffect, useRef } from "react";
import "./clothRegisterPage.css";
import LoadingOverlay from "../components/LoadingOverlay";

function ClothRegisterPage({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "top",
    subCategory: "T-shirt",
  });

  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Processing...");
  const [imageFileFront, setImageFileFront] = useState(null);
  const [imageFileBack, setImageFileBack] = useState(null);
  const [previewFront, setPreviewFront] = useState(null);
  const [previewBack, setPreviewBack] = useState(null);

  const cancelledRef = useRef(false);
  
  useEffect(() => {
    cancelledRef.current = false;
    
    return () => {
      cancelledRef.current = true;
      if (previewFront) URL.revokeObjectURL(previewFront);
      if (previewBack) URL.revokeObjectURL(previewBack);
    };
  }, [previewFront, previewBack]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "category") {
      const defaultSubCategory = value === "top" ? "T-shirt" : "Pants";
      setForm((prev) => ({
        ...prev,
        category: value,
        subCategory: defaultSubCategory,
      }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (e.target.name === "front") {
      if (previewFront) URL.revokeObjectURL(previewFront);
      setImageFileFront(file);
      setPreviewFront(URL.createObjectURL(file));
    } else {
      if (previewBack) URL.revokeObjectURL(previewBack);
      setImageFileBack(file);
      setPreviewBack(URL.createObjectURL(file));
    }
  };

  // 🔥 강제 로딩 해제 함수
  const forceStopLoading = () => {
    console.log("🚨 Force stopping loading...");
    setLoading(false);
    cancelledRef.current = true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!imageFileFront || !imageFileBack) {
      alert("앞면과 뒷면 이미지를 모두 업로드해주세요.");
      return;
    }

    // 🔥 로딩 시작
    setLoading(true);
    setLoadingMsg("업로드 중...");
    cancelledRef.current = false;
    
    // 🔥 8분 타임아웃 (landmark 2분 + cloth2tex 5분 + 여유 1분)
    const timeoutId = setTimeout(() => {
      if (loading && !cancelledRef.current) {
        console.log("🚨 8분 강제 타임아웃 실행");
        forceStopLoading();
        alert("⏰ 8분 타임아웃: 작업이 너무 오래 걸리고 있습니다. 다시 시도해주세요.");
      }
    }, 8 * 60 * 1000); // 8분
    
    try {
      console.log("📤 옷 등록 시작...");
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("cloth_front", imageFileFront);
      formData.append("cloth_back", imageFileBack);
      Object.entries(form).forEach(([key, value]) =>
        formData.append(key, value)
      );

      // 🔥 단계별 메시지 업데이트 타이머 설정
      const step1Timer = setTimeout(() => {
        if (!cancelledRef.current) {
          setLoadingMsg("Generating 3D texture... (2/3)");
        }
      }, 15000); // 15초 후
      
      const step2Timer = setTimeout(() => {
        if (!cancelledRef.current) {
          setLoadingMsg("Saving to database... (3/3)");
        }
      }, 60000); // 1분 후

      const response = await fetch("http://15.165.129.131:3000/api/cloth", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        credentials: "include",
      });

      // 타이머 정리
      clearTimeout(step1Timer);
      clearTimeout(step2Timer);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "등록 실패");
      }

      const result = await response.json();
      console.log("✅ 등록 완료:", result);
      
      if (result.success) {
        alert("✅ 옷 등록이 완료되었습니다!");
        onSuccess?.(result);
        onClose?.();
      } else {
        throw new Error(result.error || "등록 실패");
      }
      
    } catch (error) {
      console.error("💥 등록 실패:", error);
      alert(`❌ 등록 실패: ${error.message}`);
    } finally {
      // 🔥 무조건 로딩 해제
      clearTimeout(timeoutId);
      setLoading(false);
      cancelledRef.current = true;
      console.log("🏁 로딩 완전히 해제됨");
    }
  };

  // 🔥 닫기 버튼
  const handleClose = () => {
    if (loading) {
      console.log("🚫 로딩 중 닫기 버튼 클릭, 강제 중단");
      forceStopLoading();
    }
    onClose?.();
  };

  return (
    <div className="cloth-register-page">
      {loading && <LoadingOverlay message={loadingMsg} />}

      <div className="form-wrapper">
        <h2>ENROLL CLOTH</h2>
        <form onSubmit={handleSubmit} className="clothrp">
          <label>IMAGE-FRONT</label>
          <input
            type="file"
            name="front"
            accept="image/*"
            onChange={handleImageChange}
            required
            disabled={loading}
          />
          {previewFront && (
            <img
              src={previewFront}
              alt="front 미리보기"
              className="preview"
            />
          )}

          <label>IMAGE-BACK</label>
          <input
            type="file"
            name="back"
            accept="image/*"
            onChange={handleImageChange}
            required
            disabled={loading}
          />
          {previewBack && (
            <img
              src={previewBack}
              alt="back 미리보기"
              className="preview"
            />
          )}

          <label>NAME</label>
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            required
            disabled={loading}
          />

          <label>DESCRIPTION</label>
          <input
            name="description"
            value={form.description}
            onChange={handleChange}
            disabled={loading}
          />

          <label>CATEGORY</label>
          <select
            name="category"
            value={form.category}
            onChange={handleChange}
            disabled={loading}
          >
            <option value="top">TOP</option>
            <option value="bottom">BOTTOM</option>
          </select>

          <label>SUB CATEGORY</label>
          {form.category === "top" && (
            <select
              name="subCategory"
              value={form.subCategory}
              onChange={handleChange}
              disabled={loading}
            >
              <option value="T-shirt">T-shirt</option>
              <option value="Shirt">Shirt</option>
              <option value="Sweatshirt">Sweatshirt</option>
              <option value="Hoodie">Hoodie</option>
            </select>
          )}

          {form.category === "bottom" && (
            <select
              name="subCategory"
              value={form.subCategory}
              onChange={handleChange}
              disabled={loading}
            >
              <option value="Pants">Pants</option>
              <option value="Shorts">Shorts</option>
              <option value="Skirt">Skirt</option>
            </select>
          )}

          <button 
            type="submit" 
            className="enrollButton"
            disabled={loading}
          >
            {loading ? "Processing..." : "ENROLL"}
          </button>
          
          <button
            type="button"
            onClick={handleClose}
            className="modal-close"
            title={loading ? "강제 중단 및 닫기" : "닫기"}
          >
            ✖
          </button>
          
          {/* 🔥 로딩 중 강제 중단 버튼 */}
          {loading && (
            <button
              type="button"
              onClick={forceStopLoading}
              className="force-stop-button"
              style={{
                backgroundColor: '#ff4444',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                marginTop: '10px',
                cursor: 'pointer'
              }}
            >
              ⏹️ 강제 중단
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

export default ClothRegisterPage;