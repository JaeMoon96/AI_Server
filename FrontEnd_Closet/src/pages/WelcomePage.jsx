// WelcomePage.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function WelcomePage() {
  const navigate = useNavigate();
  const isLoggedIn= localStorage.getItem("token");
  useEffect(() => {
    if (isLoggedIn) {
      navigate("/main");
    } else {
      navigate("/login"); // 또는 "/welcome" 자체 유지도 가능
    }
  }, [isLoggedIn, navigate]);

  return null; // 이동만 하고 아무것도 안 보여줘도 됨
}

export default WelcomePage;
