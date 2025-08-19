import { useEffect, useRef } from 'react';

const BACKEND = "http://15.165.129.131:3000";
const VIEWERS = { 
    avatar: "avatar-viewer", 
    cloth: "cloth-viewer", 
    closet: "closet-viewer" 
};

function UnityViewer({ viewer = "cloth", outfitId, onClothingChanged }) {
    const iframeRef = useRef(null);
    const token = localStorage.getItem("token") || "";
    
    // 🔥 iframe URL 생성
    const base = `${BACKEND}/unity/${VIEWERS[viewer]}/index.html`;
    const qs = new URLSearchParams({
        apiBase: `${BACKEND}/api`,
        token,
    });
    
    if (outfitId) {
        qs.set("selectedId", outfitId);
    }
    
    const iframeUrl = `${base}?${qs.toString()}`;

    // 🔥 outfitId 변경 감지 및 Unity 호출
    useEffect(() => {
        if (outfitId && iframeRef.current) {
            // iframe이 로드된 후 약간의 딜레이를 두고 의류 변경 요청
            const timer = setTimeout(() => {
                try {
                    const iframe = iframeRef.current;
                    if (iframe.contentWindow && iframe.contentWindow.changeClothing) {
                        const success = iframe.contentWindow.changeClothing(outfitId);
                        console.log('🎯 의류 변경 요청:', outfitId, success ? '성공' : '실패');
                    }
                } catch (error) {
                    console.error('❌ Unity 의류 변경 실패:', error);
                }
            }, 2000); // Unity 완전 로드 대기

            return () => clearTimeout(timer);
        }
    }, [outfitId]);

    // 🔥 iframe 메시지 수신 (Unity → React 통신)
    useEffect(() => {
        const handleMessage = (event) => {
            // 보안: 올바른 origin에서 온 메시지만 처리
            if (!event.origin.includes('15.165.129.131:3000')) return;
            
            const { type, data } = event.data || {};
            
            if (type === 'unityClothingChanged' && onClothingChanged) {
                onClothingChanged(data.outfitId);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [onClothingChanged]);

    return (
        <div style={{ width: '100%', height: '100%', background: '#231F20' }}>
            <iframe
                ref={iframeRef}
                key={iframeUrl} // URL 변경시 iframe 재로드
                title="Unity Cloth Viewer"
                src={iframeUrl}
                width="100%"
                height="100%"
                style={{ 
                    border: 'none', 
                    background: '#231F20',
                    display: 'block'
                }}
                allowFullScreen
                onLoad={() => {
                    console.log('✅ Unity iframe 로드 완료');
                }}
                onError={(error) => {
                    console.error('❌ Unity iframe 로드 실패:', error);
                }}
            />
        </div>
    );
}

export default UnityViewer;