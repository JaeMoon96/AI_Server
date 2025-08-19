import { useEffect, useState, useRef } from "react";
import ClothCard from "../components/ClothCard";
import ClothDetailPanel from "../components/ClothDetailPanel";
import { useNavigate } from "react-router-dom";
import ClothViewer from "../components/ClothViewer";
import "./myClosetPage.css";
import ClothRegisterPage from "./ClothRegisterPage";
import Modal from "../components/Modal";
// import WeatherInfoPanel from "../components/WeatherInfoPanel"; // 미사용이면 주석

function MyClosetPage() {
  const navigate = useNavigate();

  const [clothes, setClothes] = useState([]);
  const [selectedCloth, setSelectedCloth] = useState(null);
  const [category, setCategory] = useState("all");
  const [subCategory, setSubCategory] = useState("");
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  // ✅ 경로 설정
  const API_BASE = "http://15.165.129.131:3000/api";
  const VIEWER_URL = "http://15.165.129.131:9001/index.html";
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  // ✅ ClothViewer 제어용 ref (postMessage 기반 API만 호출)
  const clothViewerRef = useRef(null);

  const fetchClothes = async (selectedId = null) => {
    if (!token) {
      alert("로그인이 필요합니다.");
      navigate("/login");
      return;
    }

    try {
      const res = await fetch(`${API_BASE.replace(/\/api$/, "")}/api/cloth`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });

      if (res.status === 401) {
        alert("토큰이 유효하지 않습니다. 다시 로그인해주세요.");
        localStorage.removeItem("token");
        navigate("/login");
        return;
      }

      const data = await res.json();
      if (!Array.isArray(data)) {
        console.error("서버에서 배열이 아닌 응답을 받음:", data);
        setClothes([]);
        return;
      }

      setClothes(data);

      if (selectedId) {
        const found = data.find((c) => c._id === selectedId);
        if (found) {
          setSelectedCloth(found);
          console.log("🎯 특정 옷 자동 선택:", found._id);
        }
      } else if (!selectedCloth && data.length > 0) {
        setSelectedCloth(data[0]); // 첫 진입 기본 선택
      }
    } catch (err) {
      console.error("옷 로딩 실패:", err);
    }
  };

  // 등록 성공 시: 목록 갱신 + 해당 아이템 선택
  const handleRegisterSuccess = async (result) => {
    console.log("🎉 옷 등록 성공:", result);
    setShowRegisterModal(false);
    setTimeout(async () => {
      try {
        await fetchClothes(result.clothId);
        console.log("✅ 옷 목록 새로고침 완료");
      } catch (error) {
        console.error("❌ 옷 목록 새로고침 실패:", error);
      }
    }, 300);
  };

  // ✅ Viewer → 부모: 의류 변경 이벤트
  const handleViewerClothingChanged = (outfitId) => {
    console.log("🎯 Viewer에서 의류 변경됨:", outfitId);
    const found = clothes.find((c) => c._id === outfitId);
    if (found) {
      setSelectedCloth(found);
      console.log("✅ Viewer 변경에 따른 선택 옷 동기화:", found.name);
    }
  };

  useEffect(() => {
    fetchClothes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ 선택된 옷이 바뀌면 ClothViewer에 안전하게 전달
  useEffect(() => {
    if (selectedCloth?._id && clothViewerRef.current?.changeOutfit) {
      clothViewerRef.current.changeOutfit(selectedCloth._id);
    }
  }, [selectedCloth]);

  // 필터링
  const filteredClothes = clothes.filter((cloth) => {
    const categoryMatch = category === "all" || cloth.category === category;
    const subCategoryMatch = subCategory === "" || cloth.subCategory === subCategory;
    return categoryMatch && subCategoryMatch;
  });

  // 카드 클릭 → 선택 갱신
  const handleEdit = (cloth) => {
    console.log("🎯 ClothCard 클릭됨:", cloth._id, cloth.name);
    const latest = clothes.find((c) => c._id === cloth._id);
    const selectedClothItem = latest || cloth;
    setSelectedCloth(selectedClothItem);

    console.log("✅ 선택된 옷 정보:", {
      id: selectedClothItem._id,
      name: selectedClothItem.name,
      category: selectedClothItem.category,
      subCategory: selectedClothItem.subCategory,
      modelUrl: selectedClothItem.modelUrl,
    });
  };

  const handleDelete = async (id) => {
    if (!token) return;
    const res = await fetch(`${API_BASE.replace(/\/api$/, "")}/api/cloth`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      body: JSON.stringify({ ids: [id] }),
    });

    if (res.ok) {
      setClothes((prev) => prev.filter((c) => c._id !== id));
      if (selectedCloth?._id === id) {
        setSelectedCloth(null);
        console.log("🗑️ 삭제된 옷이 선택 해제됨");
      }
    }
  };

  return (
    <div className="closet-container">
      <div className="closet-left">
        <div className="closet-second-header">
          <div>
            <select
              value={category}
              onChange={(e) => {
                const next = e.target.value;
                setCategory(next);
                if (next !== "top" && next !== "bottom") setSubCategory("");
              }}
              className="categoryFilter"
            >
              <option value="all">ALL</option>
              <option value="top">TOP</option>
              <option value="bottom">BOTTOM</option>
            </select>

            {category === "top" && (
              <select
                value={subCategory}
                onChange={(e) => setSubCategory(e.target.value)}
                className={`subCategoryFilter ${category === "top" ? "show" : ""}`}
              >
                <option value="">ALL</option>
                <option value="T-shirt">T-Shirt</option>
                <option value="Shirt">Shirt</option>
                <option value="SweatShirt">SweatShirt</option>
                <option value="Hoodie">Hoodie</option>
              </select>
            )}

            {category === "bottom" && (
              <select
                value={subCategory}
                onChange={(e) => setSubCategory(e.target.value)}
                className={`subCategoryFilter ${category === "bottom" ? "show" : ""}`}
              >
                <option value="">ALL</option>
                <option value="Pants">Pants</option>
                <option value="Shorts">Shorts</option>
                <option value="Skirt">Skirt</option>
              </select>
            )}
          </div>

          <button className="register-button" onClick={() => setShowRegisterModal(true)}>
            ENROLL
          </button>
        </div>

        <div className="closet-card-list">
          {filteredClothes.map((cloth) => (
            <ClothCard
              key={cloth._id}
              cloth={cloth}
              onEdit={handleEdit}
              isSelected={!!selectedCloth && selectedCloth._id === cloth._id}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>

      <ClothDetailPanel
        cloth={selectedCloth}
        onUpdate={(updated) => {
          setSelectedCloth(null);
          fetchClothes(updated._id);
        }}
        onDelete={(id) => {
          setClothes((prev) => prev.filter((c) => c._id !== id));
          if (selectedCloth?._id === id) setSelectedCloth(null);
        }}
      />

      <div className="border-panel" />

      {/* ✅ Cloth Viewer: props + ref(postMessage)로만 제어 */}
      <div className="Unity">
       <span>HOW ABOUT THIS?</span>
       
      </div>

      {showRegisterModal && (
        <Modal onClose={() => setShowRegisterModal(false)}>
          <ClothRegisterPage
            onSuccess={handleRegisterSuccess}
            onClose={() => setShowRegisterModal(false)}
          />
        </Modal>
      )}
    </div>
  );
}

export default MyClosetPage;
