// ClothCard.jsx
import './clothCard.css'

function ClothCard({ cloth, onEdit, isSelected }) {
  // 🔥 이미지 URL 생성 함수
  const getImageUrl = (cloth) => {
  if (!cloth.imageUrlFront || !cloth.userId) {
    console.log("❌ Missing data:", { imageUrlFront: cloth.imageUrlFront, userId: cloth.userId });
    return "/placeholder-image.png";
  }
     
  const filename = cloth.imageUrlFront.includes('/') 
    ? cloth.imageUrlFront.split('/').pop()
    : cloth.imageUrlFront;
     
  const url = `http://15.165.129.131:3000/api/images/cloth/${cloth.userId}/${cloth._id}/${filename}`;
  console.log("🔗 Generated URL:", url);
  return url;
};
console.log("🔍 Cloth data:", {
  _id: cloth._id,
  imageUrlFront: cloth.imageUrlFront,
  imageUrlBack: cloth.imageUrlBack,
  userId: cloth.userId
});


  return (
    <div
      className={`cloth-card ${isSelected ? "selected" : ""}`}
      onClick={() => onEdit(cloth)}
    >
      <img 
        src={getImageUrl(cloth)} 
        alt={cloth.name}
        onError={(e) => {
          console.log("이미지 로드 실패:", e.target.src);
          e.target.src = "/placeholder-image.png"; // 실패 시 기본 이미지
        }}
      />
      <p>{cloth.name}</p>
    </div>
  );
}

export default ClothCard;