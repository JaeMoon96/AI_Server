import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react'; // ❗ useState 빠져있었음!
import './mainPage.css';

function MainPage() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(null); // null: 아직 확인 안됨

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
    } else {
      setIsAuthenticated(true);
    }
  }, [navigate]);

  if (!isAuthenticated) return null; // 로그인 확인 전 or 리다이렉트 중이면 아무것도 안 렌더

  return (
    <div id="mainContainer">
      <div className="title">
        <h1><span>그 옷</span>, 여기서 한번 입어보시겠어요?</h1>
        <p>당신의 체형에 맞는 마네킹으로 가상 피팅을 경험해보세요.</p>
      </div>
      <div className="mainButtons">
        <button onClick={() => navigate("/myCloset")} className="primaryButton">
          내 옷장 가기
        </button>
        <button onClick={() => navigate("/virtualFitting")} className="secondaryButton">
          피팅룸 바로가기
        </button>
      </div>
    </div>
  );
}

export default MainPage;
