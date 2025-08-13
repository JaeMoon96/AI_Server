import { useEffect, useState } from "react";

function MannequinRegisterPage({ onSuccess }) {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setImage(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!image) {
      alert("이미지를 선택해주세요.");
      return;
    }

    const formData = new FormData();
    formData.append("mannequin", image);
    const token = localStorage.getItem("token");

    try {
      setLoading(true);
      const res = await fetch("http://15.165.129.131:3000/api/mannequin/make-3d", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setPolling(true); // ✅ 상태 조회 시작
      } else {
        alert("생성 실패: " + data.message);
        setLoading(false);
      }
    } catch (err) {
      console.error("업로드 오류", err);
      alert("서버 오류 발생");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!polling) return;

    const token = localStorage.getItem("token");
    const userId = JSON.parse(atob(token.split(".")[1])).id; // JWT에서 userId 추출

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://15.165.129.131:3000/api/mannequin/status?userId=${userId}`);
        const data = await res.json();

        if (data.status === "completed") {
          clearInterval(interval);
          setLoading(false);
          alert("3D 마네킹 생성 완료!");
          onSuccess(); // modelUrl 전달하고 싶으면 data.modelUrl도 넘겨줘
        } else if (data.status === "failed") {
          clearInterval(interval);
          setLoading(false);
          alert("생성 실패: " + data.error);
        }
      } catch (err) {
        console.error("상태 조회 실패", err);
      }
    }, 3000); // 3초마다 상태 조회

    return () => clearInterval(interval); // cleanup
  }, [polling]);



  return (
    <div className="MannequinRegisterPage">
      {loading && <LoadingOverlay message="Making New Mannequin" />}
      <h2 className="MannequinTitle">ENROLL MANNEQUIN</h2>
      <form onSubmit={handleSubmit} className="formWrapper">
        <input
          type="file"
          name="mannequin"
          accept="image/*"
          onChange={handleFileChange}
          className="fileInput"
        />
        {preview && (
          <img
            src={preview}
            alt="미리보기"
            className="previewMannequin"
          />
        )}
        <button type="submit" className="submitButton">
          REQUEST
        </button>
      </form>
    </div>
  );
}

export default MannequinRegisterPage;
