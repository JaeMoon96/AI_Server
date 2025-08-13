import './myPage.css';
import { useState, useEffect, useRef } from "react";
import UnityViewer from '../components/UnityViewer'
import MyMenu from '../components/MyMenu'
import Modal from '../components/Modal';
import MannequinRegisterPage from './MannequinRegisterPage'


function MyPage() {
  const token = localStorage.getItem("token");
  const [formData, setFormData] = useState({
    hasMannequin: false,
    email: "",
    name: "",
    height: 0,
    weight: 0,
    gender: null
  });

  const [userInfo, setUserInfo] = useState(null);  // 🔥 user 상태 추가
  const [clothInfo, setClothInfo] = useState(null);
  const [modify, setModify] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false)
  const isFirstLoad = useRef(true);

  useEffect(() => {
    const loadData = async () => {
      const data = await fetchMyInfo();
      if (!data.user.hasMannequin && isFirstLoad.current) {
      const wannaTry = window.confirm("마네킹이 없습니다. 하나 만드시겠습니까?");
      if (wannaTry) {
        setShowEnroll(true);
      }
      isFirstLoad.current = false; // ✅ 직접 바꾸고 끝
    }
      setFormData({
        email: data.user.email,
        name: data.user.name,
        height: data.user.height,
        weight: data.user.weight,
        gender: data.user.gender,
      });
      setUserInfo(data.user); //
      const clothData = await fetchClothInfo();
      setClothInfo(clothData);
    };

    loadData();
  }, []);


  const topCounts = {
  'T-shirt': 0,
  'Shirt': 0,
  'Sweatshirt': 0,
  'Hoodie': 0,
};
const bottomCounts = {
  'Pants': 0,
  'Shorts': 0,
  'Skirt': 0,
};

if (Array.isArray(clothInfo)) {
  clothInfo.forEach(c => {
    if (c.category === 'top' && topCounts[c.subCategory] !== undefined) {
      topCounts[c.subCategory]++;
    } else if (c.category === 'bottom' && bottomCounts[c.subCategory] !== undefined) {
      bottomCounts[c.subCategory]++;
    }
  });
}
//   const fetchMyCloth
  const deleteMyInfo = async () => {
    const res = await fetch(`http://15.165.129.131:3000/me`, )
  }


const fetchMyInfo = async () => {
  const res = await fetch(`http://15.165.129.131:3000/auth/me`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
  });

  if (!res.ok) {
    console.error("❌ 사용자 정보 가져오기 실패:", res.status);
    return null;
  }

  const data = await res.json();
  return data;
};

const modifyMyInfo = async () => {
  const res = await fetch(`http://15.165.129.131:3000/auth/me`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(formData),
  });

  const data = await res.json();

  if (res.ok) {
    setUserInfo(data.user);  // 서버가 수정된 user 반환한다면
    setModify(false);
  } else {
    alert("수정 실패: " + data.message || "알 수 없는 에러");
  }
};

  const fetchClothInfo = async () => {
    const res = await fetch(`http://15.165.129.131:3000/api/cloth`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    })

    const data = await res.json();
    return data;
  }  

  //   const data = await res.json();
  //   setUserInfo(data.user);     // ← 서버 응답이 있다면 이걸로 최신 상태 반영
  //   setModify(false);     
  // };

  return (
        <div className="MyPage">
        <div className="info">
            <div className="mannequin">
            <span>MY MANNEQUIN</span>
            <div className="mannequin3D">
              <UnityViewer></UnityViewer>
            </div>
            </div>
            <div className="infoWindow">
                <div className="infoWindowDesc">
                  <div className="shibal">
                <span className="titleOfInformation">MY INFO</span>
                
            {userInfo && (
    <div className="information">
        {/* EMAIL은 수정 안 하니까 그대로 보여주기 */}
        <div>
        <span>E-MAIL</span>
        <span>
            {modify ? (
                <input
                type="text"
                value={formData.email}
                onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                }
                />
            ) : (
                <span>{userInfo.email}</span>
            )}
        </span>
        </div>


        {/* NAME */}
        <div>
        <span>NAME</span>
        <span>
            {modify ? (
                <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                }
                />
            ) : (
                <span>{userInfo.name}</span>
            )}
        </span>
        </div>

        {/* HEIGHT */}
        <div>
        <span>HEIGHT</span>
        <span>
            {modify ? (
            <input
            type="number"
            value={formData.height}
            onChange={(e) =>
                setFormData({ ...formData, height: Number(e.target.value) })
            }
            />
        ) : (
            <span>{userInfo.height}</span>
        )}
        </span>
        </div>

        {/* WEIGHT */}
        <div>
        <span>WEIGHT</span>
        <span>
            {modify ? (
            <input
            type="number"
            value={formData.weight}
            onChange={(e) =>
                setFormData({ ...formData, weight: Number(e.target.value) })
            }
            />
        ) : (
            <span>{userInfo.weight}</span>
        )}
        </span>
        </div>

        {/* GENDER */}
        <div>
        <span>GENDER</span>
        <span>
            {modify ? (
            <select
            value={formData.gender}
            onChange={(e) =>
                setFormData({ ...formData, gender: e.target.value })
            }
            >
            <option value="남">MALE</option>
            <option value="여">FEMALE</option>
            </select>
        ) : (
            <span>{userInfo.gender === "남" ? "MALE" : "FEMALE"}</span>
        )}
        </span>
        </div>

        {/* 버튼 영역 */}
        <div className="ButtonMyInfo">
        {modify ? (
            <>
            <button onClick={modifyMyInfo}>SAVE</button>
            <button onClick={() => setModify(false)}>CANCEL</button>
            </>
        ) : (
            <button onClick={() => setModify(true)}>MODIFY</button>
        )}
        </div>
    </div>
    )}
                
            </div>
            <div className="ClosetPanel">
              <span className="titleOfInformation">MY CLOSET</span>
              <div className="tlqkf2">
              
              <div className="allInfo">
              <div className="topInfo">
                <div><span>T-Shirt</span><span>{topCounts["T-shirt"]}</span></div>
                <div><span>Shirt</span><span>{topCounts["Shirt"]}</span></div>
                <div><span>Sweatshirt</span><span>{topCounts["Sweatshirt"]}</span></div>
                <div><span>Hoodie</span><span>{topCounts["Hoodie"]}</span></div>
                <div className='calcTop'><span>TOP</span><span>{Object.values(topCounts).reduce((a,b)=> a+b, 0)}</span></div>
              </div>
              <div className="bottomInfo">
                <div><span>Pants</span><span>{bottomCounts["Pants"]}</span></div>
                <div><span>Shorts</span><span>{bottomCounts["Shorts"]}</span></div>
                <div><span>Skirt</span><span>{bottomCounts["Skirt"]}</span></div>
                <div><span></span><span></span></div>
                <div className='calcBottom'><span>BOTTOM</span><span>{Object.values(bottomCounts).reduce((a,b)=> a+b, 0)}</span></div>
              </div>
              
              </div>
              <div className="emptyInfo">

              </div>
              </div>
            </div>
            </div>
            <div className="border"></div>
            {userInfo && (
                  <MyMenu
                    userInfo={userInfo}
                    onOpen={() => {
                      if(userInfo.hasMannequin==false){
                        setShowEnroll(true)
                      } else {
                        alert("You already have mannequin");
                        return;
                      }} 
                      }
                      
                    onSuccess={async () => {
                      const updated = await fetchMyInfo();
                      setUserInfo(updated.user);
                    }}
                  />
                )}
            {showEnroll && (
              <Modal onClose={() => setShowEnroll(false)}>
                <MannequinRegisterPage
                  onSuccess={async () => {
                  console.log("✅ Mannequin 등록 완료됨, fetchMyInfo 호출");
                  const updated = await fetchMyInfo();
                  if (updated && updated.user) {
                    setUserInfo(updated.user);
                    setShowEnroll(false);
                  } else {
                    alert("유저 정보를 불러오는 데 실패했습니다.");
                  }
                }}
                />
              </Modal>
            )}
            </div>
            
        </div>
        </div>
    );
}

export default MyPage;
