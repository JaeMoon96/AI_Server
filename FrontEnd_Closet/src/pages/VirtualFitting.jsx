import { useEffect } from "react";
import { fetchClothesByCategory } from "../api/fetchClothes";

function VirtualFitting() {
  useEffect(() => {
    async function loadClothesAndSendToUnity() {
      const topClothes = await fetchClothesByCategory("top");
      const bottomClothes = await fetchClothesByCategory("bottom");

      // Unity로 옷 데이터 전송
      if (window.UnityInstance) {
        window.UnityInstance.SendMessage(
          "GameManager",
          "ReceiveTopClothesJson",
          JSON.stringify(topClothes)
        );

        window.UnityInstance.SendMessage(
          "GameManager",
          "ReceiveBottomClothesJson",
          JSON.stringify(bottomClothes)
        );
      } else {
        console.warn("UnityInstance가 아직 로드되지 않았습니다.");
      }
    }

    // Unity 로드 완료 후 전송 (간단하게 2초 딜레이 처리)
    const timeout = setTimeout(() => {
      loadClothesAndSendToUnity();
    }, 2000);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <iframe
      src="/Build/index.html"
      title="Unity Fitting Room"
      width="100%"
      height="100%"
    />
  );
}

export default VirtualFitting;
