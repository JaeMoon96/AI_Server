#!/bin/bash

echo "==== [1] .env 파일 자동 생성 ===="
make_env() {
cat << EOF > "$1/.env"
# Example .env (필요에 맞게 수정)
PORT=$2
DB_CONNECT=mongodb://mongo:27017/mycloset
REDIS_HOST=redis
REDIS_PORT=6379
JWT_SECRET=your_secret
EOF
echo "$1/.env 생성됨"
}
make_env "BackEnd" 3000
make_env "BackEnd_AI" 8000
make_env "FrontEnd_Closet" 5173

echo "==== [2] 의존성 설치 (npm/pip) ===="
cd BackEnd && npm install && cd ..
cd FrontEnd_Closet && npm install && cd ..
cd BackEnd_AI
if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
elif [ -f "environment.yml" ]; then
    conda env create -f environment.yml
fi
cd ..

echo "==== [3] Docker Compose Build & Up ===="
docker-compose down --remove-orphans
docker-compose up --build -d

echo "==== [4] 모든 서비스 상태 확인 ===="
docker-compose ps

# 서버 퍼블릭 IP 자동 추출 (EC2 기준)
IP=$(curl -s http://checkip.amazonaws.com)

echo "==== [5] 접속 안내 ===="
echo "  ✅ 백엔드 : http://$IP:3000"
echo "  ✅ AI 서버 : http://$IP:8000"
echo "  ✅ 프론트엔드 : http://$IP (혹은 :5173)"
echo "  ※ Nginx 등 프록시 사용시 실제 접근 주소에 따라 달라질 수 있음"

echo "==== [6] (AI서버) 모델 다운로드 (필요시 직접 추가) ===="
# 예시: bash BackEnd_AI/download.sh

echo "🎉 모든 준비가 완료되었습니다!"
