// ✅ MyClosetPage.jsx
import { useEffect, useState } from "react";
import ClothCard from "../components/ClothCard";
import ClothDetailPanel from "../components/ClothDetailPanel";
import { useNavigate } from "react-router-dom";
import UnityViewer from "../components/UnityViewer";
import "./myClosetPage.css";
import ClothRegisterPage from "./ClothRegisterPage";
import Modal from "../components/Modal";
import WeatherInfoPanel from "../components/WeatherInfoPanel"

function MyClosetPage() {
  const [clothes, setClothes] = useState([]);
  const [selectedCloth, setSelectedCloth] = useState(null);
  const navigate = useNavigate();
  const [category, setCategory] = useState("all");
  const [subCategory, setSubCategory] = useState("");
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const fetchClothes = async (selectedId = null) => {
  const token = localStorage.getItem("token");
  if (!token) {
    alert("로그인이 필요합니다.");
    navigate("/login");
    return;
  }

  try {
    const res = await fetch("http://15.165.129.131:3000/api/cloth", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
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
      if (found) setSelectedCloth(found);
    }
  } catch (err) {
    console.error("옷 로딩 실패:", err);
  }
};


  useEffect(() => {
    fetchClothes();
  }, []);

  const filteredClothes = clothes.filter((cloth) => {
  // 카테고리 조건
  const categoryMatch = category === "all" || cloth.category === category;
  // 서브카테고리 조건
  const subCategoryMatch = subCategory === "" || cloth.subCategory === subCategory;
  return categoryMatch && subCategoryMatch;
});

  const handleEdit = (cloth) => {
    const latest = clothes.find((c) => c._id === cloth._id);
    setSelectedCloth(latest || cloth);
  };

  const handleDelete = async (id) => {
    const token = localStorage.getItem("token");
    const res = await fetch("http://15.165.129.131:3000/api/cloth", {
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
      if (selectedCloth?._id === id) setSelectedCloth(null);
    }
  };

  return (
    <div className="closet-container">
      <div className="closet-left">
       
        <div className="closet-second-header">
          <div>
        <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
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
              isSelected={selectedCloth?._id === cloth._id}
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
          setSelectedCloth(null);
        }}
      />

      <div className="border-panel"></div>

      {/* <div className="weatherInfoPanel">
        <WeatherInfoPanel></WeatherInfoPanel>
      </div> */}
    
      {showRegisterModal && (
        <Modal onClose={() => setShowRegisterModal(false)}>
          <ClothRegisterPage onSuccess={()=>fetchClothes()} onClose={() => setShowRegisterModal(false)} />
        </Modal>
      )}
    </div>
  );
}

export default MyClosetPage;