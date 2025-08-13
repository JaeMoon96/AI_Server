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
  const [loadingMsg, setLoadingMsg] = useState("Making Cloth 3D Model");
  const [imageFileFront, setImageFileFront] = useState(null);
  const [imageFileBack, setImageFileBack] = useState(null);
  const [previewFront, setPreviewFront] = useState(null);
  const [previewBack, setPreviewBack] = useState(null);

  // 폴링 중 컴포넌트 unmount / 모달 닫힘 대응
  const cancelledRef = useRef(false);
  useEffect(() => {
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

  async function pollStatus(jobId, onDone, onError) {
  try {
    if (!jobId) throw new Error("jobId가 비어 있습니다.");

    while (true) {
      if (cancelledRef.current) return;

      const token = localStorage.getItem("token");
      const r = await fetch(
        `http://15.165.129.131:3000/api/cloth/status/${jobId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );
      const data = await r.json();
      if (cancelledRef.current) return;

      if (data.status === "not_found")
        throw new Error("작업을 찾을 수 없습니다.");

      if (data.stage === "predict")
        setLoadingMsg("Detecting landmarks...");
      if (data.stage === "cloth2tex")
        setLoadingMsg("Generating texture (Cloth2Tex)...");

      if (data.status === "completed") {
        await onDone?.(data); // async 콜백이면 기다림
        return;
      }
      if (data.status === "failed")
        throw new Error(data.error || "failed");

      await new Promise((res) => setTimeout(res, 2000));
    }
  } catch (e) {
    try {
      if (!cancelledRef.current) await onError?.(e);
    } catch {}
    return;
  }
}


  const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);
  setLoadingMsg("Uploading images...");

  if (!imageFileFront || !imageFileBack) {
    alert("앞면과 뒷면 이미지를 모두 업로드해주세요.");
    return;
  }

  try {
    const token = localStorage.getItem("token");

    const formData = new FormData();
    formData.append("cloth_front", imageFileFront);
    formData.append("cloth_back", imageFileBack);
    Object.entries(form).forEach(([key, value]) =>
      formData.append(key, value)
    );

    const res = await fetch("http://15.165.129.131:3000/api/cloth", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      credentials: "include",
    });

    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || "옷 등록 실패");

    const predictJobId = payload?.jobs?.predictJobId;
    const cloth2texJobId = payload?.jobs?.cloth2texJobId || payload?.clothId;

    setLoadingMsg("Queued. Starting pipeline...");

    await pollStatus(
      predictJobId,
      async () => {
        await pollStatus(
          cloth2texJobId,
          async (done) => {
            if (cancelledRef.current) return;
            setLoading(false);
            alert("ENROLL COMPLETE!");
            onSuccess?.(done?.result);
            onClose?.();
          },
          async (err) => {
            if (cancelledRef.current) return;
            setLoading(false);
            alert("❌ Cloth2Tex 실패: " + err.message);
          }
        );
      },
      async (err) => {
        if (cancelledRef.current) return;
        setLoading(false);
        alert("❌ 예측 실패: " + err.message);
      }
    );
  } catch (err) {
    if (!cancelledRef.current) {
      console.error("등록 에러:", err);
      alert("❌ 등록 중 오류가 발생했습니다.");
    }
  } finally {
    if (!cancelledRef.current) setLoading(false); // 어떤 경우에도 로딩 해제
  }
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
          />

          <label>DESCRIPTION</label>
          <input
            name="description"
            value={form.description}
            onChange={handleChange}
          />

          <label>CATEGORY</label>
          <select
            name="category"
            value={form.category}
            onChange={handleChange}
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
            >
              <option value="Pants">Pants</option>
              <option value="Shorts">Shorts</option>
              <option value="Skirt">Skirt</option>
            </select>
          )}

          <button type="submit" className="enrollButton">
            ENROLL
          </button>
          <button
            type="button"
            onClick={onClose}
            className="modal-close"
          >
            ✖
          </button>
        </form>
      </div>
    </div>
  );
}

export default ClothRegisterPage;
