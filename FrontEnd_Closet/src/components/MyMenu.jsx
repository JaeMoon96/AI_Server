import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import './myMenu.css'

function MyMenu({onOpen, onSuccess, userInfo}) {
    const token = localStorage.getItem("token"); // ✅ 가져오기
    const navigate = useNavigate();   
    const deleteAccount = async () => {
    const flag = window.confirm("Do you really wanna delete it?")
    if (!flag) {
        return;
    }      

    try {
    const res = await fetch(`http://15.165.129.131t:3000/auth/me`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    });

    const data = await res.json();

    if (res.ok) {
      alert("계정이 성공적으로 삭제되었습니다.");
      localStorage.removeItem("token"); // 로그인 토큰 삭제
      navigate("/"); // 또는 /login 등으로 이동
    } else {
      alert("삭제 실패: " + data.message);
    }
  } catch (error) {
    console.error("계정 삭제 오류:", error);
    alert("서버 오류로 계정을 삭제할 수 없습니다.");
  }
};

    const deleteMannequin = async () => {
  // 이미 없는 경우 사전 차단
  if (!userInfo?.hasMannequin) {
    alert("이미 마네킹이 없습니다.");
    return;
  }

  const flag = window.confirm("정말 마네킹을 삭제하시겠습니까?");
  if (!flag) return;

  try {
    const res = await fetch("http://15.165.129.131:3000/api/mannequin/delete-mannequin", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    });

    const data = await res.json();

    if (res.ok) {
      alert("마네킹이 성공적으로 삭제되었습니다.");
      // 상태 갱신
      onSuccess();
    } else {
      alert(`삭제 실패: ${data.message || "서버 오류"}`);
    }
  } catch (err) {
    console.error("삭제 요청 오류:", err);
    alert("네트워크 오류가 발생했습니다.");
  }
};



    return <div className="MyMenuStart">
        
        <div className="SelectMenu">
            <div className="MyMenuTitle"><h3>MY MENU</h3></div>
            <div className="AboutMannequin">
            <div className="AboutMannequinTitle">MANENEQUIN</div>
            <div className="AboutMannequinSelect">
            <div onClick={onOpen}><span>MAKE NEW MANNEQUIN</span></div>
            <div onClick={deleteMannequin}><span>DELETE MANNEQUIN</span></div>
            </div>
            </div>
            <div className="AboutCloth">
            <div className="AboutClothTitle">CLOTH</div>
            <div className="AboutClothSelect">
            <div><span>MY COMMITS</span></div>
            <div><span>MY PREFER</span></div>
            </div>
            </div>
            <div className="AboutAccount">
            <div className="AboutAccountTitle">ACCOUNT</div>
            <div className="AboutAccountSelect">
            <div onClick={()=> navigate("/change-password")}><span>CHANGE PASSWORD</span></div>
            <div onClick={deleteAccount}><span>DELETE ACCOUNT</span></div>
            </div>
            </div>
        </div>
        
    </div>
}

export default MyMenu;